"""Parte del celular del mecanismo SRP-6a: los pasos de cada flujo, en orden (C1, C4).

La contraseña vive en el wallet (la «memoria» de la persona); x, a, S y K solo existen en el
estado del flujo. Por la red viajan la sal, v (al registrarse), A, B, M1 y M2.
"""

from dataclasses import dataclass
from typing import Any

from mechanisms.base import ClientStep, Exchange, FlowContext, StepError, StepResult
from mechanisms.password.credentials import generate_password
from mechanisms.srp import srp6a
from mechanisms.srp.info import INFO, MECHANISM_ID

KNOWN_GROUP = srp6a.RFC5054_2048
B_IS_ZERO = "B ≡ 0 (mod N): el celular aborta (banco malicioso o mensaje alterado)"
B_OUT_OF_RANGE = "B debe cumplir 0 < B < N: el celular aborta (mensaje alterado)"
U_IS_ZERO = "u = 0: el celular aborta (la clave no dependería de la contraseña)"
FAKE_SERVER = "M2 no coincide: el servidor no conoce v (¿banco falso?). Sesión descartada."


@dataclass(frozen=True)
class SrpSecret:
    """Lo que la persona recuerda para una cuenta SRP."""

    password: str


def _reason(body: Any, fallback: str) -> str:
    return str(body.get("reason", fallback)) if isinstance(body, dict) else fallback


def _send(ctx: FlowContext, method: str, path: str, body: dict[str, str] | None = None) -> Exchange:
    return ctx.gateway.request(method, path, body, correlation_id=ctx.correlation_id, mechanism=MECHANISM_ID)


def _rejected(exchange: Exchange, fallback: str) -> StepResult:
    return StepResult(exchange=exchange, outcome="rechazado", finished=True,
                      message=_reason(exchange.response_body, fallback))


def _stored_secret(ctx: FlowContext) -> SrpSecret:
    secret = ctx.wallet.get((MECHANISM_ID, ctx.user_id))
    if secret is None:
        raise StepError(f"Este celular no recuerda una contraseña SRP para «{ctx.user_id}»: primero cree la cuenta.")
    return secret


# ------------------------------------------------------------------------- pasos

def fetch_params(ctx: FlowContext) -> StepResult:
    """Descarga N, g y el hash y exige que sean los del RFC 5054 de 2048 bits con SHA-256. Cubre C1 y C3."""
    exchange = _send(ctx, "GET", "/srp/params")
    data = exchange.response_body
    try:
        received = (int(data["N"]), int(data["g"]), str(data["hash"]))
    except (KeyError, TypeError, ValueError) as error:
        raise StepError(f"El banco envió parámetros mal formados: {data}") from error
    if received != (KNOWN_GROUP.N, KNOWN_GROUP.g, KNOWN_GROUP.hash_name):
        raise StepError("Grupo SRP desconocido: el celular solo acepta el grupo de 2048 bits del RFC 5054.")
    ctx.state["group"] = KNOWN_GROUP
    return StepResult(values={"grupo": KNOWN_GROUP.name, "N": str(KNOWN_GROUP.N), "g": str(KNOWN_GROUP.g),
                              "hash": KNOWN_GROUP.hash_name, "¿conocido?": "sí: RFC 5054, apéndice A"},
                      exchange=exchange)


def make_verifier(ctx: FlowContext) -> StepResult:
    """Elige la contraseña, sortea la sal y calcula x y v = g^x mod N. Cubre C1 y C2."""
    group: srp6a.SrpGroup = ctx.state["group"]
    password, salt = generate_password(), srp6a.new_salt()
    x = srp6a.private_key(group, salt, ctx.user_id, password)
    v = srp6a.verifier(group, x)
    ctx.state.update(password=password, salt=salt, v=v)
    return StepResult(values={"contraseña (la recuerda la persona)": password, "s (sal)": salt.hex(),
                              "x = H(s | H(I:P)) (no sale del celular)": str(x), "v = g^x mod N": str(v)})


def send_registration(ctx: FlowContext) -> StepResult:
    """Envía (id, s, v); si el banco acepta, el celular recuerda la contraseña. Cubre C1 y C2."""
    body = {"user_id": ctx.user_id, "salt": ctx.state["salt"].hex(), "v": str(ctx.state["v"])}
    exchange = _send(ctx, "POST", "/srp/register", body)
    if exchange.status != 201:
        return _rejected(exchange, "El banco rechazó el registro")
    ctx.wallet[(MECHANISM_ID, ctx.user_id)] = SrpSecret(ctx.state["password"])
    return StepResult(values={"lo que guarda el banco": "solo la sal y v"}, exchange=exchange, outcome="aceptado",
                      finished=True, message="Cuenta creada: la contraseña nunca viajó; el banco guarda (s, v).")


