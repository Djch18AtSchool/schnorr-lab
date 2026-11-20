"""Parte del celular del mecanismo ZKP: los pasos de cada flujo, en orden (R2, R3, R6, R11).

Cada paso es una función pequeña que recibe el FlowContext, hace un cálculo local con
protocol.Client o un intercambio HTTP con el banco, y devuelve lo que la interfaz debe mostrar.
La clave secreta x vive en el «wallet» del celular y nunca se pone en un cuerpo HTTP.
"""

from typing import Any

from mechanisms.base import ClientStep, FlowContext, StepError, StepResult
from mechanisms.zkp.info import INFO, MECHANISM_ID
from protocol import GroupParams, validate_params
from protocol.client import Client

MAX_TRACE_BITS = 64


def _trace(ctx: FlowContext, gp: GroupParams) -> list[str] | None:
    return [] if ctx.trace_enabled and gp.bits <= MAX_TRACE_BITS else None


def _reason(body: Any, fallback: str) -> str:
    return str(body.get("reason", fallback)) if isinstance(body, dict) else fallback


def _send(ctx: FlowContext, method: str, path: str, body: dict[str, str] | None = None):
    return ctx.gateway.request(method, path, body, correlation_id=ctx.correlation_id, mechanism=MECHANISM_ID)


def _stored_client(ctx: FlowContext) -> Client:
    client = ctx.wallet.get((MECHANISM_ID, ctx.user_id))
    if client is None:
        raise StepError(f"Este celular no tiene una clave para «{ctx.user_id}»: primero cree la cuenta.")
    if client.gp != ctx.state["gp"]:
        raise StepError("El banco cambió de grupo desde que se creó la cuenta: créela de nuevo.")
    return client


# ------------------------------------------------------------------------- pasos

def fetch_params(ctx: FlowContext) -> StepResult:
    """Descarga (p, q, g) del banco y los valida antes de usarlos. Cubre R1 y R11."""
    exchange = _send(ctx, "GET", "/zkp/params")
    data = exchange.response_body
    try:
        gp = GroupParams(p=int(data["p"]), q=int(data["q"]), g=int(data["g"]), name=str(data["name"]))
    except (KeyError, TypeError, ValueError) as error:
        raise StepError(f"El banco envió parámetros mal formados: {data}") from error
    failures = validate_params(gp, require_safe_prime=not gp.name.startswith("schnorr"))
    if failures:
        raise StepError(f"Parámetros inválidos: {'; '.join(failures)}")
    ctx.state["gp"] = gp
    values = {"grupo": gp.name, "p": str(gp.p), "q": str(gp.q), "g": str(gp.g),
              "bits de p": str(gp.bits), "¿válidos?": "sí: p, q primos y g^q ≡ 1 (mod p)"}
    return StepResult(values=values, exchange=exchange)


def generate_keys(ctx: FlowContext) -> StepResult:
    """Elige x al azar y calcula y = g^x mod p, sin enviar nada. Cubre R2 y R3."""
    gp: GroupParams = ctx.state["gp"]
    trace = _trace(ctx, gp)
    client = Client(ctx.user_id, gp, trace=trace)
    ctx.state["client"] = client
    values = {"x (secreta, se queda en el celular)": str(client.x), "y = g^x mod p": str(client.y)}
    return StepResult(values=values, trace=tuple(trace or ()))


def send_registration(ctx: FlowContext) -> StepResult:
    """Envía (id, y) al banco; si acepta, el celular guarda x en su wallet. Cubre R2 y R9."""
    client: Client = ctx.state["client"]
    user_id, y = client.register_payload()
    exchange = _send(ctx, "POST", "/zkp/register", {"user_id": user_id, "y": str(y)})
    if exchange.status != 201:
        message = _reason(exchange.response_body, "El banco rechazó el registro")
        return StepResult(exchange=exchange, outcome="rechazado", message=message, finished=True)
    ctx.wallet[(MECHANISM_ID, user_id)] = client
    return StepResult(values={"lo que guarda el banco": "solo y"}, exchange=exchange, outcome="aceptado",
                      message="Cuenta creada: el banco guarda solo la clave pública y.", finished=True)


