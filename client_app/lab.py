"""Laboratorio de ataques que se lanza desde la interfaz (R10, R11).

- Fuera de línea: los experimentos de attacks/ (reutilización de r, simulador, impostor, ...)
  con su reporte capturado.
- En vivo: un atacante con su propio canal HTTP golpea al banco real mientras corre: repite un
  mensaje capturado de la red, roba la base de datos o intenta suplantar a un usuario sin x.
"""

import contextlib
import io
import json
import math
import secrets
import time
from collections.abc import Callable
from dataclasses import asdict, is_dataclass
from typing import Any

from attacks import bsgs, impostor, nonce_reuse, replay, simulator
from attacks.bsgs import MAX_BSGS_Q_BITS
from attacks.simulator import simulate
from attacks.stolen_db import AVERAGE_STEPS_FACTOR, RESULTS_DIR, SECONDS_PER_YEAR
from client_app.gateway import BankGateway
from mechanisms.base import Exchange, StepError
from protocol import GroupParams

LIVE_IMPOSTOR_ID = "cliente01"
OFFLINE_IMPOSTOR_TRIALS = 20_000
OFFLINE_ATTACKS: dict[str, tuple[str, Callable[[], dict]]] = {
    "nonce_reuse": ("Reutilización de r", lambda: nonce_reuse.run(verbose=True)),
    "simulator": ("Simulador (conocimiento cero)", lambda: simulator.run(verbose=True)),
    "impostor": ("Impostor que adivina el reto",
                 lambda: impostor.run(verbose=True, trials=OFFLINE_IMPOSTOR_TRIALS)),
    "replay": ("Repetición de una prueba no interactiva", lambda: replay.run(verbose=True)),
    "bsgs": ("Logaritmo discreto con BSGS", lambda: bsgs.run(verbose=True)),
}
BSGS_RESULTS = RESULTS_DIR / "bsgs.json"
REPLAYABLE_PATHS = {"replay_response": "/zkp/login/respond", "replay_nizk": "/zkp/login/nizk"}
LIVE_ATTACKS = {
    "replay_response": "Repetir la última respuesta capturada (interactivo)",
    "replay_nizk": "Repetir la última prueba no interactiva capturada",
    "steal_database": "Robar la base de datos del banco",
    "impostor_live": "Suplantar a un usuario sin conocer x",
}


def jsonable(value: Any) -> Any:
    """Convierte resultados a JSON: los enteros grandes como cadenas. Cubre R11."""
    if isinstance(value, bool) or value is None or isinstance(value, str | float):
        return value
    if isinstance(value, int):
        return str(value)
    if is_dataclass(value) and not isinstance(value, type):
        return jsonable(asdict(value))
    if isinstance(value, dict):
        return {str(key): jsonable(item) for key, item in value.items()}
    if isinstance(value, list | tuple | set):
        return [jsonable(item) for item in value]
    return str(value)


def run_offline(name: str) -> dict[str, Any]:
    """Ejecuta un experimento de attacks/ y devuelve su resultado y su reporte en texto. Cubre R10."""
    if name not in OFFLINE_ATTACKS:
        raise ValueError(f"Ataque desconocido: «{name}».")
    title, run = OFFLINE_ATTACKS[name]
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        result = run()
    return {"name": name, "title": title, "result": jsonable(result),
            "report": [line for line in output.getvalue().splitlines() if line.strip()]}


