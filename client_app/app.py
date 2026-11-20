"""App del celular: la aplicación bancaria simulada y la interfaz del laboratorio (R11).

Es un proceso aparte del banco, como en la vida real: guarda los secretos del usuario (x) y
habla con el banco por HTTP. El navegador solo muestra lo que pasa y pide «siguiente paso».

Ejecutar desde la raíz:  BANK_URL=http://127.0.0.1:8000 uvicorn client_app.app:app --port 8001
(o todo junto con  python lab.py ).
"""

import os
from pathlib import Path
from typing import Annotated, Any

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import Field

from client_app.flows import Flow, FlowFinishedError, FlowManager
from client_app.gateway import BankGateway
from client_app.lab import LIVE_ATTACKS, OFFLINE_ATTACKS, LiveAttacker, run_offline
from infra.events import EventLog
from infra.sse import sse_response
from mechanisms.base import StepError
from mechanisms.common import StrictRequest, UserId
from mechanisms.registry import create_clients

BANK_URL_ENV = "BANK_URL"
DEFAULT_BANK_URL = "http://127.0.0.1:8000"
HTTP_TIMEOUT_SECONDS = 60
STATIC_DIR = Path(__file__).resolve().parent / "static"
RESULTS_DIR = Path(__file__).resolve().parent.parent / "results"
RESULT_SUFFIXES = (".json", ".png", ".csv")


class FlowRequest(StrictRequest):
    mechanism: str = Field(default="zkp", examples=["zkp"])
    flow: str = Field(examples=["register", "login"])
    user_id: UserId
    trace: bool = Field(default=True, description="Incluir la traza bit a bit cuando p es pequeño")


class LabResetRequest(StrictRequest):
    group: str | None = Field(default=None, examples=["toy", "safe-512"])


class AttackRequest(StrictRequest):
    user_id: UserId = "cliente01"


class PhoneState:
    """Estado del proceso del celular: canal al banco, flujos, wallet y laboratorio."""

    def __init__(self, bank_url: str, http: httpx.Client) -> None:
        self.bank_url = bank_url.rstrip("/")
        self.http = http
        self.events = EventLog()
        self.gateway = BankGateway(http, self.events)
        self.manager = FlowManager(create_clients(), self.gateway, self.events)
        self.attacker = LiveAttacker(BankGateway(http, self.events, source="atacante"), self.gateway)


def get_phone(request: Request) -> PhoneState:
    """Dependencia de FastAPI: el estado del celular. Cubre R11."""
    return request.app.state.phone


Phone = Annotated[PhoneState, Depends(get_phone)]


def _flow(phone: PhoneState, flow_id: str) -> Flow:
    try:
        return phone.manager.get(flow_id)
    except KeyError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No existe el flujo {flow_id}.") from error


def _register_flow_routes(app: FastAPI) -> None:
    @app.post("/api/flows", status_code=status.HTTP_201_CREATED, summary="Iniciar un flujo")
    def start_flow(body: FlowRequest, phone: Phone) -> dict[str, Any]:
        """Crea un flujo (registro o inicio de sesión) sin ejecutar ningún paso todavía. Cubre R11."""
        with phone.manager.lock:
            try:
                return phone.manager.start(body.mechanism, body.flow, body.user_id, body.trace).to_json()
            except ValueError as error:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, str(error)) from error

    @app.get("/api/flows/{flow_id}", summary="Estado de un flujo")
    def read_flow(flow_id: str, phone: Phone) -> dict[str, Any]:
        """El flujo con sus pasos ejecutados y pendientes. Cubre R11."""
        return _flow(phone, flow_id).to_json()

    @app.post("/api/flows/{flow_id}/next", summary="Ejecutar el siguiente paso")
    def next_step(flow_id: str, phone: Phone) -> dict[str, Any]:
        """Ejecuta un paso del flujo (un cálculo local o un mensaje al banco). Cubre R11."""
        with phone.manager.lock:
            flow = _flow(phone, flow_id)
            try:
                flow.next()
            except FlowFinishedError as error:
                raise HTTPException(status.HTTP_409_CONFLICT, str(error)) from error
            return flow.to_json()

    @app.post("/api/flows/{flow_id}/run", summary="Ejecutar todos los pasos restantes")
    def run_flow(flow_id: str, phone: Phone) -> dict[str, Any]:
        """Ejecuta lo que falta del flujo de una vez. Cubre R11."""
        with phone.manager.lock:
            flow = _flow(phone, flow_id)
            flow.run_all()
            return flow.to_json()


