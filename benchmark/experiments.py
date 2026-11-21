"""Experimentos del laboratorio guardados como datos: ataques, simulador y verificaciones (R3–R5, R8, R10).

Reúne en results/experimentos.json los experimentos que hasta ahora solo se imprimían en la
consola (opción 4 de demo.py), para que la Consola del banco los grafique junto a la latencia,
BSGS y la comparación de mecanismos:

- impostor: tasa de éxito frente a 1/q, su convergencia y la tasa para varios tamaños de q;
- simulador: transcripciones reales y simuladas (misma distribución, todas válidas);
- r repetido: el ejemplo del escrito y la extracción de x en muchos casos al azar;
- repetición de pruebas no interactivas, con y sin protección;
- aleatoriedad de r y c en 1000 inicios de sesión; potencia e inverso modular contra Python y SymPy.

Ejecutar desde la raíz:  python -m benchmark.experiments
"""

import json
import platform
import secrets
import sys
import time
from pathlib import Path
from typing import Any

import sympy

from attacks import nonce_reuse, replay, simulator
from attacks.impostor import impostor_rate
from attacks.nonce_reuse import extract_secret
from attacks.simulator import enumerate_real, enumerate_simulated
from core.modular import mod_inverse, mod_pow
from core.params import TOY_GROUP, GroupParams, get_group, safe_prime_group
from protocol.bank import DEFAULT_MAX_ATTEMPTS, Bank
from protocol.client import Client, random_exponent

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "results" / "experimentos.json"
IMPOSTOR_TRIALS = 20_000
CHECKPOINTS = (10, 30, 100, 300, 1_000, 3_000, 10_000, 20_000)
IMPOSTOR_P_BITS = (5, 8, 10, 12, 14)          # q de 4 a 13 bits: la tasa cae como 1/q
NONCE_TRIALS = 200
RANDOMNESS_LOGINS = 1_000
ARITHMETIC_CASES = 1_000


def _impostor_convergence(gp: GroupParams, trials: int) -> list[dict[str, float]]:
    """Tasa acumulada del impostor en puntos de control (se acerca a 1/q al crecer n)."""
    bank = Bank(gp, max_attempts=trials + 1)
    victim = Client("victima", gp)
    bank.register(victim.user_id, victim.y)
    wins, points = 0, []
    for n in range(1, trials + 1):
        guess, s = secrets.randbelow(gp.q), secrets.randbelow(gp.q)
        t = simulator.simulate(gp, victim.y, guess, s)
        challenge = bank.challenge(victim.user_id, t)
        if isinstance(challenge, tuple) and challenge[1] == guess:
            wins += bank.verify(challenge[0], s).accepted
        elif isinstance(challenge, tuple):
            bank.verify(challenge[0], s)
        if n in CHECKPOINTS:
            points.append({"n": n, "rate": wins / n})
    return points


def impostor_experiment() -> dict[str, Any]:
    """Impostor que adivina el reto: convergencia con q = 11 y tasa para varios q. Cubre R10."""
    by_q = []
    for bits in IMPOSTOR_P_BITS:
        gp = TOY_GROUP if bits == TOY_GROUP.bits else safe_prime_group(bits)
        rate = impostor_rate(gp, IMPOSTOR_TRIALS)
        by_q.append({"p": gp.p, "q": gp.q, "q_bits": gp.q.bit_length(), "trials": IMPOSTOR_TRIALS,
                     "rate": rate, "expected": 1 / gp.q})
    expected = 1 / TOY_GROUP.q
    return {"q": TOY_GROUP.q, "trials": IMPOSTOR_TRIALS, "expected": expected,
            "before_lockout": 1 - (1 - expected) ** DEFAULT_MAX_ATTEMPTS, "max_attempts": DEFAULT_MAX_ATTEMPTS,
            "convergence": _impostor_convergence(TOY_GROUP, IMPOSTOR_TRIALS), "by_q": by_q}


def simulator_experiment() -> dict[str, Any]:
    """Transcripciones reales (con x) y simuladas (sin x): misma distribución. Cubre R10."""
    summary = simulator.run(TOY_GROUP)
    x = 7
    y = mod_pow(TOY_GROUP.g, x, TOY_GROUP.p)
    real, simulated = enumerate_real(TOY_GROUP, x), enumerate_simulated(TOY_GROUP, y)
    by_t: dict[int, dict[str, int]] = {}
    for transcript, count in real.items():
        by_t.setdefault(transcript.t, {"real": 0, "simulated": 0})["real"] += count
    for transcript, count in simulated.items():
        by_t.setdefault(transcript.t, {"real": 0, "simulated": 0})["simulated"] += count
    example = summary["example"]
    return {"q": TOY_GROUP.q, "x": x, "y": y, "real": summary["real"], "simulated": summary["simulated"],
            "identical": summary["identical"], "all_simulated_verify": summary["all_simulated_verify"],
            "example": {"t": example.t, "c": example.c, "s": example.s},
            "by_t": [{"t": t, **counts} for t, counts in sorted(by_t.items())]}


