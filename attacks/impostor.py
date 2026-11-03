"""Impostor que no conoce x: su probabilidad de engañar al banco es 1/q (definición 16, R10).

El impostor adivina el reto c' antes de comprometerse: elige s al azar y envía
t = g^s·(y^c')^-1, que es válido solo si el banco elige c = c'. Como el banco toma c con
secrets en [0, q − 1], eso ocurre con probabilidad 1/q (9.09 % con q = 11).

Esperar el reto adivinado abriendo varios retos y dejando sin responder los demás no sirve:
el banco admite una sola sesión pendiente por usuario y cada sesión abandonada cuenta como
intento fallido, así que con el bloqueo a los 3 fallos la probabilidad de entrar es a lo sumo
1 − (1 − 1/q)³.
"""

import secrets

from attacks.simulator import simulate
from core.params import TOY_GROUP, GroupParams
from protocol.bank import DEFAULT_MAX_ATTEMPTS, Bank
from protocol.client import Client

VICTIM_ID = "victima"
DEFAULT_TRIALS = 100_000


def _bank_without_lockout(gp: GroupParams, trials: int) -> tuple[Bank, int]:
    """Banco con la víctima registrada y el bloqueo desactivado, para medir la tasa por intento."""
    bank = Bank(gp, max_attempts=trials + 1)
    victim = Client(VICTIM_ID, gp)  # el impostor solo usa su clave pública y
    bank.register(*victim.register_payload())
    return bank, victim.y


def impostor_rate(gp: GroupParams, trials: int) -> float:
    """Proporción de intentos en que el impostor es aceptado. Cubre R10 (P2)."""
    if trials < 1:
        raise ValueError("trials debe ser al menos 1.")
    bank, y = _bank_without_lockout(gp, trials)
    wins = 0
    for _ in range(trials):
        guessed_c, s = secrets.randbelow(gp.q), secrets.randbelow(gp.q)
        t = simulate(gp, y, guessed_c, s)
        session_id, _ = bank.challenge(VICTIM_ID, t)
        wins += bank.verify(session_id, s).accepted
    return wins / trials


def run(gp: GroupParams = TOY_GROUP, verbose: bool = False, trials: int = DEFAULT_TRIALS) -> dict:
    """Tasa observada frente a 1/q y probabilidad de éxito antes del bloqueo (tres intentos). Cubre R10."""
    rate = impostor_rate(gp, trials)
    expected = 1 / gp.q
    result = {
        "q": gp.q,
        "trials": trials,
        "wins": round(rate * trials),
        "rate": rate,
        "expected": expected,
        "difference_points": abs(rate - expected) * 100,
        "before_lockout": 1 - (1 - expected) ** DEFAULT_MAX_ATTEMPTS,
    }
    if verbose:
        _print_report(result)
    return result


def _print_report(r: dict) -> None:
    print(f"[Impostor] {r['trials']} intentos sin conocer x, adivinando el reto (q = {r['q']}).")
    print(f"    Tasa observada: {r['rate']:.2%}; teórica 1/q: {r['expected']:.2%}; "
          f"diferencia: {r['difference_points']:.2f} puntos.")
    print(f"    Con el bloqueo a los {DEFAULT_MAX_ATTEMPTS} fallos, la probabilidad de entrar es a lo sumo "
          f"{r['before_lockout']:.2%}; con q de 256 bits es despreciable.")
