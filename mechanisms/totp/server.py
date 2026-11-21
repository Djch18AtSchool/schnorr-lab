"""Parte del banco del mecanismo contraseña + TOTP: endpoints /totp/... y sus eventos (C1–C4).

El banco guarda por usuario el hash Argon2id de la contraseña, el secreto compartido K (en claro:
lo necesita para calcular los códigos) y el último paso de tiempo aceptado, para rechazar un
código repetido. El reloj es inyectable (atributo clock) para las pruebas y el experimento.
"""

import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, replace
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
from mechanisms.totp import otp
from mechanisms.totp.info import INFO, MECHANISM_ID
from mechanisms.totp.schemas import (
    ConfirmRequest,
    CredentialsRequest,
    EnrollResponse,
    LoginRequest,
    LoginResponse,
)

PREFIX = "/totp"
TAG = "Contraseña + TOTP"
USER_EXISTS = "El usuario ya está registrado"
NO_PENDING_ENROLLMENT = "No hay un enrolamiento pendiente para ese usuario"
ENROLLED = "Segundo factor activado"
ACCESS_GRANTED = "Acceso concedido"
BAD_CODE = "Código incorrecto"
BAD_CREDENTIALS = "Usuario, contraseña o código incorrectos"
CODE_REUSED = "Código ya utilizado: espere el siguiente (cambia cada 30 s)"
ACCOUNT_LOCKED = "Cuenta bloqueada por intentos fallidos"
NO_STEP = "—"
ERRORS = {400: {"model": ErrorResponse}, 422: {"model": ErrorResponse}}
LOCKED_ERRORS = {**ERRORS, 423: {"model": ErrorResponse}}


@dataclass(frozen=True)
class TotpAccount:
    """Lo que el banco guarda de un usuario."""

    password_hash: str
    secret: str
    active: bool = False
    last_step: int | None = None

    def to_json(self) -> dict[str, str]:
        return {"hash": self.password_hash, "totp_secret": self.secret,
                "last_step": NO_STEP if self.last_step is None else str(self.last_step),
                "status": "activo" if self.active else "pendiente de confirmar"}