def nonce_reuse_experiment() -> dict[str, Any]:
    """El ejemplo del escrito y la extracción de x en casos al azar con q de 255 bits. Cubre R10."""
    example = nonce_reuse.run(TOY_GROUP)
    gp = get_group("safe-256")
    recovered = 0
    for _ in range(NONCE_TRIALS):
        x, r = random_exponent(gp.q), random_exponent(gp.q)
        c1, c2 = secrets.randbelow(gp.q), secrets.randbelow(gp.q)
        if c1 == c2:
            continue
        s1, s2 = (r + c1 * x) % gp.q, (r + c2 * x) % gp.q
        recovered += extract_secret(gp, c1, s1, c2, s2) == x
    return {"example": {key: example[key] for key in ("t", "c1", "s1", "c2", "s2", "x_real", "x_extracted",
                                                      "recovered", "both_accepted")},
            "random": {"group": gp.name, "q_bits": gp.q.bit_length(), "trials": NONCE_TRIALS,
                       "recovered": recovered}}


def replay_experiment() -> dict[str, Any]:
    """Prueba no interactiva capturada: aceptada dos veces sin protección, rechazada con ella. Cubre R8 y R10."""
    result = replay.run(TOY_GROUP)
    return {key: value for key, value in result.items() if isinstance(value, bool | int | float | str)}


def randomness_experiment() -> dict[str, Any]:
    """r y c distintos en 1000 inicios de sesión con q de 511 bits (Tabla 7, R3)."""
    gp = get_group("safe-512")
    bank, client = Bank(gp), Client("ana", gp)
    bank.register(client.user_id, client.y)
    commitments, challenges, accepted = set(), set(), 0
    for _ in range(RANDOMNESS_LOGINS):
        t = client.commit()
        session_id, c = bank.challenge(client.user_id, t)
        accepted += bank.verify(session_id, client.respond(c)).accepted
        commitments.add(t)
        challenges.add(c)
    return {"group": gp.name, "q_bits": gp.q.bit_length(), "logins": RANDOMNESS_LOGINS, "accepted": accepted,
            "distinct_t": len(commitments), "distinct_c": len(challenges)}


def arithmetic_experiment() -> dict[str, Any]:
    """mod_pow contra pow y mod_inverse contra SymPy en 1000 casos al azar de 512 bits (R4 y R5)."""
    pow_matches = inverse_matches = 0
    for _ in range(ARITHMETIC_CASES):
        modulus = secrets.randbits(512) | 1 | (1 << 511)
        base, exponent = secrets.randbelow(modulus), secrets.randbits(512)
        pow_matches += mod_pow(base, exponent, modulus) == pow(base, exponent, modulus)
        prime = sympy.randprime(2 ** 255, 2 ** 256)
        value = secrets.randbelow(prime - 1) + 1
        inverse_matches += mod_inverse(value, prime) == sympy.mod_inverse(value, prime)
    return {"cases": ARITHMETIC_CASES, "bits": 512, "mod_pow_matches": pow_matches,
            "mod_inverse_matches": inverse_matches,
            "examples": {"4^7 mod 23": mod_pow(4, 7, 23), "6^-1 mod 23": mod_inverse(6, 23)}}


def run_all() -> dict[str, Any]:
    """Ejecuta todos los experimentos y devuelve el documento que se guarda en results/. Cubre R10."""
    start = time.time()
    document = {"impostor": impostor_experiment(), "simulador": simulator_experiment(),
                "r_repetido": nonce_reuse_experiment(), "repeticion": replay_experiment(),
                "aleatoriedad": randomness_experiment(), "aritmetica": arithmetic_experiment()}
    return {"generated_at": start, "duration_s": round(time.time() - start, 1), "python": platform.python_version(),
            **document}


def main() -> int:
    document = run_all()
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(json.dumps(document, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    print(f"Guardado {OUTPUT.relative_to(ROOT)} ({document['duration_s']} s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
