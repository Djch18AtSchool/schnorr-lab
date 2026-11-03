"""Simulador de transcripciones: conocimiento cero frente a un verificador honesto (R10).

El simulador fabrica transcripciones válidas (t, c, s) sin conocer x: elige primero c y s
y despeja t = g^s·(y^c)^-1 (mod p). Si tienen la misma distribución que las de un cliente
honesto, las transcripciones no enseñan nada sobre x (definición 12; Katz y Lindell, 2020).

Detalle de rango: el cliente toma r ∈ [1, q − 1] (Tabla 1), así que nunca envía t = 1 y
produce q·(q − 1) ternas distintas, cada una una vez. El simulador recorre los q² pares (c, s)
y descarta los que dan t = 1 (exactamente uno por cada c); el resultado coincide terna a
terna con el del cliente real. Con p = 23 son 110 ternas.
"""

import secrets
from collections import Counter

from core.modular import mod_inverse, mod_pow
from core.params import TOY_GROUP, GroupParams
from protocol.bank import Bank
from protocol.client import Client, random_exponent
from protocol.transcript import Transcript

MAX_ENUMERATION_Q = 2**12         # se recorren del orden de q² casos
TOY_EXAMPLE = {"x": 7, "c": 2, "s": 9}  # con p = 23: t = 2
SIMULATED_ID = "simulado"


def simulate(gp: GroupParams, y: int, c: int, s: int) -> int:
    """t = g^s·(y^c)^-1 mod p: el compromiso que hace válida la terna (t, c, s). Cubre R10."""
    yc_inverse = mod_inverse(mod_pow(y, c, gp.p), gp.p)
    return mod_pow(gp.g, s, gp.p) * yc_inverse % gp.p


def simulate_random(gp: GroupParams, y: int) -> Transcript:
    """Una transcripción simulada al azar con la misma distribución que la del cliente real. Cubre R10."""
    while True:
        c, s = secrets.randbelow(gp.q), secrets.randbelow(gp.q)
        t = simulate(gp, y, c, s)
        if t != 1:
            return Transcript(t=t, c=c, s=s)


def _check_small(gp: GroupParams) -> None:
    if gp.q > MAX_ENUMERATION_Q:
        raise ValueError(f"La enumeración recorre q² casos; solo se permite con q ≤ 2^12 (q tiene "
                         f"{gp.q.bit_length()} bits).")


def enumerate_real(gp: GroupParams, x: int) -> Counter[Transcript]:
    """Todas las transcripciones del cliente honesto: r ∈ [1, q − 1] y c ∈ [0, q − 1]. Cubre R10."""
    _check_small(gp)
    client = Client("real", gp, x=x)
    transcripts: Counter[Transcript] = Counter()
    for r in range(1, gp.q):
        for c in range(gp.q):
            t = client.commit(r=r)
            transcripts[Transcript(t=t, c=c, s=client.respond(c))] += 1
    return transcripts


def enumerate_simulated(gp: GroupParams, y: int) -> Counter[Transcript]:
    """Todas las transcripciones del simulador, que solo conoce y: (c, s) ∈ Z_q², sin t = 1. Cubre R10."""
    _check_small(gp)
    transcripts: Counter[Transcript] = Counter()
    for c in range(gp.q):
        for s in range(gp.q):
            t = simulate(gp, y, c, s)
            if t != 1:
                transcripts[Transcript(t=t, c=c, s=s)] += 1
    return transcripts


def _bank_accepts_all(gp: GroupParams, y: int, transcripts: Counter[Transcript]) -> bool:
    bank = Bank(gp)
    bank.register(SIMULATED_ID, y)
    for transcript in transcripts:
        session_id, _ = bank.challenge(SIMULATED_ID, transcript.t, c=transcript.c)
        if not bank.verify(session_id, transcript.s).accepted:
            return False
    return True


def run(gp: GroupParams = TOY_GROUP, verbose: bool = False) -> dict:
    """Compara las distribuciones real y simulada y verifica las simuladas con el banco. Cubre R10."""
    x = TOY_EXAMPLE["x"] if gp == TOY_GROUP else random_exponent(gp.q)
    y = mod_pow(gp.g, x, gp.p)
    real, simulated = enumerate_real(gp, x), enumerate_simulated(gp, y)
    c, s = TOY_EXAMPLE["c"], TOY_EXAMPLE["s"]
    result = {
        "q": gp.q,
        "real": len(real),
        "simulated": len(simulated),
        "identical": real == simulated,
        "max_frequency": max(real.values()),
        "all_simulated_verify": _bank_accepts_all(gp, y, simulated),
        "example": Transcript(t=simulate(gp, y, c, s), c=c, s=s),
    }
    if verbose:
        _print_report(result)
    return result


def _print_report(r: dict) -> None:
    ex = r["example"]
    print(f"[Simulador] Sin conocer x: elige c = {ex.c}, s = {ex.s} y despeja t = g^s·(y^c)^-1 = {ex.t}.")
    print(f"    Transcripciones reales: {r['real']}; simuladas: {r['simulated']}; "
          f"cada una aparece {r['max_frequency']} vez.")
    print(f"    ¿Misma distribución? {'sí' if r['identical'] else 'no'}. "
          f"¿El banco acepta todas las simuladas? {'sí' if r['all_simulated_verify'] else 'no'}.")
    print("    Conclusión: lo que ve el banco puede fabricarse sin x, así que no revela nada de x.")
