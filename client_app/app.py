"""Proceso del celular: la app bancaria de Ana, la laptop de Eve y el Escenario (R10, R11).

Es un proceso aparte del banco, como en la vida real: guarda los secretos de Ana (x) y habla
con el banco por HTTP. El Escenario (web/dist, React) propone cada acto y pide «siguiente
paso»; este proceso lo ejecuta de verdad y el banco solo ve las peticiones que le llegan.

Ejecutar desde la raíz:  BANK_URL=http://127.0.0.1:8000 uvicorn client_app.app:app --port 8001
(o todo junto con  python lab.py ).
"""

import os
import threading
from pathlib import Path
from typing import Annotated, Any

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import Field

from client_app.acts.catalog import ACTS
from client_app.acts.engine import ActFinishedError, ActManager, ActRun
from client_app.gateway import DIRECTOR, EVE_LAPTOP, SUPPORT, BankGateway
from client_app.groups import group_options
from infra.events import EventLog
from infra.sse import sse_response
from mechanisms.base import StepError
from mechanisms.common import StrictRequest, UserId
from mechanisms.registry import create_clients

BANK_URL_ENV = "BANK_URL"
DEFAULT_BANK_URL = "http://127.0.0.1:8000"
HTTP_TIMEOUT_SECONDS = 60
WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"
SCENARIO_PAGE = WEB_DIST / "escenario.html"
NOT_BUILT = ("<!doctype html><meta charset='utf-8'><title>Schnorr Lab</title><body style='font-family:sans-serif'>"
             "<h1>Falta compilar el Escenario</h1><p>Ejecute <code>cd web &amp;&amp; npm ci &amp;&amp; npm run build"
             "</code> y recargue.</p>")


class LabResetRequest(StrictRequest):
    group: str | None = Field(default=None, examples=["toy", "rfc-2048"])


class ActRequest(StrictRequest):
    act: str = Field(examples=["login", "espia_respuesta"])
    user_id: UserId = "ana"


class PhoneState:
    """Estado del proceso: canales de Ana y Eve al banco, secretos del celular y actos."""

    def __init__(self, bank_url: str, http: httpx.Client) -> None:
        self.bank_url = bank_url.rstrip("/")
        self.http = http
        self.events = EventLog()
        self.mechanisms = create_clients()
        self.wallet: dict[tuple[str, str], Any] = {}      # (mecanismo, usuario) → secreto del celular
        self.lock = threading.Lock()
        self.gateway = BankGateway(http, self.events)
        self.eve_gateway = BankGateway(http, self.events, source="atacante", identity=EVE_LAPTOP)
        self.support_gateway = BankGateway(http, self.events, source="sistema", identity=SUPPORT)
        self.acts = ActManager(ACTS, self.mechanisms, self.gateway, self.eve_gateway, self.support_gateway,
                               self.wallet, self.events, self.active_group)

    def reset_lab(self, group: str | None = None) -> str:
        """Reinicia el banco (mismo grupo si group es None) y olvida secretos y capturas.

        Devuelve el id del grupo activo; StepError si el banco no responde o rechaza el grupo.
        """
        try:
            response = self.http.post("/lab/reset", json={"group": group}, headers=DIRECTOR.headers())
        except httpx.HTTPError as error:
            raise StepError(f"El banco no responde: {error}") from error
        if response.status_code != status.HTTP_200_OK:
            raise StepError(response.json().get("reason", "El banco rechazó el reinicio"))
        with self.lock:
            self.wallet.clear()
            self.gateway.clear()
            self.eve_gateway.clear()
        self.events.publish("sistema", "log", "Laboratorio reiniciado: banco y celular desde cero")
        return _zkp_group(response.json())

    def active_group(self) -> str:
        """El grupo que usa el banco ahora (id de opción), o «desconocido» si no responde."""
        try:
            return _zkp_group(self.http.get("/mechanisms").json())
        except (httpx.HTTPError, ValueError, LookupError):
            return "desconocido"

    def wallet_view(self) -> list[dict[str, Any]]:
        """Lo que el celular guarda por cuenta (x incluida). Nunca se envía al banco. Cubre R2."""
        with self.lock:
            return [{"mechanism": mechanism_id, "user_id": user_id,
                     "secret": self.mechanisms[mechanism_id].describe_secret(secret)}
                    for (mechanism_id, user_id), secret in self.wallet.items()]


def _zkp_group(mechanisms: list[dict[str, Any]]) -> str:
    """El grupo (id de opción) que usa el ZKP del banco, según /mechanisms o /lab/reset."""
    zkp = next(m for m in mechanisms if m["id"] == "zkp")
    return str(zkp["server"].get("group_id", ""))


def get_phone(request: Request) -> PhoneState:
    """Dependencia de FastAPI: el estado del celular. Cubre R11."""
    return request.app.state.phone


Phone = Annotated[PhoneState, Depends(get_phone)]


