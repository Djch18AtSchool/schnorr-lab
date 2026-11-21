"""Acciones de Eve contra el ZKP, desde su laptop y con su propio canal al banco (R10).

Cada acción devuelve lo que se ve en su terminal (comandos y salida), los mensajes que envió
al banco y los valores para la tarjeta. Eve solo usa lo que realmente podría tener: lo que
capturó de la red, datos públicos o una copia robada de la base de datos.
"""

import json
import math
import secrets
import time
from typing import Any

from attacks.bsgs import MAX_BSGS_Q_BITS, bsgs, ceil_sqrt
from attacks.nonce_reuse import extract_secret
from attacks.simulator import simulate
from attacks.stolen_db import AVERAGE_STEPS_FACTOR
from client_app.acts.model import ActContext, StepOutcome, TerminalLine
from client_app.lab import _measured_seconds_per_operation, _years
from mechanisms.base import Exchange, StepError
from mechanisms.zkp.observe import short
from protocol import GroupParams
from protocol.client import Client

MECHANISM = "zkp"
HOST = "https://banco.lab"
MAX_JSON_CHARS = 160


def _line(kind: str, text: str) -> TerminalLine:
    return TerminalLine(kind, text)


def _json(value: Any) -> str:
    text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return text if len(text) <= MAX_JSON_CHARS else text[:MAX_JSON_CHARS] + "…"


def _send(ctx: ActContext, method: str, path: str, body: dict[str, str] | None = None) -> Exchange:
    return ctx.eve_gateway.request(method, path, body, correlation_id=ctx.correlation_id, mechanism=MECHANISM)


def _body(exchange: Exchange) -> dict[str, Any]:
    return exchange.response_body if isinstance(exchange.response_body, dict) else {}


def _group(params: dict[str, Any]) -> GroupParams:
    return GroupParams(p=int(params["p"]), q=int(params["q"]), g=int(params["g"]), name=str(params["name"]))


def _captured(ctx: ActContext) -> list[Exchange]:
    if ctx.sniff_from is None:
        raise StepError("Eve no está escuchando la red.")
    return ctx.ana_gateway.captured()[ctx.sniff_from:]


# ------------------------------------------------------------------ escuchar y repetir

def sniff(ctx: ActContext) -> StepOutcome:
    """Eve se conecta al mismo Wi-Fi que Ana y copia todo lo que pasa (sin modificarlo)."""
    ctx.sniff_from = ctx.ana_gateway.captured_count()
    terminal = (_line("cmd", "sudo tcpdump -i wlan0 -A 'host banco.lab and port 443'"),
                _line("dim", "listening on wlan0, link-type EN10MB (Ethernet), snapshot length 262144 bytes"))
    return StepOutcome(values={"red": "Wi-Fi del café", "modo": "solo escucha (no modifica nada)"},
                       terminal=terminal, message="Eve escucha la red: copiará cada mensaje de Ana.")


def replay(path: str):
    """Reenvía, sin cambiar nada, el último mensaje capturado en esa ruta."""

    def run(ctx: ActContext) -> StepOutcome:
        captured = [exchange for exchange in _captured(ctx) if exchange.path == path]
        if not captured:
            raise StepError("Eve todavía no capturó ningún mensaje de ese tipo.")
        original = captured[-1]
        exchange = _send(ctx, "POST", path, original.request_body)
        body = _body(exchange)
        accepted = body.get("accepted") is True
        terminal = (_line("cmd", "cat captura.json"), _line("out", _json(original.request_body)),
                    _line("cmd", f"curl -s -X POST {HOST}{path} -d @captura.json"),
                    _line("ok" if accepted else "bad", _json(body)))
        message = ("¡El banco aceptó la copia!" if accepted
                   else f"El banco rechazó la copia: {body.get('reason', exchange.status)}.")
        return StepOutcome(values={"mensaje reenviado": _json(original.request_body),
                                   "respuesta": str(body.get("reason", exchange.status))},
                           exchanges=(exchange,), terminal=terminal,
                           outcome="aceptado" if accepted else "rechazado", message=message, finished=True)

    return run


