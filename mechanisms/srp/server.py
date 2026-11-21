"""Parte del banco del mecanismo SRP-6a: endpoints /srp/... y sus eventos (C1–C4).

El banco guarda por usuario solo la sal y el verificador v. Cada inicio de sesión abre una
sesión de un solo uso con su b; a lo sumo una pendiente por usuario (la nueva reemplaza a la
anterior). Un M1 incorrecto suma un fallo y al tercero la cuenta se bloquea, como en el ZKP.
"""

import hmac
import secrets
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from infra.server_context import ServerContext
from mechanisms.common import AttemptLimiter, ErrorResponse, error_response
from mechanisms.srp import srp6a
from mechanisms.srp.info import INFO, MECHANISM_ID
from mechanisms.srp.schemas import (
    ParamsResponse,
    RegisterRequest,
    RegisterResponse,
    StartRequest,
    StartResponse,
    VerifyRequest,
    VerifyResponse,
)

PREFIX = "/srp"
TAG = "SRP-6a"
SESSION_ID_BYTES = 8
USER_EXISTS = "El usuario ya está registrado"
VERIFIER_OUT_OF_RANGE = "El verificador debe cumplir 1 < v < N"
USER_NOT_FOUND = "Usuario no registrado"
A_IS_ZERO = "A ≡ 0 (mod N): el banco aborta (la clave de sesión sería predecible)"
A_OUT_OF_RANGE = "A debe cumplir 0 < A < N"
INVALID_SESSION = "Sesión inválida o ya utilizada"
ACCESS_GRANTED = "Acceso concedido"
BAD_PROOF = "La prueba M1 no coincide: contraseña incorrecta"
ACCOUNT_LOCKED = "Cuenta bloqueada por intentos fallidos"
ERRORS = {400: {"model": ErrorResponse}, 422: {"model": ErrorResponse}}


@dataclass(frozen=True)
class SrpRecord:
    """Lo que el banco guarda de un usuario."""

    salt: bytes
    v: int


@dataclass(frozen=True)
class SrpSession:
    """Una sesión pendiente: el A recibido y el b y B del banco."""

    user_id: str
    A: int
    b: int
    B: int