def commit(ctx: FlowContext) -> StepResult:
    """Elige r nuevo y calcula t = g^r mod p. Cubre R3."""
    client = _stored_client(ctx)
    trace = _trace(ctx, client.gp)
    t = client.commit(trace=trace)
    ctx.state.update(client=client, t=t, r=client.pending_r)
    values = {"r (aleatorio, de un solo uso)": str(client.pending_r), "t = g^r mod p": str(t)}
    return StepResult(values=values, trace=tuple(trace or ()))


def send_commitment(ctx: FlowContext) -> StepResult:
    """Envía t y recibe el reto c y el identificador de sesión. Cubre R3 y R9."""
    body = {"user_id": ctx.user_id, "t": str(ctx.state["t"])}
    exchange = _send(ctx, "POST", "/zkp/login/commit", body)
    data = exchange.response_body
    if exchange.status != 200:
        message = _reason(data, "El banco rechazó el compromiso")
        return StepResult(exchange=exchange, outcome="rechazado", message=message, finished=True)
    try:
        ctx.state.update(session_id=str(data["session_id"]), c=int(data["c"]))
    except (KeyError, TypeError, ValueError) as error:
        raise StepError(f"El banco envió un reto mal formado: {data}") from error
    return StepResult(values={"c (reto del banco)": str(ctx.state["c"]),
                              "sesión": ctx.state["session_id"]}, exchange=exchange)


def respond(ctx: FlowContext) -> StepResult:
    """Calcula s = (r + c·x) mod q; el cliente borra r después. Cubre R3 y R6."""
    client: Client = ctx.state["client"]
    r, c = ctx.state["r"], ctx.state["c"]
    try:
        s = client.respond(c)
    except ValueError as error:
        raise StepError(f"Reto inválido: {error}") from error
    ctx.state["s"] = s
    substitution = f"{r} + {c}·{client.x} mod {client.gp.q} = {s}"
    values = {"x (secreta)": str(client.x), "s": str(s), "cálculo": substitution}
    return StepResult(values=values)


def send_response(ctx: FlowContext) -> StepResult:
    """Envía s y recibe la decisión del banco con los valores de la verificación. Cubre R6 y R9."""
    body = {"session_id": ctx.state["session_id"], "s": str(ctx.state["s"])}
    exchange = _send(ctx, "POST", "/zkp/login/respond", body)
    data = exchange.response_body if isinstance(exchange.response_body, dict) else {}
    details = data.get("details", {})
    labels = {"gs": "g^s mod p", "tyc": "t·y^c mod p", "yc": "y^c mod p",
              "yc_inv": "(y^c)^-1 mod p (Euclides)", "t_rec": "g^s·(y^c)^-1 mod p"}
    values = {label: str(details[key]) for key, label in labels.items() if key in details}
    values["intentos restantes"] = str(data.get("attempts_left"))
    accepted = data.get("accepted") is True
    return StepResult(values=values, exchange=exchange, outcome="aceptado" if accepted else "rechazado",
                      message=str(data.get("reason", "Respuesta inesperada del banco")), finished=True)


FLOW_ACTIONS = {
    "register": (fetch_params, generate_keys, send_registration),
    "login": (fetch_params, commit, send_commitment, respond, send_response),
}


class ZkpClient:
    """Mecanismo ZKP del lado del celular. Cubre R11."""

    info = INFO

    def steps(self, flow_id: str) -> list[ClientStep]:
        """Los pasos del flujo pedido, emparejando su descripción con su acción. Cubre R11."""
        flow = INFO.flow(flow_id)
        actions = FLOW_ACTIONS.get(flow_id)
        if not flow.available or actions is None:
            raise ValueError(f"El flujo «{flow.title}» está disponible en el informe final.")
        return [ClientStep(info, action) for info, action in zip(flow.steps, actions, strict=True)]

    def describe_secret(self, secret: Client) -> dict[str, str]:
        """Lo que el celular tiene guardado para una cuenta (se muestra solo en su pantalla). Cubre R2."""
        return {"grupo": secret.gp.name, "x (secreta)": str(secret.x), "y (pública)": str(secret.y)}


def create_client() -> ZkpClient:
    """Fábrica que usa el registro de mecanismos. Cubre R11."""
    return ZkpClient()