def make_ephemeral(ctx: FlowContext) -> StepResult:
    """Sortea a y calcula A = g^a mod N. Cubre C1."""
    _stored_secret(ctx)
    group: srp6a.SrpGroup = ctx.state["group"]
    a = srp6a.new_ephemeral()
    ctx.state.update(a=a, A=srp6a.client_public(group, a))
    return StepResult(values={"a (efímera, 256 bits)": str(a), "A = g^a mod N": str(ctx.state["A"])})


def send_start(ctx: FlowContext) -> StepResult:
    """Envía A y recibe la sal, B y el identificador de sesión. Cubre C1 y C3."""
    exchange = _send(ctx, "POST", "/srp/login/start", {"user_id": ctx.user_id, "A": str(ctx.state["A"])})
    if exchange.status != 200:
        return _rejected(exchange, "El banco rechazó A")
    data = exchange.response_body
    try:
        ctx.state.update(session_id=str(data["session_id"]), salt=bytes.fromhex(data["salt"]), B=int(data["B"]))
    except (KeyError, TypeError, ValueError) as error:
        raise StepError(f"El banco envió una respuesta mal formada: {data}") from error
    return StepResult(values={"s (sal)": data["salt"], "B": data["B"], "sesión": data["session_id"]},
                      exchange=exchange)


def compute_session_key(ctx: FlowContext) -> StepResult:
    """Valida B y u, rederiva x y calcula S, K y M1. Cubre C1 y C3."""
    group: srp6a.SrpGroup = ctx.state["group"]
    A, B = ctx.state["A"], ctx.state["B"]
    if not srp6a.is_valid_public(group, B):
        return StepResult(outcome="rechazado", message=B_IS_ZERO, finished=True)
    if not 0 < B < group.N:
        return StepResult(outcome="rechazado", message=B_OUT_OF_RANGE, finished=True)
    u = srp6a.scrambler(group, A, B)
    if u == 0:
        return StepResult(outcome="rechazado", message=U_IS_ZERO, finished=True)
    x = srp6a.private_key(group, ctx.state["salt"], ctx.user_id, _stored_secret(ctx).password)
    S = srp6a.client_premaster(group, B, x, ctx.state["a"], u)
    K = srp6a.session_key(group, S)
    M1 = srp6a.client_proof(group, ctx.user_id, ctx.state["salt"], A, B, K)
    ctx.state.update(K=K, M1=M1)
    return StepResult(values={"u = H(PAD(A) | PAD(B))": str(u), "S = (B − k·g^x)^(a + u·x) mod N": str(S),
                              "K = H(S)": K.hex(), "M1": M1.hex()})


def send_proof(ctx: FlowContext) -> StepResult:
    """Envía M1 y recibe la decisión del banco y M2. Cubre C1 y C4."""
    exchange = _send(ctx, "POST", "/srp/login/verify",
                     {"session_id": ctx.state["session_id"], "M1": ctx.state["M1"].hex()})
    data = exchange.response_body if isinstance(exchange.response_body, dict) else {}
    if exchange.status != 200 or data.get("accepted") is not True:
        return StepResult(values={"intentos restantes": str(data.get("attempts_left"))}, exchange=exchange,
                          outcome="rechazado", message=_reason(data, "El banco rechazó M1"), finished=True)
    ctx.state["M2"] = str(data.get("M2") or "")
    return StepResult(values={"M2 (prueba del banco)": ctx.state["M2"]}, exchange=exchange)


def check_server(ctx: FlowContext) -> StepResult:
    """Recalcula M2 = H(A | M1 | K): solo un banco que conoce v puede producirlo. Cubre C4."""
    group: srp6a.SrpGroup = ctx.state["group"]
    expected = srp6a.server_proof(group, ctx.state["A"], ctx.state["M1"], ctx.state["K"]).hex()
    if ctx.state["M2"] != expected:
        return StepResult(values={"M2 esperado": expected}, outcome="rechazado", message=FAKE_SERVER, finished=True)
    return StepResult(values={"M2 esperado": expected, "¿coincide?": "sí"}, outcome="aceptado", finished=True,
                      message="Acceso concedido y banco verificado: ambos conocen la misma K.")


FLOW_ACTIONS = {
    "register": (fetch_params, make_verifier, send_registration),
    "login": (fetch_params, make_ephemeral, send_start, compute_session_key, send_proof, check_server),
}


class SrpClient:
    """Mecanismo SRP-6a del lado del celular. Cubre C1."""

    info = INFO

    def steps(self, flow_id: str) -> list[ClientStep]:
        """Los pasos del flujo pedido, emparejando su descripción con su acción. Cubre C1."""
        flow = INFO.flow(flow_id)
        return [ClientStep(info, action) for info, action in zip(flow.steps, FLOW_ACTIONS[flow_id], strict=True)]

    def describe_secret(self, secret: SrpSecret) -> dict[str, str]:
        """Lo que la persona recuerda para esa cuenta (se muestra solo en su pantalla). Cubre C2."""
        return {"contraseña (la recuerda la persona)": secret.password}


def create_client() -> SrpClient:
    """Fábrica que usa el registro de mecanismos. Cubre C1."""
    return SrpClient()