class SrpServer:
    """Banco del mecanismo SRP-6a con el grupo de 2048 bits del RFC 5054 y SHA-256. Cubre C1."""

    info = INFO
    audited_paths = frozenset({f"{PREFIX}/register", f"{PREFIX}/login/start", f"{PREFIX}/login/verify"})

    def __init__(self, ctx: ServerContext, settings: Mapping[str, str],
                 group: srp6a.SrpGroup = srp6a.RFC5054_2048) -> None:
        self._ctx = ctx
        self.group = group
        self._records: dict[str, SrpRecord] = {}
        self._sessions: dict[str, SrpSession] = {}
        self._open_sessions: dict[str, str] = {}
        self._limiter = AttemptLimiter()

    def reset(self, settings: Mapping[str, str]) -> None:
        """Olvida usuarios, sesiones e intentos (solo laboratorio). Cubre C1."""
        with self._ctx.lock:
            self._records, self._sessions, self._open_sessions = {}, {}, {}
            self._limiter = AttemptLimiter()

    def describe(self) -> dict[str, Any]:
        """Grupo, hash y bloqueo, para la interfaz. Cubre C2."""
        return {"group": self.group.name, "bits": self.group.bits, "hash": self.group.hash_name,
                "g": str(self.group.g), "max_attempts": self._limiter.max_attempts}

    def stored_credentials(self) -> dict[str, dict[str, str]]:
        """Lo que guarda el banco: la sal y el verificador v, nunca la contraseña ni x. Cubre C2."""
        with self._ctx.lock:
            return {user_id: {"salt": record.salt.hex(), "v": str(record.v)}
                    for user_id, record in self._records.items()}

    def _event(self, kind: str, title: str, data: Mapping[str, Any]) -> None:
        self._ctx.events.publish("banco", kind, title, mechanism=MECHANISM_ID, data=data)

    def _reject(self, code: int, reason: str, user_id: str) -> JSONResponse:
        self._event("error", reason, {"user_id": user_id})
        return error_response(code, reason)

    # ------------------------------------------------------------------ endpoints

    def read_params(self) -> ParamsResponse:
        """Parámetros públicos: N, g y el hash. Cubre C1."""
        group = self.group
        return ParamsResponse(name=group.name, N=str(group.N), g=str(group.g), hash=group.hash_name,
                              bits=group.bits)

    def register(self, body: RegisterRequest) -> RegisterResponse | JSONResponse:
        """Guarda (sal, v) si 1 < v < N y el usuario es nuevo. Cubre C1, C2 y C3."""
        self._ctx.audit(f"{PREFIX}/register", body.model_dump(), MECHANISM_ID)
        self._event("registro", "El banco recibe la sal y el verificador v", body.model_dump())
        v = int(body.v)
        if not 1 < v < self.group.N:
            return self._reject(status.HTTP_400_BAD_REQUEST, VERIFIER_OUT_OF_RANGE, body.user_id)
        with self._ctx.lock:
            exists = body.user_id in self._records
            if not exists:
                self._records = {**self._records, body.user_id: SrpRecord(bytes.fromhex(body.salt), v)}
        if exists:
            return self._reject(status.HTTP_400_BAD_REQUEST, USER_EXISTS, body.user_id)
        stored = {"salt": body.salt, "v": str(v)}
        self._event("registro", "El banco guarda solo (s, v)", {"user_id": body.user_id, **stored})
        return RegisterResponse(user_id=body.user_id, stored=stored)

    def _open_session(self, user_id: str, A: int, record: SrpRecord) -> tuple[str, SrpSession]:
        """Sortea b hasta que u ≠ 0 y guarda la sesión (reemplaza la pendiente del usuario)."""
        while True:
            b = srp6a.new_ephemeral()
            B = srp6a.server_public(self.group, record.v, b)
            if srp6a.scrambler(self.group, A, B) != 0:
                break
        session_id, session = secrets.token_hex(SESSION_ID_BYTES), SrpSession(user_id, A, b, B)
        with self._ctx.lock:
            previous = self._open_sessions.get(user_id)
            self._sessions = {**{k: s for k, s in self._sessions.items() if k != previous}, session_id: session}
            self._open_sessions = {**self._open_sessions, user_id: session_id}
        return session_id, session

    def _start_error(self, body: StartRequest, A: int) -> JSONResponse | None:
        if not srp6a.is_valid_public(self.group, A):
            return self._reject(status.HTTP_400_BAD_REQUEST, A_IS_ZERO, body.user_id)
        if not 0 < A < self.group.N:
            return self._reject(status.HTTP_400_BAD_REQUEST, A_OUT_OF_RANGE, body.user_id)
        with self._ctx.lock:
            locked, known = self._limiter.is_locked(body.user_id), body.user_id in self._records
        if locked:
            return self._reject(status.HTTP_423_LOCKED, ACCOUNT_LOCKED, body.user_id)
        if not known:
            return self._reject(status.HTTP_404_NOT_FOUND, USER_NOT_FOUND, body.user_id)
        return None

    def login_start(self, body: StartRequest) -> StartResponse | JSONResponse:
        """Valida A (A mod N ≠ 0), sortea b y responde con la sal y B = (k·v + g^b) mod N. Cubre C1 y C3."""
        self._ctx.audit(f"{PREFIX}/login/start", body.model_dump(), MECHANISM_ID)
        self._event("paso", "El banco recibe A", body.model_dump())
        A = int(body.A)
        error = self._start_error(body, A)
        if error is not None:
            return error
        with self._ctx.lock:
            record = self._records[body.user_id]
        session_id, session = self._open_session(body.user_id, A, record)
        self._event("paso", "A mod N ≠ 0 ✔ → el banco sortea b y envía la sal y B",
                    {"session_id": session_id, "B": str(session.B)})
        return StartResponse(session_id=session_id, salt=record.salt.hex(), B=str(session.B))

    def _take_session(self, session_id: str) -> SrpSession | None:
        with self._ctx.lock:
            session = self._sessions.get(session_id)
            if session is not None:
                self._sessions = {k: s for k, s in self._sessions.items() if k != session_id}
                self._open_sessions = {u: s for u, s in self._open_sessions.items() if s != session_id}
            return session

    def _expected(self, session: SrpSession) -> tuple[bytes, bytes, dict[str, str]]:
        """(M1 esperado, K, valores para la bitácora) calculados con v y b."""
        with self._ctx.lock:
            record = self._records[session.user_id]
        group = self.group
        u = srp6a.scrambler(group, session.A, session.B)
        S = srp6a.server_premaster(group, session.A, record.v, u, session.b)
        K = srp6a.session_key(group, S)
        M1 = srp6a.client_proof(group, session.user_id, record.salt, session.A, session.B, K)
        return M1, K, {"u": str(u), "S = (A·v^u)^b mod N": str(S), "K = H(S)": K.hex(), "M1 esperado": M1.hex()}

    def login_verify(self, body: VerifyRequest) -> VerifyResponse | JSONResponse:
        """Compara M1 en tiempo constante; si coincide responde con M2 (autenticación mutua). Cubre C1, C3 y C4."""
        self._ctx.audit(f"{PREFIX}/login/verify", body.model_dump(), MECHANISM_ID)
        self._event("paso", "El banco recibe M1", body.model_dump())
        session = self._take_session(body.session_id)
        if session is None:
            self._event("verificacion", f"Rechazado: {INVALID_SESSION}", {"session_id": body.session_id})
            return VerifyResponse(accepted=False, reason=INVALID_SESSION, M2=None, attempts_left=None)
        if self._limiter.is_locked(session.user_id):
            return self._reject(status.HTTP_423_LOCKED, ACCOUNT_LOCKED, session.user_id)
        expected, K, details = self._expected(session)
        if not hmac.compare_digest(expected, bytes.fromhex(body.M1)):
            with self._ctx.lock:
                attempts_left = self._limiter.fail(session.user_id)
            self._event("verificacion", f"Rechazado: {BAD_PROOF}", {**details, "attempts_left": str(attempts_left)})
            return VerifyResponse(accepted=False, reason=BAD_PROOF, M2=None, attempts_left=attempts_left)
        with self._ctx.lock:
            attempts_left = self._limiter.succeed(session.user_id)
        M2 = srp6a.server_proof(self.group, session.A, expected, K).hex()
        self._event("verificacion", "ACCESO CONCEDIDO", {**details, "M2 = H(A | M1 | K)": M2,
                                                         "accepted": "True", "attempts_left": str(attempts_left)})
        return VerifyResponse(accepted=True, reason=ACCESS_GRANTED, M2=M2, attempts_left=attempts_left)

    def router(self) -> APIRouter:
        """Rutas /srp/... con sus descripciones para Swagger. Cubre C1."""
        router = APIRouter(prefix=PREFIX, tags=[TAG])
        router.add_api_route("/params", self.read_params, methods=["GET"], response_model=ParamsResponse,
                             summary="Parámetros públicos (N, g, hash)")
        router.add_api_route("/register", self.register, methods=["POST"], status_code=201,
                             response_model=RegisterResponse, responses=ERRORS,
                             summary="Crear cuenta: enviar la sal y el verificador v")
        router.add_api_route("/login/start", self.login_start, methods=["POST"], response_model=StartResponse,
                             responses={**ERRORS, 404: {"model": ErrorResponse}, 423: {"model": ErrorResponse}},
                             summary="Paso 1: enviar A y recibir la sal y B")
        router.add_api_route("/login/verify", self.login_verify, methods=["POST"], response_model=VerifyResponse,
                             responses={**ERRORS, 423: {"model": ErrorResponse}},
                             summary="Paso 2: enviar M1 y recibir M2")
        return router


def create_server(ctx: ServerContext, settings: Mapping[str, str]) -> SrpServer:
    """Fábrica que usa el registro de mecanismos. Cubre C1."""
    return SrpServer(ctx, settings)