def _register_lab_routes(app: FastAPI) -> None:
    @app.get("/api/config", summary="Configuración del Escenario")
    def config(phone: Phone) -> dict[str, Any]:
        """Dirección del banco, Consola, Swagger, mecanismos, actos y grupos. Cubre R11."""
        return {"bank_url": phone.bank_url, "docs_url": f"{phone.bank_url}/docs",
                "console_url": f"{phone.bank_url}/consola/",
                "mechanisms": [m.info.to_json() for m in phone.mechanisms.values()],
                "acts": phone.acts.catalog(), "groups": list(group_options()), "group": phone.active_group()}

    @app.get("/api/wallet", summary="Secretos guardados en el celular de Ana")
    def wallet(phone: Phone) -> list[dict[str, Any]]:
        """Lo que el celular guarda por cuenta (x incluida): nunca se envía al banco. Cubre R2."""
        return phone.wallet_view()

    @app.get("/api/events", summary="Eventos del celular y de Eve desde un identificador")
    def list_events(phone: Phone, since: int = 0) -> list[dict[str, Any]]:
        """Pasos de los actos y mensajes enviados por Ana y Eve. Cubre R11."""
        return [event.to_json() for event in phone.events.since(since)]

    @app.get("/api/events/stream", summary="Eventos del celular y de Eve en tiempo real (SSE)")
    def stream_events(phone: Phone, request: Request, since: int = 0) -> StreamingResponse:
        return sse_response(phone.events, request, since)

    @app.post("/api/lab/reset", summary="Reiniciar banco y celular")
    def reset(body: LabResetRequest, phone: Phone) -> dict[str, Any]:
        """Reinicia el banco (opcionalmente con otro grupo) y borra secretos y actos. Cubre R7."""
        try:
            group = phone.reset_lab(body.group)
        except StepError as error:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(error)) from error
        with phone.acts.lock:
            phone.acts.clear()
        return {"group": group}


def _run(phone: PhoneState, run_id: str) -> ActRun:
    try:
        return phone.acts.get(run_id)
    except KeyError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No existe el acto {run_id}.") from error


def _register_act_routes(app: FastAPI) -> None:
    @app.get("/api/acts", summary="Actos disponibles para el Escenario")
    def list_acts(phone: Phone) -> list[dict[str, Any]]:
        """Cada acto con su elenco y sus pasos (Ana, Eve). Cubre R10 y R11."""
        return phone.acts.catalog()

    @app.post("/api/acts", status_code=status.HTTP_201_CREATED, summary="Preparar un acto")
    def start_act(body: ActRequest, phone: Phone) -> dict[str, Any]:
        """Reinicia el laboratorio (y registra a Ana si el acto lo pide) y deja el acto listo. Cubre R11."""
        with phone.acts.lock:
            try:
                return phone.acts.start(body.act, body.user_id).to_json()
            except ValueError as error:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, str(error)) from error
            except StepError as error:
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(error)) from error

    @app.get("/api/acts/{run_id}", summary="Estado de un acto")
    def read_act(run_id: str, phone: Phone) -> dict[str, Any]:
        return _run(phone, run_id).to_json()

    @app.post("/api/acts/{run_id}/next", summary="Ejecutar el siguiente paso del acto")
    def next_act_step(run_id: str, phone: Phone) -> dict[str, Any]:
        """Un paso de verdad: un cálculo, un mensaje al banco o una acción de Eve. Cubre R11."""
        with phone.acts.lock:
            run = _run(phone, run_id)
            try:
                run.next()
            except ActFinishedError as error:
                raise HTTPException(status.HTTP_409_CONFLICT, str(error)) from error
            return run.to_json()

    @app.post("/api/acts/{run_id}/run", summary="Ejecutar el resto del acto")
    def run_act(run_id: str, phone: Phone) -> dict[str, Any]:
        with phone.acts.lock:
            run = _run(phone, run_id)
            run.run_all()
            return run.to_json()


def create_client_app(bank_url: str | None = None, bank_http: httpx.Client | None = None) -> FastAPI:
    """Construye el proceso del celular; bank_http permite inyectar un cliente (pruebas). Cubre R11."""
    url = bank_url or os.environ.get(BANK_URL_ENV, DEFAULT_BANK_URL)
    http = bank_http or httpx.Client(base_url=url, timeout=HTTP_TIMEOUT_SECONDS)
    app = FastAPI(title="Schnorr Lab · Celular de Ana y laptop de Eve", version="0.4.0",
                  description="Ejecuta los actos del Escenario: Ana guarda x y Eve ataca, ambas por HTTP.")
    app.state.phone = PhoneState(url, http)
    _register_lab_routes(app)
    _register_act_routes(app)

    @app.get("/", include_in_schema=False, response_model=None)
    def index() -> FileResponse | HTMLResponse:
        return FileResponse(SCENARIO_PAGE) if SCENARIO_PAGE.is_file() else HTMLResponse(NOT_BUILT)

    if (WEB_DIST / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")
    return app


app = create_client_app()
