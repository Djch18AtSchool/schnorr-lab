"""Parte del banco del mecanismo ZKP: endpoints /zkp/... y eventos de cada decisión (R2, R6, R9, R11).

Envuelve protocol.Bank sin modificarlo: la API solo traduce HTTP ↔ enteros y publica en la
bitácora lo que el banco recibió y decidió, para que la interfaz lo muestre en tiempo real.
"""

from collections.abc import Mapping
from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from infra.server_context import ServerContext
from mechanisms.common import ErrorResponse, error_response
from mechanisms.zkp.info import INFO, MECHANISM_ID
from mechanisms.zkp.schemas import (
    CommitRequest,
    CommitResponse,
    DemoClientRequest,
    DemoClientResponse,
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

PREFIX = "/zkp"
TAG = "ZKP · Schnorr"
GROUP_SETTING = "zkp_group"
DEFAULT_GROUP = "toy"
MAX_TRACE_BITS = 64                 # con p más grande la traza bit a bit es ilegible
COMMIT_ERROR_STATUS = {
    Reason.USER_NOT_FOUND: status.HTTP_404_NOT_FOUND,
    Reason.ACCOUNT_LOCKED: status.HTTP_423_LOCKED,
}
DEMO_WARNING = ("Solo para demostración: este cliente vive en el servidor y por eso devuelve x. "
                "En el modelo real x nunca sale del dispositivo del usuario.")
ERRORS = {400: {"model": ErrorResponse}, 422: {"model": ErrorResponse}}


def verify_payload(result: VerifyResult) -> VerifyResponse:
    """Traduce un VerifyResult a la respuesta HTTP (enteros como cadenas). Cubre R6 y R11."""
    transcript = result.transcript
    return VerifyResponse(
        accepted=result.accepted,
        reason=str(result.reason),
        transcript=None if transcript is None else {"t": str(transcript.t), "c": str(transcript.c),
                                                    "s": str(transcript.s)},
        details={key: str(value) for key, value in result.details.items()},
        attempts_left=result.attempts_left,
    )


class ZkpServer:
    """Banco del mecanismo ZKP: un protocol.Bank en memoria y sus endpoints. Cubre R11."""

    info = INFO
    audited_paths = frozenset({f"{PREFIX}/register", f"{PREFIX}/login/commit", f"{PREFIX}/login/respond"})

    def __init__(self, ctx: ServerContext, settings: Mapping[str, str]) -> None:
        self._ctx = ctx
        self._bank = Bank(get_group(settings.get(GROUP_SETTING, DEFAULT_GROUP)))

    @property
    def gp(self) -> GroupParams:
        return self._bank.gp

    def reset(self, settings: Mapping[str, str]) -> None:
        """Reemplaza el banco por uno vacío en el grupo indicado (solo laboratorio). Cubre R7 y R11."""
        bank = Bank(get_group(settings.get(GROUP_SETTING, self.gp.name)))
        with self._ctx.lock:
            self._bank = bank

    def describe(self) -> dict[str, Any]:
        """Grupo en uso, para el encabezado de la interfaz. Cubre R7 y R11."""
        gp = self.gp
        return {"group": gp.name, "bits": gp.bits, "q_bits": gp.q.bit_length(),
                "p": str(gp.p), "q": str(gp.q), "g": str(gp.g)}

    def stored_credentials(self) -> dict[str, dict[str, str]]:
        """Lo que el banco guarda de cada usuario: solo y. Cubre R2."""
        with self._ctx.lock:
            return {user_id: {"y": str(y)} for user_id, y in self._bank.users.items()}

    def _event(self, kind: str, title: str, data: Mapping[str, Any]) -> None:
        self._ctx.events.publish("banco", kind, title, mechanism=MECHANISM_ID, data=data)

    def _trace(self) -> list[str] | None:
        return [] if self.gp.bits <= MAX_TRACE_BITS else None

    # ------------------------------------------------------------------ endpoints

    def read_params(self) -> ParamsResponse:
        """Parámetros públicos del grupo (p, q, g). Cubre R1 y R11."""
        gp = self.gp
        return ParamsResponse(name=gp.name, p=str(gp.p), q=str(gp.q), g=str(gp.g), bits=gp.bits)

    def register(self, body: RegisterRequest) -> RegisterResponse | JSONResponse:
        """El cliente envía solo su clave pública y; se rechaza id repetido, y = 1 o y fuera del subgrupo.

        Cubre R2, R9 y R11.
        """
        self._ctx.audit(f"{PREFIX}/register", body.model_dump(), MECHANISM_ID)
        self._event("registro", "El banco recibe una clave pública", {"user_id": body.user_id, "y": body.y})
        with self._ctx.lock:
            result = self._bank.register(body.user_id, int(body.y))
        if not result.accepted:
            self._event("error", f"Registro rechazado: {result.reason}", {"user_id": body.user_id})
            return error_response(status.HTTP_400_BAD_REQUEST, result.reason)
        self._event("registro", "y ∈ subgrupo de orden q ✔ → el banco guarda (id, y)",
                    {"user_id": body.user_id, "y": body.y, "guardado": "solo y"})
        return RegisterResponse(user_id=body.user_id, stored={"y": str(int(body.y))})

    def login_commit(self, body: CommitRequest) -> CommitResponse | JSONResponse:
        """Recibe t, lo valida y responde con un reto c aleatorio (sesión de un solo uso). Cubre R3, R9 y R11."""
        self._ctx.audit(f"{PREFIX}/login/commit", body.model_dump(), MECHANISM_ID)
        self._event("paso", "El banco recibe el compromiso t", {"user_id": body.user_id, "t": body.t})
        with self._ctx.lock:
            outcome = self._bank.challenge(body.user_id, int(body.t))
        if isinstance(outcome, VerifyResult):
            self._event("error", f"Compromiso rechazado: {outcome.reason}",
                        {"user_id": body.user_id, "attempts_left": str(outcome.attempts_left)})
            code = COMMIT_ERROR_STATUS.get(outcome.reason, status.HTTP_400_BAD_REQUEST)
            return error_response(code, outcome.reason)
        session_id, c = outcome
        self._event("paso", "t ∈ subgrupo ✔ → el banco elige el reto c al azar",
                    {"session_id": session_id, "c": str(c)})
        return CommitResponse(session_id=session_id, c=str(c))

    def login_respond(self, body: RespondRequest) -> VerifyResponse:
        """Verifica g^s ≡ t·y^c y t ≡ g^s·(y^c)^-1 (mod p); la sesión se consume. Cubre R6, R9 y R11."""
        self._ctx.audit(f"{PREFIX}/login/respond", body.model_dump(), MECHANISM_ID)
        self._event("paso", "El banco recibe la respuesta s", {"session_id": body.session_id, "s": body.s})
        trace = self._trace()
        with self._ctx.lock:
            result = self._bank.verify(body.session_id, int(body.s), trace)
        payload = verify_payload(result)
        verdict = "ACCESO CONCEDIDO" if result.accepted else f"Rechazado: {result.reason}"
        self._event("verificacion", verdict, {**payload.details, "accepted": str(result.accepted),
                                               "attempts_left": str(result.attempts_left),
                                               "trace": "\n".join(trace or [])})
        return payload

    def demo_client(self, body: DemoClientRequest) -> DemoClientResponse | JSONResponse:
        """Calcula un par de claves en el servidor, solo para probar con clics en Swagger. Cubre R11."""
        try:
            client = Client(body.user_id, self.gp, x=None if body.x is None else int(body.x))
        except ValueError as error:
            return error_response(status.HTTP_400_BAD_REQUEST, str(error))
        return DemoClientResponse(warning=DEMO_WARNING, user_id=client.user_id, x=str(client.x), y=str(client.y))

    def router(self) -> APIRouter:
        """Rutas /zkp/... con sus descripciones para Swagger. Cubre R11."""
        router = APIRouter(prefix=PREFIX, tags=[TAG])
        router.add_api_route("/params", self.read_params, methods=["GET"], response_model=ParamsResponse,
                             summary="Parámetros públicos (p, q, g)")
        router.add_api_route("/register", self.register, methods=["POST"], status_code=201,
                             response_model=RegisterResponse, responses=ERRORS, summary="Crear cuenta: enviar y")
        router.add_api_route("/login/commit", self.login_commit, methods=["POST"], response_model=CommitResponse,
                             responses={**ERRORS, 404: {"model": ErrorResponse}, 423: {"model": ErrorResponse}},
                             summary="Paso 1: enviar el compromiso t y recibir el reto c")
        router.add_api_route("/login/respond", self.login_respond, methods=["POST"], response_model=VerifyResponse,
                             responses=ERRORS, summary="Paso 2: enviar la respuesta s y recibir la decisión")
        router.add_api_route("/demo/client", self.demo_client, methods=["POST"], status_code=201,
                             response_model=DemoClientResponse, responses=ERRORS, tags=["demostración"],
                             summary="Crear un cliente de prueba (solo para Swagger)")
        return router


def create_server(ctx: ServerContext, settings: Mapping[str, str]) -> ZkpServer:
    """Fábrica que usa el registro de mecanismos. Cubre R11."""
    return ZkpServer(ctx, settings)