# ------------------------------------------------------------------ base de datos robada

def steal_database(ctx: ActContext) -> StepOutcome:
    """Eve consigue una copia de la tabla de usuarios del banco (y los parámetros públicos)."""
    stolen_exchange = _send(ctx, "GET", "/bank/users")
    params_exchange = _send(ctx, "GET", "/zkp/params")
    stolen = {user: str(data["y"]) for user, data in _body(stolen_exchange).get(MECHANISM, {}).items()}
    gp = _group(_body(params_exchange))
    ctx.state.update(stolen=stolen, gp=gp)
    terminal = (_line("cmd", f"curl -s {HOST}/bank/users -o usuarios.json   # copia filtrada"),
                _line("out", _json(_body(stolen_exchange))),
                _line("dim", "solo claves públicas y: no hay contraseñas ni x"))
    values = {"usuarios": str(len(stolen)), **{f"y de {user}": y for user, y in stolen.items()}}
    return StepOutcome(values=values, exchanges=(stolen_exchange, params_exchange), terminal=terminal,
                       message="Eve tiene la base: solo claves públicas y = g^x mod p.")


def crack(ctx: ActContext) -> StepOutcome:
    """Intenta despejar x de y con BSGS (logaritmo discreto). Con q real es inviable."""
    gp: GroupParams = ctx.state["gp"]
    y = int(ctx.state["stolen"].get(ctx.user_id, 0))
    if not y:
        raise StepError(f"La base robada no tiene a «{ctx.user_id}».")
    q_bits = gp.q.bit_length()
    command = _line("cmd", f"python bsgs.py --p {short(gp.p)} --g {short(gp.g)} --y {short(y)}")
    if q_bits > MAX_BSGS_Q_BITS:
        return _too_big(gp, q_bits, command)
    start = time.perf_counter()
    x, operations = bsgs(gp.g, y, gp.p, gp.q)
    elapsed = (time.perf_counter() - start) * 1000
    ctx.state["x"] = x
    m = ceil_sqrt(gp.q)
    terminal = (command, _line("out", f"m = ⌈√q⌉ = {m}: tabla de {m} pasos de bebé g^j"),
                _line("out", f"pasos de gigante y·(g^-m)^i hasta coincidir ({operations} operaciones)"),
                _line("ok", f"x = {x}   ({elapsed:.2f} ms)"))
    return StepOutcome(values={"x encontrada": str(x), "operaciones": str(operations), "tiempo": f"{elapsed:.2f} ms"},
                       math=(f"g^x ≡ y (mod p):  {gp.g}^{x} mod {gp.p} = {pow(gp.g, x, gp.p)}",),
                       terminal=terminal, outcome="aceptado",
                       message=f"Con q de {q_bits} bits, BSGS encontró x = {x}: el grupo de ejemplo no es seguro.")


def _too_big(gp: GroupParams, q_bits: int, command: TerminalLine) -> StepOutcome:
    log10_ops = math.log10(AVERAGE_STEPS_FACTOR) + math.log10(math.isqrt(gp.q))
    seconds_per_op = _measured_seconds_per_operation()
    years = _years(log10_ops, seconds_per_op) if seconds_per_op else "incontables"
    terminal = (command, _line("out", f"q de {q_bits} bits → ~2^{q_bits // 2} pasos y otras tantas entradas de memoria"),
                _line("bad", f"estimado: {years} años. Abortado."))
    return StepOutcome(values={"bits de q": str(q_bits), "operaciones": f"~2^{q_bits // 2}", "tiempo estimado": f"{years} años"},
                       terminal=terminal, outcome="rechazado",
                       message=f"Con q de {q_bits} bits, despejar x tomaría unos {years} años.")