class TotpServer:
    """Banco del mecanismo contraseña + TOTP. Cubre C1."""

    info = INFO
    audited_paths = frozenset({f"{PREFIX}/register", f"{PREFIX}/register/confirm", f"{PREFIX}/login"})

    def __init__(self, ctx: ServerContext, settings: Mapping[str, str],
                 clock: Callable[[], float] = time.time) -> None:
        self._ctx = ctx
        self.clock = clock
        self._accounts: dict[str, TotpAccount] = {}
        self._limiter = AttemptLimiter()

    def reset(self, settings: Mapping[str, str]) -> None:
        """Olvida cuentas e intentos (solo laboratorio). Cubre C1."""
        with self._ctx.lock:
            self._accounts = {}
            self._limiter = AttemptLimiter()

    def describe(self) -> dict[str, Any]:
        """Parámetros de Argon2id, de TOTP y del bloqueo, para la interfaz. Cubre C2."""
        return {**argon2_parameters(), "digitos": otp.DIGITS, "periodo_s": otp.PERIOD_SECONDS,
                "ventana": f"±{otp.VALID_WINDOW}", "max_attempts": self._limiter.max_attempts}

    def stored_credentials(self) -> dict[str, dict[str, str]]:
        """Lo que guarda el banco: hash de la contraseña y el secreto K en claro. Cubre C2."""
        with self._ctx.lock:
            return {user_id: account.to_json() for user_id, account in self._accounts.items()}

    def _event(self, kind: str, title: str, data: Mapping[str, Any]) -> None:
        self._ctx.events.publish("banco", kind, title, mechanism=MECHANISM_ID, data=data)

    def _save(self, user_id: str, account: TotpAccount) -> None:
        with self._ctx.lock:
            self._accounts = {**self._accounts, user_id: account}

    def _insert(self, user_id: str, password: str) -> bool:
        """Crea la cuenta pendiente; False si otro registro del mismo id llegó antes."""
        account = TotpAccount(password_hash=hash_password(password), secret=otp.new_secret())
        with self._ctx.lock:
            if user_id in self._accounts:
                return False
            self._accounts = {**self._accounts, user_id: account}
        return True

    def _account(self, user_id: str) -> tuple[TotpAccount | None, bool]:
        with self._ctx.lock:
            return self._accounts.get(user_id), self._limiter.is_locked(user_id)

    def _fail(self, user_id: str, reason: str, data: Mapping[str, str]) -> LoginResponse:
        with self._ctx.lock:
            attempts_left = self._limiter.fail(user_id)
        self._event("verificacion", f"Rechazado: {reason}", {**data, "attempts_left": str(attempts_left)})
        return LoginResponse(accepted=False, reason=reason, attempts_left=attempts_left)

    def _locked(self, user_id: str) -> JSONResponse:
        self._event("error", ACCOUNT_LOCKED, {"user_id": user_id})
        return error_response(status.HTTP_423_LOCKED, ACCOUNT_LOCKED)

    # ------------------------------------------------------------------ endpoints

    def register(self, body: CredentialsRequest) -> EnrollResponse | JSONResponse:
        """Guarda el hash de la contraseña y un K nuevo, y devuelve K como QR (otpauth://). Cubre C1 y C2."""
        self._ctx.audit(f"{PREFIX}/register", body.model_dump(), MECHANISM_ID)
        self._event("registro", "El banco recibe una contraseña en claro", {"user_id": body.user_id})
        if self._account(body.user_id)[0] is not None or not self._insert(body.user_id, body.password):
            self._event("error", f"Registro rechazado: {USER_EXISTS}", {"user_id": body.user_id})
            return error_response(status.HTTP_400_BAD_REQUEST, USER_EXISTS)
        account = self._account(body.user_id)[0]
        self._event("registro", "El banco guarda el hash y el secreto K, y envía K como QR",
                    {"user_id": body.user_id, **account.to_json()})
        return EnrollResponse(user_id=body.user_id, secret=account.secret,
                              otpauth_uri=otp.provisioning_uri(account.secret, body.user_id),
                              digits=otp.DIGITS, period=otp.PERIOD_SECONDS, stored=account.to_json())

    def confirm(self, body: ConfirmRequest) -> LoginResponse | JSONResponse:
        """Activa el segundo factor si el primer código coincide; ese paso queda usado. Cubre C1 y C3."""
        self._ctx.audit(f"{PREFIX}/register/confirm", body.model_dump(), MECHANISM_ID)
        account, locked = self._account(body.user_id)
        if locked:
            return self._locked(body.user_id)
        if account is None or account.active:
            return error_response(status.HTTP_400_BAD_REQUEST, NO_PENDING_ENROLLMENT)
        step = otp.matching_step(account.secret, body.code, self.clock())
        if step is None:
            return self._fail(body.user_id, BAD_CODE, {"user_id": body.user_id})
        self._save(body.user_id, replace(account, active=True, last_step=step))
        self._event("registro", "El código coincide → segundo factor activado", {"user_id": body.user_id,
                                                                                "paso T": str(step)})
        return LoginResponse(accepted=True, reason=ENROLLED, attempts_left=self._limiter.max_attempts)

    def _check_code(self, account: TotpAccount, code: str) -> tuple[int | None, bool]:
        """(paso que coincide o None, True si ese paso ya se había usado)."""
        step = otp.matching_step(account.secret, code, self.clock())
        reused = step is not None and account.last_step is not None and step <= account.last_step
        return step, reused

    def login(self, body: LoginRequest) -> LoginResponse | JSONResponse:
        """Verifica contraseña (Argon2id) y código (ventana ±1, sin reuso); bloquea al tercer fallo.

        Un código repetido no suma fallo: así un espía no puede bloquear a la víctima. Cubre C1, C3 y C4.
        """
        self._ctx.audit(f"{PREFIX}/login", body.model_dump(), MECHANISM_ID)
        self._event("paso", "El banco recibe usuario, contraseña y código", {"user_id": body.user_id})
        account, locked = self._account(body.user_id)
        if locked:
            return self._locked(body.user_id)
        usable = account is not None and account.active
        password_ok = verify_password(account.password_hash if usable else dummy_hash(), body.password) and usable
        if not password_ok:
            return self._fail(body.user_id, BAD_CREDENTIALS, {"user_id": body.user_id, "contraseña": "no coincide"})
        step, reused = self._check_code(account, body.code)
        if step is None:
            return self._fail(body.user_id, BAD_CREDENTIALS, {"user_id": body.user_id, "código": "no coincide"})
        if reused:
            self._event("verificacion", f"Rechazado: {CODE_REUSED}", {"user_id": body.user_id, "paso T": str(step)})
            return LoginResponse(accepted=False, reason=CODE_REUSED,
                                 attempts_left=self._limiter.attempts_left(body.user_id))
        self._save(body.user_id, replace(account, last_step=step))
        with self._ctx.lock:
            attempts_left = self._limiter.succeed(body.user_id)
        self._event("verificacion", "ACCESO CONCEDIDO", {"user_id": body.user_id, "paso T": str(step),
                                                         "accepted": "True", "attempts_left": str(attempts_left)})
        return LoginResponse(accepted=True, reason=ACCESS_GRANTED, attempts_left=attempts_left)

    def router(self) -> APIRouter:
        """Rutas /totp/... con sus descripciones para Swagger. Cubre C1."""
        router = APIRouter(prefix=PREFIX, tags=[TAG])
        router.add_api_route("/register", self.register, methods=["POST"], status_code=201,
                             response_model=EnrollResponse, responses=ERRORS,
                             summary="Crear cuenta: enviar la contraseña y recibir el secreto TOTP (QR)")
        router.add_api_route("/register/confirm", self.confirm, methods=["POST"], response_model=LoginResponse,
                             responses=LOCKED_ERRORS, summary="Confirmar el enrolamiento con el primer código")
        router.add_api_route("/login", self.login, methods=["POST"], response_model=LoginResponse,
                             responses=LOCKED_ERRORS, summary="Iniciar sesión: contraseña y código TOTP")
        return router


def create_server(ctx: ServerContext, settings: Mapping[str, str]) -> TotpServer:
    """Fábrica que usa el registro de mecanismos. Cubre C1."""
    return TotpServer(ctx, settings)
