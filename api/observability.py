"""Observabilidad del banco: middleware de telemetría y rutas que usa la Consola (R11).

- El middleware registra cada petición de la API (no las de la propia Consola ni los flujos
  en vivo) con su origen, dispositivo, duración, cuerpos y las señales del mecanismo.
- /telemetry/*: resumen con métricas y series, peticiones recientes y alertas deducidas.
- /bank/accounts: cuentas con lo que guarda el banco, su estado y fechas observadas.
- /lab/tests y /lab/results: resultados de las pruebas y de los experimentos ya generados.
"""

import json
import time
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request, Response, status

from infra.telemetry import RequestScope, current_scope

ROOT = Path(__file__).resolve().parent.parent
RESULTS_DIR = ROOT / "results"
TEST_REPORT = RESULTS_DIR / "tests.json"
RESULT_SUFFIXES = (".json", ".png", ".csv")
UNOBSERVED_PREFIXES = ("/events", "/telemetry", "/consola", "/results", "/docs", "/openapi.json", "/redoc",
                       "/lab/tests", "/lab/results", "/favicon")
FORWARDED_HEADER = "X-Forwarded-For"
DEVICE_HEADER = "X-Device"
UNKNOWN_DEVICE = "desconocido"
MAX_BODY_CHARS = 4_000
MAX_PAGE = 2_000


def _decode(raw: bytes) -> Any:
    if not raw:
        return None
    text = raw.decode("utf-8", errors="replace")
    try:
        return json.loads(text)
    except ValueError:
        return text[:MAX_BODY_CHARS]


def _client(request: Request) -> str:
    forwarded = request.headers.get(FORWARDED_HEADER)
    if forwarded:
        return forwarded.split(",")[0].strip()
    return f"{request.client.host}:{request.client.port}" if request.client else "desconocido"


def _mechanism(path: str, scope: RequestScope, mechanism_ids: frozenset[str]) -> str | None:
    named = [item.mechanism for item in scope.signals if item.mechanism]
    if named:
        return named[-1]
    first = path.strip("/").split("/")[0]
    return first if first in mechanism_ids else None


def telemetry_middleware(mechanism_ids: frozenset[str], correlation_header: str):
    """Crea el middleware que registra cada petición observada en ctx.telemetry. Cubre R11."""

    async def middleware(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        path = request.url.path
        if request.method == "OPTIONS" or path.startswith(UNOBSERVED_PREFIXES):
            return await call_next(request)
        raw = await request.body()
        scope = RequestScope()
        token = current_scope.set(scope)
        start = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            current_scope.reset(token)
        body = b"".join([chunk async for chunk in response.body_iterator])  # type: ignore[attr-defined]
        route = getattr(request.scope.get("route"), "path", path)
        request.app.state.bank.ctx.telemetry.record(
            method=request.method, path=path, route=route, status=response.status_code,
            duration_ms=round((time.perf_counter() - start) * 1000, 2), client=_client(request),
            user_agent=request.headers.get("user-agent", ""),
            device=request.headers.get(DEVICE_HEADER, UNKNOWN_DEVICE),
            correlation_id=request.headers.get(correlation_header), mechanism=_mechanism(path, scope, mechanism_ids),
            request_body=_decode(raw), response_body=_decode(body), signals=tuple(scope.signals))
        return Response(content=body, status_code=response.status_code, headers=dict(response.headers),
                        media_type=response.media_type)

    return middleware


def _state(request: Request):
    return request.app.state.bank


router = APIRouter(tags=["observabilidad"])


@router.get("/telemetry/summary", summary="Métricas del banco en una ventana de tiempo")
def telemetry_summary(request: Request, window: int = Query(900, ge=60, le=86_400),
                      bucket: int = Query(30, ge=5, le=3_600)) -> dict[str, Any]:
    """Peticiones por minuto, latencias p50/p95, totales, señales, series y estadística por ruta. Cubre R11."""
    return _state(request).ctx.telemetry.summary(window, bucket)


@router.get("/telemetry/requests", summary="Peticiones recientes tal como las vio el banco")
def telemetry_requests(request: Request, since: int = 0,
                       limit: int = Query(500, ge=1, le=MAX_PAGE)) -> list[dict[str, Any]]:
    """Cada petición con origen, dispositivo, duración, cuerpos y señal. Nunca contiene x. Cubre R11."""
    return [record.to_json() for record in _state(request).ctx.telemetry.requests_since(since, limit)]


@router.get("/telemetry/alerts", summary="Alertas de seguridad deducidas")
def telemetry_alerts(request: Request) -> list[dict[str, Any]]:
    """Repeticiones, bloqueos, pruebas inválidas o viejas y cuerpos mal formados, con evidencia. Cubre R9 y R11."""
    return [alert.to_json() for alert in _state(request).ctx.telemetry.alerts()]


def _status_of(server: Any) -> dict[str, dict[str, Any]]:
    describe = getattr(server, "account_status", None)
    return describe() if callable(describe) else {}


@router.get("/bank/accounts", summary="Cuentas: lo que guarda el banco, estado y actividad")
def bank_accounts(request: Request) -> list[dict[str, Any]]:
    """Por mecanismo y usuario: credencial guardada, estado, intentos y fechas observadas. Cubre R2 y R9."""
    state = _state(request)
    rows = []
    for mechanism_id, server in state.servers.items():
        statuses = _status_of(server)
        for user_id, stored in server.stored_credentials().items():
            created, last_login = state.ctx.telemetry.account_times(mechanism_id, user_id)
            info = statuses.get(user_id, {})
            rows.append({"mechanism": mechanism_id, "user_id": user_id, "stored": stored,
                         "status": info.get("status", "activa"), "attempts_left": info.get("attempts_left"),
                         "created_at": created, "last_login_at": last_login})
    return rows


def locked_counter(state: Any) -> Callable[[], int]:
    """Función que cuenta las cuentas bloqueadas de todos los mecanismos (para el resumen)."""
    def count() -> int:
        return sum(1 for server in state.servers.values()
                   for info in _status_of(server).values() if info.get("status") == "bloqueada")
    return count


@router.get("/lab/tests", summary="Resultado de la última ejecución de las pruebas")
def lab_tests() -> dict[str, Any]:
    """results/tests.json, que escribe pytest al terminar (trazabilidad R1–R11). Cubre R11."""
    try:
        return json.loads(TEST_REPORT.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            "Todavía no hay resultados: ejecute  python -m pytest") from error


@router.get("/lab/results", summary="Archivos de resultados de los experimentos")
def lab_results() -> list[str]:
    """Gráficas y tablas ya generadas en results/ (se descargan desde /results/<archivo>). Cubre R7 y R10."""
    if not RESULTS_DIR.is_dir():
        return []
    return sorted(p.name for p in RESULTS_DIR.iterdir() if p.suffix in RESULT_SUFFIXES)
