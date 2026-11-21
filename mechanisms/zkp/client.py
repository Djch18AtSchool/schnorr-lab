"""Parte del celular del mecanismo ZKP: los pasos de cada flujo, en orden (R2, R3, R6, R11).

Cada paso es una función pequeña que recibe el FlowContext, hace un cálculo local con
protocol.Client o un intercambio HTTP con el banco, y devuelve lo que la interfaz debe mostrar.
La clave secreta x vive en el «wallet» del celular y nunca se pone en un cuerpo HTTP.
"""

from typing import Any

from mechanisms.base import ClientStep, Exchange, FlowContext, StepError, StepResult
from mechanisms.zkp.info import INFO, MECHANISM_ID
from mechanisms.zkp.observe import short
from protocol import GroupParams, validate_params
from protocol.client import Client
from protocol.fiat_shamir import current_timestamp, hash_challenge, prove

MAX_TRACE_BITS = 64
DEFECTS_KEY = "defects"            # fallas simuladas del celular (laboratorio): {"reuse_r": True, "r": ...}


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
    math = (f"g^q mod p = {short(gp.g)}^{short(gp.q)} mod {short(gp.p)} = {pow(gp.g, gp.q, gp.p)} ✔",)
    return StepResult(values=values, exchange=exchange, math=math)


def generate_keys(ctx: FlowContext) -> StepResult:
    """Elige x al azar y calcula y = g^x mod p, sin enviar nada. Cubre R2 y R3."""
    gp: GroupParams = ctx.state["gp"]
    trace = _trace(ctx, gp)
    client = Client(ctx.user_id, gp, trace=trace)
    ctx.state["client"] = client
    values = {"x (secreta, se queda en el celular)": str(client.x), "y = g^x mod p": str(client.y)}
    math = (f"x = {short(client.x)}  (al azar en [1, q − 1])",
            f"y = g^x mod p = {short(gp.g)}^{short(client.x)} mod {short(gp.p)} = {short(client.y)}")
    return StepResult(values=values, trace=tuple(trace or ()), math=math)


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
    t = client.commit(r=_defective_r(ctx), trace=trace)
    r = client.pending_r
    ctx.state.update(client=client, t=t, r=r)
    values = {"r (aleatorio, de un solo uso)": str(r), "t = g^r mod p": str(t)}
    gp = client.gp
    math = (f"t = g^r mod p = {short(gp.g)}^{short(r)} mod {short(gp.p)} = {short(t)}",)
    return StepResult(values=values, trace=tuple(trace or ()), math=math)


def _defective_r(ctx: FlowContext) -> int | None:
    """Con la falla «reuse_r» (solo laboratorio) el celular repite el mismo r en cada inicio de sesión."""
    defects = ctx.state.get(DEFECTS_KEY)
    if not defects or not defects.get("reuse_r"):
        return None
    return defects.get("r")


def _remember_defective_r(ctx: FlowContext, r: int) -> None:
    defects = ctx.state.get(DEFECTS_KEY)
    if defects and defects.get("reuse_r") and "r" not in defects:
        defects["r"] = r


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
    _remember_defective_r(ctx, r)
    substitution = f"{r} + {c}·{client.x} mod {client.gp.q} = {s}"
    values = {"x (secreta)": str(client.x), "s": str(s), "cálculo": substitution}
    math = (f"s = (r + c·x) mod q = ({short(r)} + {short(c)}·{short(client.x)}) mod {short(client.gp.q)} = {short(s)}",
            "r se borra: no se vuelve a usar")
    return StepResult(values=values, math=math)


def _verdict(exchange: Exchange) -> StepResult:
    """Convierte la decisión del banco (aceptado o no, con los valores verificados) en el último paso."""
    data = exchange.response_body if isinstance(exchange.response_body, dict) else {}
    details = data.get("details") or {}
    labels = {"gs": "g^s mod p", "tyc": "t·y^c mod p", "yc": "y^c mod p",
              "yc_inv": "(y^c)^-1 mod p (Euclides)", "t_rec": "g^s·(y^c)^-1 mod p"}
    values = {label: str(details[key]) for key, label in labels.items() if key in details}
    values["intentos restantes"] = str(data.get("attempts_left"))
    accepted = data.get("accepted") is True
    return StepResult(values=values, exchange=exchange, outcome="aceptado" if accepted else "rechazado",
                      message=str(data.get("reason", "Respuesta inesperada del banco")), finished=True)


def send_response(ctx: FlowContext) -> StepResult:
    """Envía s y recibe la decisión del banco con los valores de la verificación. Cubre R6 y R9."""
    body = {"session_id": ctx.state["session_id"], "s": str(ctx.state["s"])}
    return _verdict(_send(ctx, "POST", "/zkp/login/respond", body))


def prove_noninteractive(ctx: FlowContext) -> StepResult:
    """Calcula la prueba de Fiat-Shamir (t, s, m) sin esperar un reto del banco. Cubre R8."""
    client = _stored_client(ctx)
    proof = prove(client, m=current_timestamp())
    c = hash_challenge(client.gp, client.y, proof.t, proof.user_id, proof.m)
    ctx.state["proof"] = proof
    values = {"t = g^r mod p": str(proof.t), "m (hora del intento)": str(proof.m),
              "c = H(p‖g‖y‖t‖id‖m) mod q": str(c), "s = (r + c·x) mod q": str(proof.s),
              "r": "se usó una vez y se borró"}
    gp = client.gp
    math = (f"t = g^r mod p = {short(proof.t)}",
            f"c = SHA-256(p ‖ g ‖ y ‖ t ‖ id ‖ m) mod q = {short(c)}  (m = {proof.m})",
            f"s = (r + c·x) mod q = {short(proof.s)}  (q = {short(gp.q)})")
    return StepResult(values=values, math=math)


def send_proof(ctx: FlowContext) -> StepResult:
    """Envía la prueba en un solo mensaje; el banco recalcula c y verifica. Cubre R8 y R9."""
    proof = ctx.state["proof"]
    body = {"user_id": proof.user_id, "t": str(proof.t), "s": str(proof.s), "m": str(proof.m)}
    return _verdict(_send(ctx, "POST", "/zkp/login/nizk", body))


FLOW_ACTIONS = {
    "register": (fetch_params, generate_keys, send_registration),
    "login": (fetch_params, commit, send_commitment, respond, send_response),
    "login_nizk": (fetch_params, prove_noninteractive, send_proof),
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

    def matches(self, secret: Client, stored: dict[str, str]) -> bool:
        """True si la clave del celular corresponde a lo que guarda el banco (misma y). Cubre R2."""
        return stored.get("y") == str(secret.y)

    def describe_secret(self, secret: Client) -> dict[str, str]:
        """Lo que el celular tiene guardado para una cuenta (se muestra solo en su pantalla). Cubre R2."""
        return {"grupo": secret.gp.name, "x (secreta)": str(secret.x), "y (pública)": str(secret.y)}


def create_client() -> ZkpClient:
    """Fábrica que usa el registro de mecanismos. Cubre R11."""
    return ZkpClient()
