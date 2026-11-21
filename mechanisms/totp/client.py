"""Parte del celular del mecanismo contraseña + TOTP: los pasos de cada flujo, en orden (C1).

El wallet guarda la contraseña (la «memoria» de la persona) y el secreto K (la app
autenticadora). En cada inicio de sesión viajan la contraseña y el código; K viaja una sola
vez, del banco al celular, al enrolar. El reloj es inyectable (atributo clock).
"""

import re
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from mechanisms.base import (
    ClientStep,
    Exchange,
    FlowContext,
    StepAction,
    StepError,
    StepResult,
)
from mechanisms.password.client import choose_password
from mechanisms.totp import otp
from mechanisms.totp.info import INFO, MECHANISM_ID

SECRET_REGEX = re.compile(otp.SECRET_PATTERN)


@dataclass(frozen=True)
class TotpSecret:
    """Lo que el celular guarda para una cuenta: la contraseña y el secreto K del autenticador."""

    password: str
    totp_secret: str


def _reason(body: Any, fallback: str) -> str:
    return str(body.get("reason", fallback)) if isinstance(body, dict) else fallback


def _send(ctx: FlowContext, path: str, body: dict[str, str]) -> Exchange:
    return ctx.gateway.request("POST", path, body, correlation_id=ctx.correlation_id, mechanism=MECHANISM_ID)


def _verdict(exchange: Exchange, success_message: str = "") -> StepResult:
    data = exchange.response_body if isinstance(exchange.response_body, dict) else {}
    accepted = exchange.status == 200 and data.get("accepted") is True
    message = success_message if accepted and success_message else _reason(data, "Respuesta inesperada del banco")
    return StepResult(values={"intentos restantes": str(data.get("attempts_left"))}, exchange=exchange,
                      outcome="aceptado" if accepted else "rechazado", message=message, finished=True)


def _stored_secret(ctx: FlowContext) -> TotpSecret:
    secret = ctx.wallet.get((MECHANISM_ID, ctx.user_id))
    if secret is None:
        raise StepError(f"Este celular no tiene una cuenta TOTP para «{ctx.user_id}»: primero cree la cuenta.")
    return secret


class TotpClient:
    """Mecanismo contraseña + TOTP del lado del celular. Cubre C1."""

    info = INFO

    def __init__(self, clock: Callable[[], float] = time.time) -> None:
        self.clock = clock

    # --------------------------------------------------------------------- pasos

    def enroll(self, ctx: FlowContext) -> StepResult:
        """Envía usuario y contraseña y recibe el secreto K (el QR). Cubre C1 y C2."""
        exchange = _send(ctx, "/totp/register", {"user_id": ctx.user_id, "password": ctx.state["password"]})
        data = exchange.response_body
        if exchange.status != 201:
            return StepResult(exchange=exchange, outcome="rechazado", finished=True,
                              message=_reason(data, "El banco rechazó el registro"))
        secret = str(data.get("secret", "")) if isinstance(data, dict) else ""
        if not SECRET_REGEX.fullmatch(secret):
            raise StepError(f"El banco envió un secreto TOTP mal formado: {data}")
        ctx.state["totp_secret"] = secret
        return StepResult(values={"K (secreto compartido, base32)": secret, "QR": str(data.get("otpauth_uri"))},
                          exchange=exchange)

    def first_code(self, ctx: FlowContext) -> StepResult:
        """La app autenticadora guarda K y calcula el código actual. Cubre C1."""
        return self._code_values(ctx, ctx.state["totp_secret"])

    def confirm(self, ctx: FlowContext) -> StepResult:
        """Envía el primer código; si el banco lo acepta, el celular guarda contraseña y K. Cubre C1."""
        exchange = _send(ctx, "/totp/register/confirm", {"user_id": ctx.user_id, "code": ctx.state["code"]})
        result = _verdict(exchange, "Cuenta creada: el banco guarda el hash y el secreto K.")
        if result.outcome == "aceptado":
            ctx.wallet[(MECHANISM_ID, ctx.user_id)] = TotpSecret(ctx.state["password"], ctx.state["totp_secret"])
        return result

    def recall_password(self, ctx: FlowContext) -> StepResult:
        """Toma la contraseña que la persona recuerda. Cubre C1."""
        ctx.state["password"] = _stored_secret(ctx).password
        return StepResult(values={"contraseña escrita": ctx.state["password"]})

    def current_code(self, ctx: FlowContext) -> StepResult:
        """Calcula el código del paso de tiempo actual con K. Cubre C1."""
        return self._code_values(ctx, _stored_secret(ctx).totp_secret)

    def send_login(self, ctx: FlowContext) -> StepResult:
        """Envía usuario, contraseña y código y recibe la decisión del banco. Cubre C1 y C4."""
        body = {"user_id": ctx.user_id, "password": ctx.state["password"], "code": ctx.state["code"]}
        return _verdict(_send(ctx, "/totp/login", body))

    def _code_values(self, ctx: FlowContext, secret: str) -> StepResult:
        now = self.clock()
        ctx.state["code"] = otp.code_at(secret, now)
        return StepResult(values={"t (reloj del celular)": str(int(now)), "T = ⌊t/30⌋": str(otp.time_step(now)),
                                  "código": ctx.state["code"]})

    # ------------------------------------------------------------------ contrato

    def _actions(self, flow_id: str) -> tuple[StepAction, ...]:
        flows = {"register": (choose_password, self.enroll, self.first_code, self.confirm),
                 "login": (self.recall_password, self.current_code, self.send_login)}
        return flows[flow_id]

    def steps(self, flow_id: str) -> list[ClientStep]:
        """Los pasos del flujo pedido, emparejando su descripción con su acción. Cubre C1."""
        flow = INFO.flow(flow_id)
        return [ClientStep(info, action) for info, action in zip(flow.steps, self._actions(flow_id), strict=True)]

    def describe_secret(self, secret: TotpSecret) -> dict[str, str]:
        """Lo que el celular guarda para esa cuenta (se muestra solo en su pantalla). Cubre C2."""
        return {"contraseña (la recuerda la persona)": secret.password,
                "K (en la app autenticadora)": secret.totp_secret}


def create_client() -> TotpClient:
    """Fábrica que usa el registro de mecanismos. Cubre C1."""
    return TotpClient()