class LiveAttacker:
    """Atacante que usa su propio canal hacia el banco y lee lo que capturó la red. Cubre R10."""

    def __init__(self, attacker: BankGateway, network: BankGateway) -> None:
        self._attacker = attacker
        self._network = network

    def run(self, name: str, user_id: str = LIVE_IMPOSTOR_ID) -> dict[str, Any]:
        """Lanza un ataque en vivo por nombre. Cubre R10."""
        actions = {"replay_response": lambda: self.replay(REPLAYABLE_PATHS["replay_response"]),
                   "replay_nizk": lambda: self.replay(REPLAYABLE_PATHS["replay_nizk"]),
                   "steal_database": self.steal_database, "impostor_live": lambda: self.impostor(user_id)}
        if name not in actions:
            raise ValueError(f"Ataque desconocido: «{name}».")
        return {"name": name, "title": LIVE_ATTACKS[name], **actions[name]()}

    def _send(self, method: str, path: str, body: dict[str, Any] | None = None) -> Exchange:
        return self._attacker.request(method, path, body, mechanism="zkp")

    def replay(self, path: str) -> dict[str, Any]:
        """Reenvía el último mensaje capturado en esa ruta: sesión consumida o prueba ya usada. Cubre R9 y R10."""
        captured = [ex for ex in self._network.captured() if ex.path == path]
        if not captured:
            raise StepError("Todavía no hay un mensaje capturado de ese tipo: inicie sesión primero.")
        original = captured[-1]
        exchange = self._send("POST", original.path, original.request_body)
        body = exchange.response_body if isinstance(exchange.response_body, dict) else {}
        accepted = body.get("accepted") is True
        return {"accepted": accepted, "exchange": exchange.to_json(),
                "conclusion": ("El banco aceptó la repetición" if accepted else
                               f"El banco la rechazó: {body.get('reason')}. Lo capturado no sirve dos veces.")}

    def steal_database(self) -> dict[str, Any]:
        """Roba la tabla id → y e intenta despejar x con BSGS (definición 9). Cubre R2 y R10.

        Con q pequeño (el grupo de ejemplo) lo logra al instante: por eso p = 23 no es seguro.
        Con q real informa cuántos años tardaría, según la medición de results/bsgs.json.
        """
        exchange = self._send("GET", "/bank/users")
        stolen = exchange.response_body.get("zkp", {}) if isinstance(exchange.response_body, dict) else {}
        params = self._send("GET", "/zkp/params").response_body
        gp = GroupParams(p=int(params["p"]), q=int(params["q"]), g=int(params["g"]), name=params["name"])
        intro = "El atacante obtiene solo y = g^x mod p; para entrar necesita x (logaritmo discreto). "
        return {"stolen": stolen, "exchange": exchange.to_json(), **self._crack(gp, stolen, intro)}

    @staticmethod
    def _crack(gp: GroupParams, stolen: dict[str, Any], intro: str) -> dict[str, Any]:
        q_bits = gp.q.bit_length()
        if q_bits <= MAX_BSGS_Q_BITS and stolen:
            start = time.perf_counter()
            recovered = {user: str(bsgs.bsgs(gp.g, int(data["y"]), gp.p, gp.q)[0]) for user, data in stolen.items()}
            elapsed_ms = (time.perf_counter() - start) * 1000
            return {"recovered_x": recovered, "cracked": True,
                    "conclusion": (f"{intro}Con q de {q_bits} bits, BSGS la despeja en {elapsed_ms:.2f} ms: "
                                   f"{recovered}. Por eso el grupo de ejemplo solo sirve para aprender.")}
        operations = AVERAGE_STEPS_FACTOR * math.isqrt(gp.q)
        seconds_per_op = _measured_seconds_per_operation()
        estimate = (f"; según la medición, unos {operations * seconds_per_op / SECONDS_PER_YEAR:.1e} años"
                    if seconds_per_op else "")
        return {"cracked": False,
                "conclusion": (f"{intro}Con q de {q_bits} bits, BSGS necesitaría del orden de 2^{q_bits // 2} "
                               f"operaciones y otras tantas entradas de memoria{estimate}.")}

    def _public_data(self, user_id: str) -> tuple[GroupParams, int]:
        params = self._send("GET", "/zkp/params").response_body
        users = self._send("GET", "/bank/users").response_body.get("zkp", {})
        if user_id not in users:
            raise StepError(f"El usuario «{user_id}» no está registrado en el banco.")
        gp = GroupParams(p=int(params["p"]), q=int(params["q"]), g=int(params["g"]), name=params["name"])
        return gp, int(users[user_id]["y"])

    def impostor(self, user_id: str) -> dict[str, Any]:
        """Adivina c', fabrica t = g^s·(y^c')^-1 y gana solo si el banco elige c = c'. Cubre R9 y R10."""
        gp, y = self._public_data(user_id)
        guessed_c, s = secrets.randbelow(gp.q), secrets.randbelow(gp.q)
        commit = self._send("POST", "/zkp/login/commit", {"user_id": user_id, "t": str(simulate(gp, y, guessed_c, s))})
        if commit.status != 200:
            return {"accepted": False, "exchange": commit.to_json(),
                    "conclusion": f"El banco ni siquiera entrega un reto: {commit.response_body.get('reason')}."}
        data = commit.response_body
        verdict = self._send("POST", "/zkp/login/respond", {"session_id": data["session_id"], "s": str(s)})
        body = verdict.response_body
        return {"guessed_c": str(guessed_c), "bank_c": str(data["c"]), "accepted": body.get("accepted") is True,
                "attempts_left": body.get("attempts_left"), "exchange": verdict.to_json(),
                "conclusion": (f"Adivinó c' = {guessed_c} y el banco eligió c = {data['c']}: "
                               f"{body.get('reason')}. Probabilidad de acertar: 1/q.")}


def _measured_seconds_per_operation() -> float | None:
    """Segundos por operación de BSGS medidos en el experimento de la base robada (si existe)."""
    try:
        return float(json.loads(BSGS_RESULTS.read_text(encoding="utf-8"))["fit"]["seconds_per_operation"])
    except (OSError, ValueError, KeyError, TypeError):
        return None