def login_as_victim(ctx: ActContext) -> StepOutcome:
    """Si Eve conoce x, inicia sesión como la víctima con el protocolo normal (el banco no lo distingue)."""
    if "x" not in ctx.state:
        terminal = (_line("cmd", f"python login.py --user {ctx.user_id}"),
                    _line("bad", "sin x no se puede calcular s = r + c·x: imposible responder el reto"))
        return StepOutcome(terminal=terminal, outcome="rechazado", finished=True,
                           message="Sin x, Eve no puede iniciar sesión.")
    gp: GroupParams = ctx.state["gp"]
    impostor = Client(ctx.user_id, gp, x=int(ctx.state["x"]))
    t = impostor.commit()
    commit = _send(ctx, "POST", "/zkp/login/commit", {"user_id": ctx.user_id, "t": str(t)})
    data = _body(commit)
    if commit.status != 200:
        return _blocked(commit, data)
    s = impostor.respond(int(data["c"]))
    verdict = _send(ctx, "POST", "/zkp/login/respond", {"session_id": data["session_id"], "s": str(s)})
    accepted = _body(verdict).get("accepted") is True
    terminal = (_line("cmd", f"python login.py --user {ctx.user_id} --x {short(impostor.x)}"),
                _line("out", f"t = {short(t)} → c = {short(data['c'])} → s = {short(s)}"),
                _line("ok" if accepted else "bad", _json(_body(verdict))))
    return StepOutcome(values={"x usada": str(impostor.x), "resultado": str(_body(verdict).get("reason"))},
                       exchanges=(commit, verdict), terminal=terminal, outcome="aceptado" if accepted else "rechazado",
                       finished=True, message=("Eve entró a la cuenta de Ana: con x robada el banco no distingue."
                                               if accepted else "El banco rechazó a Eve."))


def _blocked(exchange: Exchange, data: dict[str, Any]) -> StepOutcome:
    terminal = (_line("bad", _json(data)),)
    return StepOutcome(exchanges=(exchange,), terminal=terminal, outcome="rechazado", finished=True,
                       message=f"El banco no entregó un reto: {data.get('reason', exchange.status)}.")


# ------------------------------------------------------------------ impostor

def reconnaissance(ctx: ActContext) -> StepOutcome:
    """Eve obtiene los datos públicos: parámetros del grupo y la clave pública y de la víctima."""
    params = _send(ctx, "GET", "/zkp/params")
    users = _send(ctx, "GET", "/bank/users")
    gp = _group(_body(params))
    y = _body(users).get(MECHANISM, {}).get(ctx.user_id, {}).get("y")
    if y is None:
        raise StepError(f"«{ctx.user_id}» no está registrada.")
    ctx.state.update(gp=gp, y=int(y))
    terminal = (_line("cmd", f"curl -s {HOST}/zkp/params"), _line("out", _json(_body(params))),
                _line("cmd", f"curl -s {HOST}/bank/users | jq .zkp.{ctx.user_id}"), _line("out", _json({"y": y})))
    return StepOutcome(values={"p": str(gp.p), "q": str(gp.q), "g": str(gp.g), "y": str(y)},
                       exchanges=(params, users), terminal=terminal, message="Eve conoce p, q, g y la y de Ana; no x.")


