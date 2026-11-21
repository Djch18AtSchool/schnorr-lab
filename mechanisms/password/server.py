"""Parte del banco del mecanismo de contraseña: endpoints /password/... y sus eventos (C1, C2, C3).

El banco recibe la contraseña en claro (sobre TLS, se asume), guarda solo su hash Argon2id y
bloquea la cuenta al tercer fallo seguido, con la misma regla que el ZKP.
"""

from collections.abc import Mapping
from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from infra.server_context import ServerContext
from mechanisms.common import AttemptLimiter, ErrorResponse, error_response
from mechanisms.password.credentials import (
    argon2_parameters,
    dummy_hash,
    hash_password,
    verify_password,
)
from mechanisms.password.info import INFO, MECHANISM_ID
from mechanisms.password.schemas import (
    CredentialsRequest,
    LoginResponse,
    RegisterResponse,
)

PREFIX = "/password"
TAG = "Contraseña · Argon2id"
USER_EXISTS = "El usuario ya está registrado"
REGISTERED = "Cuenta creada"
ACCESS_GRANTED = "Acceso concedido"
BAD_CREDENTIALS = "Usuario o contraseña incorrectos"
ACCOUNT_LOCKED = "Cuenta bloqueada por intentos fallidos"
ERRORS = {400: {"model": ErrorResponse}, 422: {"model": ErrorResponse}}


class PasswordServer:
    """Banco del mecanismo de contraseña: tabla id → hash Argon2id y control de intentos. Cubre C1."""

    info = INFO
    audited_paths = frozenset({f"{PREFIX}/register", f"{PREFIX}/login"})

    def __init__(self, ctx: ServerContext, settings: Mapping[str, str]) -> None:
        self._ctx = ctx
        self._hashes: dict[str, str] = {}
        self._limiter = AttemptLimiter()

    def reset(self, settings: Mapping[str, str]) -> None:
        """Olvida usuarios e intentos (solo laboratorio). Cubre C1."""
        with self._ctx.lock:
            self._hashes = {}
            self._limiter = AttemptLimiter()

    def describe(self) -> dict[str, Any]:
        """Parámetros de Argon2id y del bloqueo, para la interfaz. Cubre C2."""
        return {**argon2_parameters(), "max_attempts": self._limiter.max_attempts}

    def stored_credentials(self) -> dict[str, dict[str, str]]:
        """Lo que guarda el banco: el hash Argon2id codificado (incluye sal y parámetros). Cubre C2."""
        with self._ctx.lock:
            return {user_id: {"hash": stored} for user_id, stored in self._hashes.items()}

    def _event(self, kind: str, title: str, data: Mapping[str, Any]) -> None:
        self._ctx.events.publish("banco", kind, title, mechanism=MECHANISM_ID, data=data)

    # ------------------------------------------------------------------ endpoints

    def register(self, body: CredentialsRequest) -> RegisterResponse | JSONResponse:
        """Calcula Argon2id(contraseña, sal) y guarda solo el hash; rechaza id repetido. Cubre C1 y C2."""
        self._ctx.audit(f"{PREFIX}/register", body.model_dump(), MECHANISM_ID)
        self._event("registro", "El banco recibe una contraseña en claro", {"user_id": body.user_id})
        with self._ctx.lock:
            exists = body.user_id in self._hashes
        if exists:
            self._event("error", f"Registro rechazado: {USER_EXISTS}", {"user_id": body.user_id})
            return error_response(status.HTTP_400_BAD_REQUEST, USER_EXISTS)
        stored = hash_password(body.password)
        with self._ctx.lock:
            if body.user_id in self._hashes:
                return error_response(status.HTTP_400_BAD_REQUEST, USER_EXISTS)
            self._hashes = {**self._hashes, body.user_id: stored}
        self._event("registro", "Argon2id(contraseña, sal) → el banco guarda solo el hash",
                    {"user_id": body.user_id, "hash": stored})
        return RegisterResponse(user_id=body.user_id, stored={"hash": stored})

    def login(self, body: CredentialsRequest) -> LoginResponse | JSONResponse:
        """Recalcula Argon2id y compara; tres fallos seguidos bloquean la cuenta. Cubre C1 y C3."""
        self._ctx.audit(f"{PREFIX}/login", body.model_dump(), MECHANISM_ID)
        self._event("paso", "El banco recibe usuario y contraseña", {"user_id": body.user_id})
        with self._ctx.lock:
            locked = self._limiter.is_locked(body.user_id)
            stored = self._hashes.get(body.user_id)
        if locked:
            self._event("error", ACCOUNT_LOCKED, {"user_id": body.user_id})
            return error_response(status.HTTP_423_LOCKED, ACCOUNT_LOCKED)
        matches = verify_password(stored or dummy_hash(), body.password) and stored is not None
        with self._ctx.lock:
            attempts_left = self._limiter.succeed(body.user_id) if matches else self._limiter.fail(body.user_id)
        reason = ACCESS_GRANTED if matches else BAD_CREDENTIALS
        self._event("verificacion", "ACCESO CONCEDIDO" if matches else f"Rechazado: {reason}",
                    {"user_id": body.user_id, "Argon2id coincide": "sí" if matches else "no",
                     "accepted": str(matches), "attempts_left": str(attempts_left)})
        return LoginResponse(accepted=matches, reason=reason, attempts_left=attempts_left)

    def router(self) -> APIRouter:
        """Rutas /password/... con sus descripciones para Swagger. Cubre C1."""
        router = APIRouter(prefix=PREFIX, tags=[TAG])
        router.add_api_route("/register", self.register, methods=["POST"], status_code=201,
                             response_model=RegisterResponse, responses=ERRORS,
                             summary="Crear cuenta: enviar usuario y contraseña")
        router.add_api_route("/login", self.login, methods=["POST"], response_model=LoginResponse,
                             responses={**ERRORS, 423: {"model": ErrorResponse}},
                             summary="Iniciar sesión: enviar usuario y contraseña")
        return router


def create_server(ctx: ServerContext, settings: Mapping[str, str]) -> PasswordServer:
    """Fábrica que usa el registro de mecanismos. Cubre C1."""
    return PasswordServer(ctx, settings)
