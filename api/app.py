"""API HTTP del banco: el protocolo de Schnorr entre cliente y servidor separados (R11).

Ejecutar desde la raíz:  uvicorn api.app:app --reload   y abrir http://127.0.0.1:8000/docs
El grupo se elige con la variable de entorno SCHNORR_GROUP (por defecto «toy», p = 23).
Hay un único Bank en memoria por proceso; reiniciar el servidor borra usuarios y sesiones.
"""

import os
import threading
from collections import deque
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, Request, status
from fastapi.responses import JSONResponse

from api.schemas import (
    AuditEntry,
    CommitRequest,
    CommitResponse,
    DemoClientRequest,
    DemoClientResponse,
    ErrorResponse,
    ParamsResponse,
    RegisterRequest,
    RegisterResponse,
    RespondRequest,
    VerifyResponse,
)
from protocol import GroupParams, get_group
from protocol.bank import Bank
from protocol.client import Client
from protocol.transcript import Reason, VerifyResult

GROUP_ENV_VAR = "SCHNORR_GROUP"
DEFAULT_GROUP = "toy"
MAX_AUDIT_ENTRIES = 10_000
DEMO_WARNING = ("Solo para demostración: este cliente vive en el servidor y por eso devuelve x. "
                "En el modelo real x nunca sale del dispositivo del usuario (use http_client.py).")
COMMIT_ERROR_STATUS = {
    Reason.USER_NOT_FOUND: status.HTTP_404_NOT_FOUND,
    Reason.ACCOUNT_LOCKED: status.HTTP_423_LOCKED,
}


class LabState:
    """Estado del proceso: el banco, la bitácora de auditoría y los clientes de demostración."""

    def __init__(self, gp: GroupParams) -> None:
        self.bank = Bank(gp)
        self.audit: deque[AuditEntry] = deque(maxlen=MAX_AUDIT_ENTRIES)
        self.demo_clients: dict[str, Client] = {}
        self.lock = threading.Lock()   # Bank no es seguro entre hilos; FastAPI usa varios

    def record(self, endpoint: str, body: dict[str, str]) -> None:
        self.audit.append(AuditEntry(endpoint=endpoint, body=body))


def get_state(request: Request) -> LabState:
    return request.app.state.lab


State = Annotated[LabState, Depends(get_state)]
router = APIRouter()


def _error(code: int, reason: str) -> JSONResponse:
    return JSONResponse(status_code=code, content={"reason": str(reason)})


def _verify_response(result: VerifyResult) -> VerifyResponse:
    transcript = result.transcript
    return VerifyResponse(
        accepted=result.accepted,
        reason=str(result.reason),
        transcript=None if transcript is None else {"t": str(transcript.t), "c": str(transcript.c),
                                                    "s": str(transcript.s)},
        details={key: str(value) for key, value in result.details.items()},
        attempts_left=result.attempts_left,
    )


@router.get("/params", response_model=ParamsResponse, tags=["parámetros"],
            summary="Parámetros públicos (p, q, g)")
def read_params(state: State) -> ParamsResponse:
    """Devuelve el grupo que usa el banco. Todos los enteros van como cadenas decimales."""
    gp = state.bank.gp
    return ParamsResponse(name=gp.name, p=str(gp.p), q=str(gp.q), g=str(gp.g), bits=gp.bits)


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=RegisterResponse,
             responses={400: {"model": ErrorResponse}}, tags=["banco"], summary="Registrar un cliente")
def register(body: RegisterRequest, state: State) -> RegisterResponse | JSONResponse:
    """El cliente envía solo su clave pública y. Se rechaza un id repetido, y = 1 o y fuera del subgrupo (R2, R9)."""
    with state.lock:
        state.record("/register", body.model_dump())
        result = state.bank.register(body.user_id, int(body.y))
        stored = state.bank.users.get(body.user_id)
    if not result.accepted or stored is None:
        return _error(status.HTTP_400_BAD_REQUEST, result.reason)
    return RegisterResponse(user_id=body.user_id, stored={"y": str(stored)})