def _register_lab_routes(app: FastAPI) -> None:
    @app.get("/api/config", summary="Configuración de la interfaz")
    def config(phone: Phone) -> dict[str, Any]:
        """Dirección del banco (para sus vistas y Swagger), mecanismos y ataques disponibles. Cubre R11."""
        mechanisms = [m.info.to_json() for m in phone.manager.mechanisms.values()]
        return {"bank_url": phone.bank_url, "docs_url": f"{phone.bank_url}/docs", "mechanisms": mechanisms,
                "attacks": {"offline": {k: v[0] for k, v in OFFLINE_ATTACKS.items()}, "live": LIVE_ATTACKS}}

    @app.get("/api/wallet", summary="Secretos guardados en este celular")
    def wallet(phone: Phone) -> list[dict[str, Any]]:
        """Lo que el celular guarda por cuenta (x incluida): nunca se envía al banco. Cubre R2."""
        with phone.manager.lock:
            return phone.manager.wallet_view()

    @app.get("/api/events", summary="Eventos del celular desde un identificador")
    def list_events(phone: Phone, since: int = 0) -> list[dict[str, Any]]:
        """Pasos ejecutados y mensajes enviados por el celular y el atacante. Cubre R11."""
        return [event.to_json() for event in phone.events.since(since)]

    @app.get("/api/events/stream", summary="Eventos del celular en tiempo real (SSE)")
    def stream_events(phone: Phone, request: Request, since: int = 0) -> StreamingResponse:
        """Flujo text/event-stream con los eventos del celular. Cubre R11."""
        return sse_response(phone.events, request, since)

    @app.post("/api/lab/reset", summary="Reiniciar banco y celular")
    def reset(body: LabResetRequest, phone: Phone) -> Any:
        """Reinicia el banco (opcionalmente con otro grupo) y borra flujos y secretos del celular. Cubre R7."""
        try:
            response = phone.http.post("/lab/reset", json={"group": body.group})
        except httpx.HTTPError as error:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"El banco no responde: {error}") from error
        if response.status_code != status.HTTP_200_OK:
            raise HTTPException(response.status_code, response.json().get("reason", "Error del banco"))
        with phone.manager.lock:
            phone.manager.reset()
            phone.gateway.clear()
        phone.events.publish("sistema", "log", "Celular reiniciado: se borraron flujos y secretos")
        return response.json()

    @app.post("/api/lab/attacks/{name}", summary="Lanzar un ataque")
    def attack(name: str, body: AttackRequest, phone: Phone) -> dict[str, Any]:
        """Ataques fuera de línea (attacks/) o en vivo contra el banco que está corriendo. Cubre R10."""
        try:
            if name in OFFLINE_ATTACKS:
                return run_offline(name)
            return phone.attacker.run(name, body.user_id)
        except (ValueError, StepError) as error:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(error)) from error

    @app.get("/api/results", summary="Resultados de los experimentos")
    def results() -> list[str]:
        """Archivos disponibles en results/ (gráficas y tablas ya generadas). Cubre R7 y R10."""
        if not RESULTS_DIR.is_dir():
            return []
        return sorted(p.name for p in RESULTS_DIR.iterdir() if p.suffix in RESULT_SUFFIXES)


def create_client_app(bank_url: str | None = None, bank_http: httpx.Client | None = None) -> FastAPI:
    """Construye la app del celular; bank_http permite inyectar un cliente (pruebas). Cubre R11."""
    url = bank_url or os.environ.get(BANK_URL_ENV, DEFAULT_BANK_URL)
    http = bank_http or httpx.Client(base_url=url, timeout=HTTP_TIMEOUT_SECONDS)
    app = FastAPI(title="Schnorr Lab · App del banco (celular)", version="0.3.0",
                  description="La app del cliente: guarda x y ejecuta los protocolos paso a paso.")
    app.state.phone = PhoneState(url, http)
    _register_flow_routes(app)
    _register_lab_routes(app)

    @app.get("/", include_in_schema=False)
    def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    RESULTS_DIR.mkdir(exist_ok=True)
    app.mount("/results", StaticFiles(directory=RESULTS_DIR), name="results")
    return app


app = create_client_app()
