"""API HTTP del banco: monta los mecanismos de autenticación registrados (R11).

Ejecutar desde la raíz:  uvicorn api.app:app --reload   y abrir http://127.0.0.1:8000/docs
- SCHNORR_GROUP: grupo del ZKP (por defecto «toy», p = 23).
- BANK_CORS_ORIGINS: orígenes de la interfaz que pueden leer las vistas del laboratorio
  (por defecto la app del celular en http://127.0.0.1:8001).
Cada mecanismo aporta sus rutas (/zkp/...); este módulo agrega lo común: qué guarda el banco,
la auditoría de cuerpos recibidos, los eventos en tiempo real y el reinicio del laboratorio.
"""

import os
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, FastAPI, Query, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from api.observability import RESULTS_DIR, locked_counter, telemetry_middleware
from api.observability import router as observability_router
from api.schemas import AuditEntryOut, EventOut, ResetRequest
from api.validation import validation_handler
from infra.events import CORRELATION_HEADER, current_correlation_id
from infra.server_context import ServerContext
from infra.sse import sse_response
from mechanisms.base import ServerMechanism
from mechanisms.common import ErrorResponse, error_response
from mechanisms.registry import create_servers

GROUP_ENV_VAR = "SCHNORR_GROUP"
DEFAULT_GROUP = "toy"
GROUP_SETTING = "zkp_group"
CORS_ENV_VAR = "BANK_CORS_ORIGINS"
DEFAULT_CORS_ORIGINS = "http://127.0.0.1:8001,http://localhost:8001,http://127.0.0.1:5173,http://localhost:5173"
MAX_EVENTS_PAGE = 5_000
PENDING_MESSAGE = "Disponible en el informe final"
WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"
CONSOLE_PAGE = "consola.html"
SWAGGER_VENDOR = WEB_DIST / "vendor" / "swagger"


class BankState:
    """Estado del proceso del banco: el contexto compartido y la parte del banco de cada mecanismo."""

    def __init__(self, ctx: ServerContext, servers: dict[str, ServerMechanism]) -> None:
        self.ctx = ctx
        self.servers = servers

    def audited_paths(self) -> list[tuple[str, str]]:
        """Pares (ruta, mecanismo) cuyos cuerpos se auditan. Cubre R11."""
        return [(path, mechanism_id) for mechanism_id, server in self.servers.items()
                for path in server.audited_paths]


def get_state(request: Request) -> BankState:
    """Dependencia de FastAPI: el estado del banco. Cubre R11."""
    return request.app.state.bank


State = Annotated[BankState, Depends(get_state)]
router = APIRouter(tags=["laboratorio"])


@router.get("/mechanisms", summary="Mecanismos de autenticación disponibles")
def list_mechanisms(state: State) -> list[dict[str, Any]]:
    """Cada mecanismo con sus flujos, pasos y la configuración actual del banco. Cubre R11."""
    return [{**server.info.to_json(), "server": server.describe()} for server in state.servers.values()]


@router.get("/bank/users", summary="Lo que guarda el banco de cada usuario, por mecanismo")
def bank_users(state: State) -> dict[str, dict[str, dict[str, str]]]:
    """Con el ZKP, solo la clave pública y de cada cliente, nunca x. Cubre R2 y R11."""
    return {mechanism_id: server.stored_credentials() for mechanism_id, server in state.servers.items()}


@router.get("/audit/log", response_model=list[AuditEntryOut], summary="Todos los cuerpos recibidos, en orden")
def audit_log(state: State) -> list[AuditEntryOut]:
    """Incluye los cuerpos rechazados por mal formados (valid = false): permite comprobar que x nunca llegó.

    Cubre R11.
    """
    return [AuditEntryOut(**vars(entry)) for entry in state.ctx.audit_entries()]


@router.get("/events", response_model=list[EventOut], summary="Eventos del banco desde un identificador")
def list_events(state: State, since: int = 0, limit: int = Query(500, ge=1, le=MAX_EVENTS_PAGE)) -> list[EventOut]:
    """Lo que el banco recibió y decidió, en orden (para consultar sin conexión en vivo). Cubre R11."""
    return [EventOut(**event.to_json()) for event in state.ctx.events.since(since, limit)]


@router.get("/events/stream", summary="Eventos del banco en tiempo real (Server-Sent Events)")
def stream_events(state: State, request: Request, since: int = 0) -> StreamingResponse:
    """Flujo text/event-stream que la interfaz escucha para mostrar el banco en vivo. Cubre R11."""
    return sse_response(state.ctx.events, request, since)