@router.post("/login/commit", response_model=CommitResponse, tags=["banco"],
             responses={400: {"model": ErrorResponse}, 404: {"model": ErrorResponse},
                        423: {"model": ErrorResponse}},
             summary="Paso 1: enviar el compromiso t y recibir el reto c")
def login_commit(body: CommitRequest, state: State) -> CommitResponse | JSONResponse:
    """El banco valida t (debe estar en el subgrupo de orden q) y responde con un reto c aleatorio."""
    with state.lock:
        state.record("/login/commit", body.model_dump())
        outcome = state.bank.challenge(body.user_id, int(body.t))
    if isinstance(outcome, VerifyResult):
        return _error(COMMIT_ERROR_STATUS.get(outcome.reason, status.HTTP_400_BAD_REQUEST), outcome.reason)
    session_id, c = outcome
    return CommitResponse(session_id=session_id, c=str(c))


@router.post("/login/respond", response_model=VerifyResponse, tags=["banco"],
             summary="Paso 2: enviar la respuesta s y recibir la decisión")
def login_respond(body: RespondRequest, state: State) -> VerifyResponse:
    """El banco comprueba g^s ≡ t·y^c (mod p) y t ≡ g^s·(y^c)^-1 (mod p). La sesión se consume (R6, R9)."""
    with state.lock:
        state.record("/login/respond", body.model_dump())
        result = state.bank.verify(body.session_id, int(body.s))
    return _verify_response(result)


@router.get("/bank/users", response_model=dict[str, str], tags=["auditoría"],
            summary="Lo que guarda el banco: id → y")
def bank_users(state: State) -> dict[str, str]:
    """Muestra que el banco guarda solo la clave pública y de cada cliente, nunca x (R2)."""
    with state.lock:
        return {user_id: str(y) for user_id, y in state.bank.users.items()}


@router.get("/audit/log", response_model=list[AuditEntry], tags=["auditoría"],
            summary="Todos los cuerpos recibidos por el banco, en orden")
def audit_log(state: State) -> list[AuditEntry]:
    """Bitácora de /register, /login/commit y /login/respond: permite comprobar que x nunca llegó."""
    with state.lock:
        return list(state.audit)


@router.post("/demo/client", status_code=status.HTTP_201_CREATED, response_model=DemoClientResponse,
             responses={400: {"model": ErrorResponse}}, tags=["demostración"],
             summary="Crear un cliente de prueba (solo para Swagger)")
def demo_client(body: DemoClientRequest, state: State) -> DemoClientResponse | JSONResponse:
    """Crea un cliente en el servidor y devuelve su x e y para poder probar con clics.

    Está separado del banco: no lo registra ni aparece en /audit/log.
    """
    try:
        client = Client(body.user_id, state.bank.gp, x=None if body.x is None else int(body.x))
    except ValueError as error:
        return _error(status.HTTP_400_BAD_REQUEST, str(error))
    with state.lock:
        state.demo_clients[body.user_id] = client
    return DemoClientResponse(warning=DEMO_WARNING, user_id=client.user_id, x=str(client.x), y=str(client.y))


def create_app(group_name: str | None = None) -> FastAPI:
    """Construye la aplicación con un banco nuevo en el grupo indicado (o el de SCHNORR_GROUP)."""
    name = group_name or os.environ.get(GROUP_ENV_VAR, DEFAULT_GROUP)
    gp = get_group(name)
    app = FastAPI(
        title="Schnorr Lab · API del banco",
        version="0.2.0",
        description=(
            "Autenticación sin contraseñas con el protocolo de identificación de Schnorr. "
            f"Grupo actual: **{gp.name}** (p de {gp.bits} bits).\n\n"
            "Flujo: `POST /register` con y → `POST /login/commit` con t (devuelve c) → "
            "`POST /login/respond` con s. Todos los enteros viajan como cadenas decimales."
        ),
    )
    app.state.lab = LabState(gp)
    app.include_router(router)
    return app


app = create_app()
