"""Parte del banco del mecanismo ZKP: endpoints /zkp/... y eventos de cada decisión (R2, R6, R9, R11).

Envuelve protocol.Bank sin modificarlo: la API solo traduce HTTP ↔ enteros y publica en la
bitácora lo que el banco recibió y decidió, para que la interfaz lo muestre en tiempo real.
"""

from collections.abc import Mapping
from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from infra import telemetry
from infra.server_context import ServerContext
from infra.spans import code_span
from mechanisms.common import ErrorResponse, error_response
from mechanisms.zkp import observe
from mechanisms.zkp.info import INFO, MECHANISM_ID
from mechanisms.zkp.schemas import (
    CommitRequest,
    CommitResponse,
    DemoClientRequest,
    DemoClientResponse,
    NizkRequest,
    ParamsResponse,
    RegisterRequest,
    RegisterResponse,
    RespondRequest,
    VerifyResponse,
)
from protocol import GroupParams, get_group
from protocol.bank import Bank
from protocol.client import Client
from protocol.fiat_shamir import NizkProof, verify_nizk
from protocol.transcript import Reason, Transcript, VerifyResult

PREFIX = "/zkp"
TAG = "ZKP · Schnorr"
GROUP_SETTING = "zkp_group"
DEFAULT_GROUP = "toy"
MAX_TRACE_BITS = 64                 # con p más grande la traza bit a bit es ilegible
LOGGER = "banco.zkp"
MAX_REMEMBERED_SESSIONS = 10_000    # sesiones consumidas que se recuerdan para reconocer repeticiones
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
    audited_paths = frozenset({f"{PREFIX}/register", f"{PREFIX}/login/commit", f"{PREFIX}/login/respond",
                               f"{PREFIX}/login/nizk"})

    def __init__(self, ctx: ServerContext, settings: Mapping[str, str]) -> None:
        self._ctx = ctx
        self._group_id = settings.get(GROUP_SETTING, DEFAULT_GROUP)
        self._bank = Bank(get_group(self._group_id))
        self._session_users: dict[str, str] = {}     # sesión → usuario (para la telemetría)
        self._consumed: dict[str, str] = {}          # sesiones ya usadas → usuario

    @property
    def gp(self) -> GroupParams:
        return self._bank.gp

    def reset(self, settings: Mapping[str, str]) -> None:
        """Reemplaza el banco por uno vacío en el grupo indicado (solo laboratorio). Cubre R7 y R11."""
        group_id = settings.get(GROUP_SETTING) or self._group_id
        bank = Bank(get_group(group_id))
        with self._ctx.lock:
            self._bank = bank
            self._group_id = group_id
            self._session_users.clear()
            self._consumed.clear()

    def describe(self) -> dict[str, Any]:
        """Grupo en uso, para el encabezado de la interfaz. Cubre R7 y R11."""
        gp = self.gp
        return {"group": gp.name, "group_id": self._group_id, "bits": gp.bits, "q_bits": gp.q.bit_length(),
                "p": str(gp.p), "q": str(gp.q), "g": str(gp.g)}

    def stored_credentials(self) -> dict[str, dict[str, str]]:
        """Lo que el banco guarda de cada usuario: solo y. Cubre R2."""
        with self._ctx.lock:
            return {user_id: {"y": str(y)} for user_id, y in self._bank.users.items()}

    def account_status(self) -> dict[str, dict[str, Any]]:
        """Estado de cada cuenta: activa o bloqueada y los intentos que le quedan. Cubre R9."""
        with self._ctx.lock:
            return {user_id: {"status": "bloqueada" if self._bank.is_locked(user_id) else "activa",
                              "attempts_left": self._bank.attempts_left(user_id)}
                    for user_id in self._bank.users}

    def _event(self, kind: str, title: str, data: Mapping[str, Any], *, event: str, level: str = "INFO",
               span: dict[str, Any] | None = None,
               math: list[str] | None = None, signals: tuple[str, ...] | list[str] = (),
               user_id: str | None = None, evidence: Mapping[str, str] | None = None) -> None:
        """Publica una línea de log estructurada (con traza y cálculos) y avisa a la telemetría."""
        payload: dict[str, Any] = {"logger": LOGGER, "event": event, "level": level, **data}
        if span is not None:
            payload["span"] = span
        if math:
            payload["math"] = math
        if signals:
            payload["signal"] = signals[-1]
        for name in signals:
            telemetry.signal(name, user_id, MECHANISM_ID, evidence)
        self._ctx.events.publish("banco", kind, title, mechanism=MECHANISM_ID, data=payload)

    def _trace(self) -> list[str] | None:
        return [] if self.gp.bits <= MAX_TRACE_BITS else None

    # ------------------------------------------------------------------ endpoints

    def read_params(self) -> ParamsResponse:
        """Parámetros públicos del grupo (p, q, g). Cubre R1 y R11."""
        gp = self.gp
        self._event("paso", "El banco entrega los parámetros públicos (p, q, g)",
                    {"grupo": gp.name, "bits": str(gp.bits)}, event="params",
                    span=code_span(ZkpServer.read_params, ("return ParamsResponse",)))
        return ParamsResponse(name=gp.name, p=str(gp.p), q=str(gp.q), g=str(gp.g), bits=gp.bits)

    def register(self, body: RegisterRequest) -> RegisterResponse | JSONResponse:
        """El cliente envía solo su clave pública y; se rechaza id repetido, y = 1 o y fuera del subgrupo.

        Cubre R2, R9 y R11.
        """
        self._ctx.audit(f"{PREFIX}/register", body.model_dump(), MECHANISM_ID)
        y = int(body.y)
        with self._ctx.lock:
            result = self._bank.register(body.user_id, y)
        fields = {"user": body.user_id, "y": observe.short(y)}
        math = observe.subgroup_math("y", y, self.gp)
        span = observe.register_span(result.reason)
        if not result.accepted:
            self._event("error", f"Registro rechazado: {result.reason}",
                        {**fields, "accepted": "false", "reason": str(result.reason)}, event="register", level="WARN",
                        span=span, math=math, signals=["account.rejected"], user_id=body.user_id)
            return error_response(status.HTTP_400_BAD_REQUEST, result.reason)
        self._event("registro", "y ∈ subgrupo ✔ → el banco guarda (id, y)",
                    {**fields, "subgroup": "ok", "stored": "solo y"}, event="register", span=span,
                    math=math, signals=["account.created"], user_id=body.user_id)
        return RegisterResponse(user_id=body.user_id, stored={"y": str(y)})

    def login_commit(self, body: CommitRequest) -> CommitResponse | JSONResponse:
        """Recibe t, lo valida y responde con un reto c aleatorio (sesión de un solo uso). Cubre R3, R9 y R11."""
        self._ctx.audit(f"{PREFIX}/login/commit", body.model_dump(), MECHANISM_ID)
        t = int(body.t)
        with self._ctx.lock:
            outcome = self._bank.challenge(body.user_id, t)
        fields = {"user": body.user_id, "t": observe.short(t)}
        math = observe.subgroup_math("t", t, self.gp)
        if isinstance(outcome, VerifyResult):
            self._event("error", f"Compromiso rechazado: {outcome.reason}", event="challenge", level="WARN",
                        data={**fields, "reason": str(outcome.reason), "attempts_left": str(outcome.attempts_left)},
                        span=observe.challenge_span(outcome.reason), math=math,
                        signals=observe.verdict_signals(outcome, replayed=False), user_id=body.user_id)
            code = COMMIT_ERROR_STATUS.get(outcome.reason, status.HTTP_400_BAD_REQUEST)
            return error_response(code, outcome.reason)
        session_id, c = outcome
        self._remember_session(session_id, body.user_id)
        self._event("paso", "t ∈ subgrupo ✔ → el banco elige el reto c al azar", event="challenge",
                    data={**fields, "subgroup": "ok", "c": observe.short(c),
                                          "session": session_id[:8] + "…"},
                    span=observe.challenge_span(None), math=[*math, f"c = {observe.short(c)} (al azar en [0, q − 1])"],
                    signals=["auth.challenge"], user_id=body.user_id)
        return CommitResponse(session_id=session_id, c=str(c))

    def _remember_session(self, session_id: str, user_id: str) -> None:
        with self._ctx.lock:
            self._session_users[session_id] = user_id

    def _consume_session(self, session_id: str, result: VerifyResult) -> tuple[str | None, bool]:
        """(usuario de la sesión, ¿era una sesión ya usada?) y la marca como consumida."""
        with self._ctx.lock:
            if result.reason == Reason.INVALID_SESSION:
                user_id = self._consumed.get(session_id)
                return user_id, user_id is not None
            user_id = self._session_users.pop(session_id, None)
            if user_id is not None:
                self._consumed[session_id] = user_id
                while len(self._consumed) > MAX_REMEMBERED_SESSIONS:
                    self._consumed.pop(next(iter(self._consumed)))
            return user_id, False

    def _verify_math(self, user_id: str | None, transcript: Transcript | None,
                     details: Mapping[str, int]) -> list[str]:
        y = self._bank.users.get(user_id or "")
        if y is None or transcript is None:
            return []
        return observe.verify_math(dict(details), y, transcript.t, transcript.c, transcript.s, self.gp)

    def login_respond(self, body: RespondRequest) -> VerifyResponse:
        """Verifica g^s ≡ t·y^c y t ≡ g^s·(y^c)^-1 (mod p); la sesión se consume. Cubre R6, R9 y R11."""
        self._ctx.audit(f"{PREFIX}/login/respond", body.model_dump(), MECHANISM_ID)
        trace = self._trace()
        with self._ctx.lock:
            result = self._bank.verify(body.session_id, int(body.s), trace)
        user_id, replayed = self._consume_session(body.session_id, result)
        payload = verify_payload(result)
        verdict = "ACCESO CONCEDIDO" if result.accepted else f"Rechazado: {result.reason}"
        fields = {"session": body.session_id[:8] + "…", "user": user_id or "?", "s": observe.short(body.s),
                  **{key: observe.short(value) for key, value in payload.details.items()},
                  "accepted": str(result.accepted).lower(), "reason": str(result.reason),
                  "attempts_left": str(result.attempts_left)}
        self._event("verificacion", verdict, {**fields, "trace": "\n".join(trace or [])}, event="verify",
                    level="INFO" if result.accepted else "WARN",
                    span=observe.verify_span(result),
                    math=self._verify_math(user_id, result.transcript, result.details),
                    signals=observe.verdict_signals(result, replayed), user_id=user_id,
                    evidence={"session_id": body.session_id} if replayed else None)
        return payload

    def login_nizk(self, body: NizkRequest) -> VerifyResponse | JSONResponse:
        """Verifica una prueba no interactiva (Fiat-Shamir) recibida en un solo mensaje. Cubre R8, R9 y R11.

        El banco recalcula c = H(p ‖ g ‖ y ‖ t ‖ id ‖ m) mod q y rechaza pruebas repetidas o con m
        fuera de la ventana permitida (definición 14).
        """
        self._ctx.audit(f"{PREFIX}/login/nizk", body.model_dump(), MECHANISM_ID)
        proof = NizkProof(user_id=body.user_id, t=int(body.t), s=int(body.s), m=int(body.m))
        try:
            with self._ctx.lock:
                result = verify_nizk(self._bank, proof)
        except ValueError as error:
            return error_response(status.HTTP_400_BAD_REQUEST, str(error))
        payload = verify_payload(result)
        verdict = "ACCESO CONCEDIDO" if result.accepted else f"Rechazado: {result.reason}"
        replayed = result.reason == Reason.PROOF_ALREADY_USED
        challenge = {"c": payload.transcript["c"]} if payload.transcript else {}
        fields = {"user": body.user_id, "t": observe.short(body.t), "s": observe.short(body.s), "m": body.m,
                  **challenge, **{key: observe.short(value) for key, value in payload.details.items()},
                  "accepted": str(result.accepted).lower(), "reason": str(result.reason),
                  "attempts_left": str(result.attempts_left)}
        math = ["c = SHA-256(p ‖ g ‖ y ‖ t ‖ id ‖ m) mod q" + (f" = {observe.short(challenge['c'])}" if challenge else "")]
        self._event("verificacion", verdict, fields, event="verify_nizk", level="INFO" if result.accepted else "WARN",
                    span=observe.nizk_span(result),
                    math=[*math, *self._verify_math(body.user_id, result.transcript, result.details)],
                    signals=observe.verdict_signals(result, replayed), user_id=body.user_id,
                    evidence={"t": body.t, "s": body.s} if replayed else None)
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
        router.add_api_route("/login/nizk", self.login_nizk, methods=["POST"], response_model=VerifyResponse,
                             responses=ERRORS, summary="Inicio de sesión no interactivo (Fiat-Shamir): t, s y m")
        router.add_api_route("/demo/client", self.demo_client, methods=["POST"], status_code=201,
                             response_model=DemoClientResponse, responses=ERRORS, tags=["demostración"],
                             summary="Crear un cliente de prueba (solo para Swagger)")
        return router


def create_server(ctx: ServerContext, settings: Mapping[str, str]) -> ZkpServer:
    """Fábrica que usa el registro de mecanismos. Cubre R11."""
    return ZkpServer(ctx, settings)