@router.post("/lab/reset", summary="Reiniciar el banco (solo laboratorio)", response_model=None,
             responses={400: {"model": ErrorResponse}})
def reset_lab(body: ResetRequest, state: State) -> list[dict[str, Any]] | JSONResponse:
    """Borra usuarios, sesiones y auditoría; opcionalmente cambia el grupo del ZKP. Cubre R7 y R11."""
    settings = {GROUP_SETTING: body.group} if body.group else {}
    try:
        for server in state.servers.values():
            server.reset(settings)
    except NotImplementedError as error:
        return error_response(status.HTTP_400_BAD_REQUEST, f"{PENDING_MESSAGE}: {error}")
    except ValueError as error:
        return error_response(status.HTTP_400_BAD_REQUEST, str(error))
    state.ctx.clear_audit()
    state.ctx.events.publish("sistema", "log", f"Banco reiniciado{f' con el grupo {body.group}' if body.group else ''}")
    return list_mechanisms(state)


async def correlation_middleware(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    """Copia X-Correlation-Id de la petición a los eventos que el banco publique al atenderla. Cubre R11."""
    token = current_correlation_id.set(request.headers.get(CORRELATION_HEADER))
    try:
        return await call_next(request)
    finally:
        current_correlation_id.reset(token)


def _cors_origins(configured: str | None) -> list[str]:
    raw = configured if configured is not None else os.environ.get(CORS_ENV_VAR, DEFAULT_CORS_ORIGINS)
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def _mount_console(app: FastAPI) -> None:
    """Sirve la Consola del banco (web/dist) en /consola/ si ya está compilada. Cubre R11."""
    page = WEB_DIST / CONSOLE_PAGE
    if not page.is_file():
        return

    @app.get("/consola", include_in_schema=False)
    @app.get("/consola/", include_in_schema=False)
    def console() -> FileResponse:
        return FileResponse(page)

    app.mount("/consola", StaticFiles(directory=WEB_DIST), name="consola")


def _offline_docs(app: FastAPI) -> None:
    """Swagger con sus archivos locales (funciona sin internet) cuando la web está compilada."""
    if not SWAGGER_VENDOR.is_dir():
        return

    @app.get("/docs", include_in_schema=False)
    def docs() -> HTMLResponse:
        return get_swagger_ui_html(openapi_url="/openapi.json", title=f"{app.title} · Swagger",
                                   swagger_js_url="/consola/vendor/swagger/swagger-ui-bundle.js",
                                   swagger_css_url="/consola/vendor/swagger/swagger-ui.css",
                                   swagger_favicon_url="/consola/vendor/swagger/favicon-32x32.png")


def create_app(group_name: str | None = None, cors_origins: str | None = None) -> FastAPI:
    """Construye el banco con todos los mecanismos registrados; el ZKP usa el grupo indicado. Cubre R11."""
    ctx = ServerContext()
    servers = create_servers(ctx, {GROUP_SETTING: group_name or os.environ.get(GROUP_ENV_VAR, DEFAULT_GROUP)})
    state = BankState(ctx, servers)
    ctx.telemetry.locked_accounts = locked_counter(state)
    offline = SWAGGER_VENDOR.is_dir()
    app = FastAPI(
        title="Schnorr Lab · API del banco",
        version="0.4.0",
        docs_url=None if offline else "/docs",
        description=(
            "Banco del laboratorio de autenticación sin contraseñas. Cada mecanismo tiene sus rutas; "
            "el ZKP de Schnorr está en `/zkp`: `POST /zkp/register` con y → `POST /zkp/login/commit` con t "
            "(devuelve c) → `POST /zkp/login/respond` con s. Todos los enteros viajan como cadenas decimales. "
            "La Consola del banco está en `/consola/`."
        ),
    )
    app.state.bank = state
    app.add_exception_handler(RequestValidationError, validation_handler(ctx, state.audited_paths))
    app.middleware("http")(telemetry_middleware(frozenset(servers), CORRELATION_HEADER))
    app.middleware("http")(correlation_middleware)
    app.add_middleware(CORSMiddleware, allow_origins=_cors_origins(cors_origins), allow_methods=["GET", "POST"],
                       allow_headers=["Content-Type", CORRELATION_HEADER, "Last-Event-ID"])
    for server in servers.values():
        app.include_router(server.router())
    app.include_router(router)
    app.include_router(observability_router)
    RESULTS_DIR.mkdir(exist_ok=True)
    app.mount("/results", StaticFiles(directory=RESULTS_DIR), name="results")
    _mount_console(app)
    _offline_docs(app)
    return app


app = create_app()
