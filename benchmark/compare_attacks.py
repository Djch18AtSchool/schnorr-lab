"""Ataques del experimento de comparación: base de datos robada, repetición y tabla cualitativa (C5).

- Base robada: intentos por segundo contra lo que guarda el banco (hash Argon2id, verificador
  SRP) medidos en este equipo, y la proyección a un diccionario de 10^6 contraseñas comunes y a
  contraseñas aleatorias de 8 caracteres. En TOTP el secreto K está en la base: el segundo
  factor cae al instante. En el ZKP no hay contraseña que adivinar: se usa la estimación de
  BSGS de results/bsgs.json (attacks/stolen_db.py).
- Repetición: un espía reenvía los mensajes de un inicio de sesión exitoso contra el banco real.
"""

import json
import math
import statistics
import time
import warnings
from collections.abc import Callable
from pathlib import Path
from typing import Any

from attacks.stolen_db import AVERAGE_STEPS_FACTOR, SECONDS_PER_YEAR
from benchmark.compare_harness import Lab, NetworkRecord, Scenario, create_lab, run_flow
from core.modular import get_backend, use_backend
from mechanisms.password.credentials import hash_password, verify_password
from mechanisms.srp import srp6a

DICTIONARY_SIZE = 10**6                  # contraseñas comunes (por ejemplo, las más usadas de rockyou)
RANDOM_ALPHABET = 94                     # ASCII imprimible sin el espacio
RANDOM_LENGTH = 8
RANDOM_SPACE = RANDOM_ALPHABET**RANDOM_LENGTH
DEFAULT_GUESSES = 25
ATTACKER_USER = "victima"
ATTACKER_PASSWORD = "contraseña-real-de-la-victima"
FAST_BACKEND = "gmpy2"
BSGS_RESULTS = Path(__file__).resolve().parent.parent / "results" / "bsgs.json"


def _guesses(count: int) -> list[str]:
    return [f"candidata-{index:06d}" for index in range(count)]


def _seconds_per_guess(try_guess: Callable[[str], bool], count: int) -> float:
    """Mediana de segundos por candidata (time.perf_counter), con un intento de calentamiento."""
    try_guess("calentamiento")
    times = []
    for guess in _guesses(count):
        start = time.perf_counter()
        if try_guess(guess):
            raise RuntimeError("Una candidata de prueba coincidió con la contraseña real.")
        times.append(time.perf_counter() - start)
    return statistics.median(times)


def argon2_seconds_per_guess(count: int = DEFAULT_GUESSES) -> float:
    """Costo de probar una contraseña contra un hash Argon2id robado. Cubre C5."""
    stored = hash_password(ATTACKER_PASSWORD)
    return _seconds_per_guess(lambda guess: verify_password(stored, guess), count)


def srp_seconds_per_guess(count: int = DEFAULT_GUESSES) -> float:
    """Costo de probar una contraseña contra (s, v) robados: x = H(s | H(I:P)) y g^x mod N. Cubre C5."""
    group, salt = srp6a.RFC5054_2048, srp6a.new_salt()
    v = srp6a.verifier(group, srp6a.private_key(group, salt, ATTACKER_USER, ATTACKER_PASSWORD))
    return _seconds_per_guess(
        lambda guess: srp6a.verifier(group, srp6a.private_key(group, salt, ATTACKER_USER, guess)) == v, count)


def _projection(seconds_per_guess: float) -> dict[str, float]:
    """Intentos por segundo y años para el diccionario y para el espacio de 8 caracteres (en promedio, la mitad)."""
    dictionary_s = DICTIONARY_SIZE * seconds_per_guess
    random_s = RANDOM_SPACE / 2 * seconds_per_guess
    return {"seconds_per_guess": seconds_per_guess, "guesses_per_second": 1 / seconds_per_guess,
            "dictionary_seconds": dictionary_s, "dictionary_years": dictionary_s / SECONDS_PER_YEAR,
            "random8_years": random_s / SECONDS_PER_YEAR,
            "dictionary_log10_years": math.log10(dictionary_s / SECONDS_PER_YEAR),
            "random8_log10_years": math.log10(random_s / SECONDS_PER_YEAR)}


def _bsgs_log10_years(q_bits: int, seconds_per_operation: float) -> float:
    """log₁₀ de los años de BSGS con q de q_bits bits (1.5·√q operaciones), sin desbordar el float."""
    log10_seconds = (math.log10(seconds_per_operation) + math.log10(AVERAGE_STEPS_FACTOR)
                     + q_bits / 2 * math.log10(2))
    return log10_seconds - math.log10(SECONDS_PER_YEAR)


def _bsgs_seconds_per_operation() -> float:
    try:
        return float(json.loads(BSGS_RESULTS.read_text(encoding="utf-8"))["fit"]["seconds_per_operation"])
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise RuntimeError(f"Falta {BSGS_RESULTS.name}: ejecute primero attacks.stolen_db.run().") from error


def _fast_attacker(count: int) -> dict[str, dict[str, float]]:
    """El mismo ataque contra SRP con GMP: un atacante usa la aritmética más rápida que tenga."""
    try:
        with use_backend(FAST_BACKEND):
            return {FAST_BACKEND: _projection(srp_seconds_per_guess(count))}
    except ValueError as error:
        warnings.warn(f"Sin el atacante con {FAST_BACKEND}: {error}", stacklevel=2)
        return {}


