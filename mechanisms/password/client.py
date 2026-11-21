"""Parte del celular del mecanismo de contraseña: los pasos de cada flujo, en orden (C1).

La contraseña vive en el wallet del celular (la «memoria» de la persona) y, a diferencia del
ZKP, sí viaja en el cuerpo HTTP: es justamente lo que se compara.
"""

from dataclasses import dataclass
from typing import Any

from mechanisms.base import ClientStep, Exchange, FlowContext, StepError, StepResult
from mechanisms.password.credentials import generate_password
from mechanisms.password.info import INFO, MECHANISM_ID


@dataclass(frozen=True)
class PasswordSecret:
    """Lo que el celular (la persona) recuerda para una cuenta."""

    password: str


def _reason(body: Any, fallback: str) -> str:
    return str(body.get("reason", fallback)) if isinstance(body, dict) else fallback


def _send(ctx: FlowContext, path: str, body: dict[str, str]) -> Exchange:
    return ctx.gateway.request("POST", path, body, correlation_id=ctx.correlation_id, mechanism=MECHANISM_ID)


def _stored_secret(ctx: FlowContext) -> PasswordSecret:
    secret = ctx.wallet.get((MECHANISM_ID, ctx.user_id))
    if secret is None:
        raise StepError(f"Este celular no recuerda una contraseña para «{ctx.user_id}»: primero cree la cuenta.")
    return secret


# ------------------------------------------------------------------------- pasos

def choose_password(ctx: FlowContext) -> StepResult:
    """Genera la contraseña que la persona «recordará». Cubre C1."""
    password = generate_password()
    ctx.state["password"] = password
    return StepResult(values={"contraseña (la recuerda la persona)": password,
                              "longitud": str(len(password))})


def send_registration(ctx: FlowContext) -> StepResult:
    """Envía usuario y contraseña; si el banco acepta, el celular la recuerda. Cubre C1 y C2."""
    password = ctx.state["password"]
    exchange = _send(ctx, "/password/register", {"user_id": ctx.user_id, "password": password})
    if exchange.status != 201:
        message = _reason(exchange.response_body, "El banco rechazó el registro")
        return StepResult(exchange=exchange, outcome="rechazado", message=message, finished=True)
    ctx.wallet[(MECHANISM_ID, ctx.user_id)] = PasswordSecret(password)
    return StepResult(values={"lo que guarda el banco": "solo el hash Argon2id (con su sal)"},
                      exchange=exchange, outcome="aceptado", finished=True,
                      message="Cuenta creada: el banco guarda el hash, pero la contraseña viajó completa.")


def recall_password(ctx: FlowContext) -> StepResult:
    """Toma la contraseña que la persona recuerda. Cubre C1."""
    ctx.state["password"] = _stored_secret(ctx).password
    return StepResult(values={"contraseña escrita": ctx.state["password"]})


def send_login(ctx: FlowContext) -> StepResult:
    """Envía usuario y contraseña y recibe la decisión del banco. Cubre C1 y C3."""
    exchange = _send(ctx, "/password/login", {"user_id": ctx.user_id, "password": ctx.state["password"]})
    data = exchange.response_body if isinstance(exchange.response_body, dict) else {}
    accepted = exchange.status == 200 and data.get("accepted") is True
    values = {"intentos restantes": str(data.get("attempts_left"))}
    return StepResult(values=values, exchange=exchange, outcome="aceptado" if accepted else "rechazado",
                      message=_reason(data, "Respuesta inesperada del banco"), finished=True)


FLOW_ACTIONS = {
    "register": (choose_password, send_registration),
    "login": (recall_password, send_login),
}


class PasswordClient:
    """Mecanismo de contraseña del lado del celular. Cubre C1."""

    info = INFO

    def steps(self, flow_id: str) -> list[ClientStep]:
        """Los pasos del flujo pedido, emparejando su descripción con su acción. Cubre C1."""
        flow = INFO.flow(flow_id)
        actions = FLOW_ACTIONS[flow_id]
        return [ClientStep(info, action) for info, action in zip(flow.steps, actions, strict=True)]

    def describe_secret(self, secret: PasswordSecret) -> dict[str, str]:
        """Lo que la persona recuerda para esa cuenta (se muestra solo en su pantalla). Cubre C1."""
        return {"contraseña (la recuerda la persona)": secret.password}


def create_client() -> PasswordClient:
    """Fábrica que usa el registro de mecanismos. Cubre C1."""
    return PasswordClient()