def impostor_attempt(ctx: ActContext) -> StepOutcome:
    """Adivina el reto c', fabrica t = g^s·(y^c')^-1 y gana solo si el banco elige c = c' (prob. 1/q)."""
    gp: GroupParams = ctx.state["gp"]
    y: int = ctx.state["y"]
    guessed, s = secrets.randbelow(gp.q), secrets.randbelow(gp.q)
    t = simulate(gp, y, guessed, s)
    commit = _send(ctx, "POST", "/zkp/login/commit", {"user_id": ctx.user_id, "t": str(t)})
    data = _body(commit)
    command = _line("cmd", f"python impostor.py --user {ctx.user_id} --adivina-c {short(guessed)}")
    if commit.status != 200:
        blocked = _blocked(commit, data)
        return StepOutcome(exchanges=blocked.exchanges, terminal=(command, *blocked.terminal), outcome="rechazado",
                           message=blocked.message)
    verdict = _send(ctx, "POST", "/zkp/login/respond", {"session_id": data["session_id"], "s": str(s)})
    body = _body(verdict)
    accepted = body.get("accepted") is True
    terminal = (command, _line("out", f"t = g^s·(y^c')^-1 = {short(t)}  (s = {short(s)})"),
                _line("out", f"el banco eligió c = {short(data['c'])}"),
                _line("ok" if accepted else "bad", f"{body.get('reason')} · intentos restantes {body.get('attempts_left')}"))
    message = ("¡Adivinó el reto! Con q tan pequeño pasa 1 de cada q veces." if accepted
               else f"Falló: adivinó c' = {short(guessed)} y el banco eligió c = {short(data['c'])}.")
    return StepOutcome(values={"c' adivinado": str(guessed), "c del banco": str(data["c"]),
                               "intentos restantes": str(body.get("attempts_left"))},
                       math=(f"t = g^s·(y^c')^-1 mod p = {short(t)}", f"P(acertar) = 1/q = 1/{short(gp.q)}"),
                       exchanges=(commit, verdict), terminal=terminal, outcome="aceptado" if accepted else "rechazado",
                       message=message)


# ------------------------------------------------------------------ r repetido

def _transcripts(ctx: ActContext) -> tuple[GroupParams, list[tuple[int, int, int]]]:
    gp, pending, result = None, None, []
    for exchange in _captured(ctx):
        body, answer = exchange.request_body or {}, _body(exchange)
        if exchange.path == "/zkp/params":
            gp = _group(answer)
        elif exchange.path == "/zkp/login/commit" and exchange.status == 200:
            pending = (int(body["t"]), int(answer["c"]))
        elif exchange.path == "/zkp/login/respond" and pending is not None:
            result.append((*pending, int(body["s"])))
            pending = None
    if gp is None:
        raise StepError("Eve no capturó los parámetros del grupo.")
    return gp, result


def extract_x(ctx: ActContext) -> StepOutcome:
    """Con dos inicios de sesión que repiten r (mismo t) y retos distintos, x se despeja con Euclides."""
    gp, transcripts = _transcripts(ctx)
    pairs = [(a, b) for i, a in enumerate(transcripts) for b in transcripts[i + 1:] if a[0] == b[0] and a[1] != b[1]]
    command = _line("cmd", "python extraer_x.py captura1.json captura2.json")
    if not pairs:
        terminal = (command, _line("bad", "no hay dos transcripciones con el mismo t y retos distintos"))
        return StepOutcome(terminal=terminal, outcome="rechazado", message="Eve no encontró un r repetido.")
    (t, c1, s1), (_, c2, s2) = pairs[0]
    x = extract_secret(gp, c1, s1, c2, s2)
    ctx.state.update(x=x, gp=gp)
    formula = f"x = (s₁ − s₂)·(c₁ − c₂)^-1 mod q = ({short(s1)} − {short(s2)})·({short(c1)} − {short(c2)})^-1 mod {short(gp.q)} = {short(x)}"
    terminal = (command, _line("out", f"t₁ = t₂ = {short(t)} → el celular repitió r"), _line("out", formula),
                _line("ok", f"x = {short(x)}"))
    return StepOutcome(values={"t repetido": str(t), "c₁, s₁": f"{c1}, {s1}", "c₂, s₂": f"{c2}, {s2}", "x": str(x)},
                       math=("s₁ = r + c₁·x  y  s₂ = r + c₂·x  (mod q)", formula), terminal=terminal,
                       outcome="aceptado", message=f"Eve despejó x = {short(x)} con Euclides extendido.")