def stolen_database(count: int = DEFAULT_GUESSES) -> dict[str, Any]:
    """Costo del ataque fuera de línea con la base robada, por mecanismo. Cubre C5.

    Contra SRP se mide con el backend activo de mod_pow (el mismo del resto del experimento) y,
    además, con gmpy2 si está instalado.
    """
    argon2 = _projection(argon2_seconds_per_guess(count))
    srp = {get_backend(): _projection(srp_seconds_per_guess(count))}
    if FAST_BACKEND not in srp:
        srp = {**srp, **_fast_attacker(count)}
    seconds_per_op = _bsgs_seconds_per_operation()
    zkp = {name: {"q_bits": q_bits, "bsgs_log10_years": _bsgs_log10_years(q_bits, seconds_per_op)}
           for name, q_bits in (("schnorr-2048", 224), ("rfc-2048", 2047))}
    return {"dictionary_size": DICTIONARY_SIZE, "random_space": f"{RANDOM_ALPHABET}^{RANDOM_LENGTH}",
            "password": argon2, "totp": {**argon2, "second_factor": "comprometido al instante: K está en la base"},
            "srp": srp, "zkp": {"bsgs_seconds_per_operation": seconds_per_op, "groups": zkp,
                                "dictionary": "no aplica: x es aleatoria, no sale de una contraseña"}}


# ------------------------------------------------------------------ repetición

def _accepted(record: NetworkRecord) -> bool:
    body = record.response_body if isinstance(record.response_body, dict) else {}
    return record.status == 200 and body.get("accepted") is True


def _replay(lab: Lab, captured: list[NetworkRecord], adapt_session: bool) -> NetworkRecord:
    """Reenvía los POST capturados en orden; con adapt_session usa la sesión nueva que dé el banco."""
    session_id, last = None, None
    for original in captured:
        body = dict(original.request_body)
        if adapt_session and session_id and "session_id" in body:
            body["session_id"] = session_id
        lab.gateway.request(original.method, original.path, body)
        last = lab.gateway.take()[-1]
        response = last.response_body if isinstance(last.response_body, dict) else {}
        session_id = response.get("session_id", session_id)
    return last


def replay_experiment(scenario: Scenario) -> dict[str, Any]:
    """Captura un inicio de sesión exitoso y lo repite tal cual y con la sesión nueva. Cubre C5.

    En TOTP la repetición ocurre en el mismo paso de 30 s (el caso más favorable al espía).
    """
    results = {}
    for variant, adapt in (("verbatim", False), ("sesion_nueva", True)):
        lab = create_lab(scenario)
        run_flow(lab, "register", ATTACKER_USER)
        captured = [r for r in run_flow(lab, scenario.login_flow, ATTACKER_USER).records if r.method == "POST"]
        last = _replay(lab, captured, adapt)
        body = last.response_body if isinstance(last.response_body, dict) else {}
        results[variant] = {"accepted": _accepted(last), "status": last.status, "reason": str(body.get("reason"))}
    return {"accepted": any(r["accepted"] for r in results.values()), **results}


# ---------------------------------------------------------- tabla cualitativa

QUALITATIVE = {
    "password": {
        "phishing": "Vulnerable",
        "phishing_why": ("La persona escribe la contraseña en el sitio falso y este la recibe en claro: "
                         "sirve para siempre y en cualquier otro sitio donde se repita."),
        "online_bruteforce": "Limitado por el bloqueo",
        "online_why": ("Tres intentos por cuenta antes del bloqueo; queda expuesto a probar pocas contraseñas "
                       "muy comunes en muchas cuentas (password spraying) y a credenciales filtradas."),
    },
    "totp": {
        "phishing": "Parcial (cae ante un relevo en tiempo real)",
        "phishing_why": ("El sitio falso obtiene la contraseña y un código válido unos 30–90 s; si los "
                         "reenvía al banco de inmediato (adversario en el medio) entra. El código no sirve "
                         "después, pero la contraseña sí."),
        "online_bruteforce": "Muy difícil",
        "online_why": ("Además de la contraseña hay que acertar un código de 10^6 (3 aceptados por la "
                       "ventana ±1): con 3 intentos antes del bloqueo, probabilidad ≈ 9·10^-6."),
    },
    "srp": {
        "phishing": "Resistente si el cliente hace SRP",
        "phishing_why": ("La contraseña no viaja y un banco falso que no conoce v no puede producir M2: el "
                         "celular lo detecta. Solo puede probar una contraseña por sesión. Si la persona "
                         "escribe la contraseña en un formulario web falso, se pierde igual."),
        "online_bruteforce": "Limitado por el bloqueo",
        "online_why": ("Cada candidata exige una sesión completa con el banco (no hay prueba fuera de línea "
                       "con lo que viaja) y tres M1 incorrectos bloquean la cuenta."),
    },
    "zkp": {
        "phishing": "Resistente (no hay secreto que escribir)",
        "phishing_why": ("x nunca sale del celular ni la persona la conoce; las transcripciones no revelan "
                         "nada (conocimiento cero). El protocolo no autentica al banco: un relevo en tiempo "
                         "real se evita con TLS y ligando la prueba al canal o al origen (como hace WebAuthn)."),
        "online_bruteforce": "Despreciable",
        "online_why": ("Un impostor acierta el reto con probabilidad 1/q por intento (2^-224 con "
                       "schnorr-2048) y el bloqueo deja tres intentos."),
    },
}
