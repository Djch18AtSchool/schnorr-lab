"""Lo que el banco del ZKP deja ver de cada decisión: traza de código, cálculos y señal (R11).

Para cada resultado de protocol.Bank se elige la función que lo decidió y la línea exacta
(por su texto), los cálculos con los números reales y una señal genérica para la telemetría
(auth.ok, auth.rejected, auth.replay, ...). No cambia ninguna decisión del banco.
"""

from typing import Any

from infra.spans import code_span
from protocol import GroupParams
from protocol.bank import Bank
from protocol.fiat_shamir import _freshness_problem, verify_nizk
from protocol.transcript import Reason, VerifyResult

MAX_DIGITS = 24          # los enteros más largos se recortan en los cálculos: 1234…6789

REGISTER_LINES = {
    Reason.REGISTERED: "self._users[user_id] = y",
    Reason.INVALID_USER_ID: "Reason.INVALID_USER_ID",
    Reason.USER_EXISTS: "Reason.USER_EXISTS",
    Reason.Y_IS_ONE: "Reason.Y_IS_ONE",
    Reason.Y_NOT_IN_SUBGROUP: "Reason.Y_NOT_IN_SUBGROUP",
}
CHALLENGE_LINES = {
    Reason.USER_NOT_FOUND: "Reason.USER_NOT_FOUND",
    Reason.ACCOUNT_LOCKED: "Reason.ACCOUNT_LOCKED",
    Reason.T_NOT_IN_SUBGROUP: "Reason.T_NOT_IN_SUBGROUP",
}
DECIDE_LINES = {
    Reason.ACCESS_GRANTED: 'if details["gs"] == details["tyc"] and details["t_rec"] == t:',
    Reason.CONGRUENCE_FAILED: "Reason.CONGRUENCE_FAILED",
    Reason.S_OUT_OF_RANGE: "Reason.S_OUT_OF_RANGE",
}
FRESHNESS_LINES = {
    Reason.MISSING_TIMESTAMP: "Reason.MISSING_TIMESTAMP",
    Reason.TIMESTAMP_OUT_OF_WINDOW: "Reason.TIMESTAMP_OUT_OF_WINDOW",
    Reason.PROOF_ALREADY_USED: "Reason.PROOF_ALREADY_USED",
}
STALE_REASONS = frozenset({Reason.MISSING_TIMESTAMP, Reason.TIMESTAMP_OUT_OF_WINDOW})


def short(value: int | str) -> str:
    """Entero como texto; si es muy largo, solo el principio y el final."""
    text = str(value)
    return text if len(text) <= MAX_DIGITS else f"{text[:8]}…{text[-8:]} ({len(text)} díg.)"


def _tone(accepted: bool) -> str:
    return "ok" if accepted else "bad"


def register_span(reason: Reason) -> dict[str, Any]:
    """Bank.register con la línea que tomó la decisión. Cubre R2 y R9."""
    return code_span(Bank.register, (REGISTER_LINES.get(reason, "def register"),), _tone(reason == Reason.REGISTERED))


def challenge_span(rejected: Reason | None) -> dict[str, Any]:
    """Bank.challenge: el reto aleatorio y la sesión, o la línea del rechazo. Cubre R3 y R9."""
    if rejected is None:
        return code_span(Bank.challenge, ("c_value = secrets.randbelow", "self._sessions[session_id] ="))
    return code_span(Bank.challenge, (CHALLENGE_LINES.get(rejected, "def challenge"),), "bad")


def verify_span(result: VerifyResult) -> dict[str, Any]:
    """Bank.verify (sesión inexistente o cuenta bloqueada) o Bank._decide (la congruencia). Cubre R6 y R9."""
    if result.reason == Reason.INVALID_SESSION:
        return code_span(Bank.verify, ("session = self._sessions.pop", "Reason.INVALID_SESSION"), "bad")
    if result.reason == Reason.ACCOUNT_LOCKED:
        return code_span(Bank.verify, ("Reason.ACCOUNT_LOCKED",), "bad")
    return code_span(Bank._decide, (DECIDE_LINES.get(result.reason, "def _decide"),), _tone(result.accepted))


def nizk_span(result: VerifyResult) -> dict[str, Any]:
    """Fiat-Shamir: la frescura (m, pruebas usadas) o la misma decisión que el modo interactivo. Cubre R8."""
    if result.reason in FRESHNESS_LINES:
        return code_span(_freshness_problem, (FRESHNESS_LINES[result.reason],), "bad")
    if result.reason in DECIDE_LINES:
        return verify_span(result)
    return code_span(verify_nizk, ("result = bank.verify_proof",), _tone(result.accepted))


def subgroup_math(name: str, value: int, gp: GroupParams) -> list[str]:
    """La comprobación de pertenencia al subgrupo: value^q mod p = 1. Cubre R9."""
    result = pow(value, gp.q, gp.p)
    verdict = "∈ subgrupo" if result == 1 else "∉ subgrupo"
    return [f"{name}^q mod p = {short(value)}^{short(gp.q)} mod {short(gp.p)} = {short(result)} → {verdict}"]


def verify_math(details: dict[str, int], y: int, t: int, c: int, s: int, gp: GroupParams) -> list[str]:
    """Los cálculos de la verificación con los números reales (definiciones 8 y 10). Cubre R6."""
    if not details:
        return []
    p, g = short(gp.p), short(gp.g)
    equal = "=" if details["gs"] == details["tyc"] else "≠"
    back = "= t ✔" if details["t_rec"] == t else "≠ t ✘"
    return [
        f"g^s = {g}^{short(s)} mod {p} = {short(details['gs'])}",
        f"t·y^c = {short(t)}·{short(y)}^{short(c)} mod {p} = {short(details['tyc'])}  ({equal} g^s)",
        f"(y^c)^-1 = {short(details['yc'])}^-1 mod {p} = {short(details['yc_inv'])}  (Euclides extendido)",
        f"g^s·(y^c)^-1 = {short(details['gs'])}·{short(details['yc_inv'])} mod {p} = {short(details['t_rec'])} {back}",
    ]


def verdict_signals(result: VerifyResult, replayed: bool) -> list[str]:
    """Señales de telemetría de una decisión de inicio de sesión. Cubre R9 y R11."""
    if result.accepted:
        return ["auth.ok"]
    if result.reason in (Reason.INVALID_SESSION, Reason.PROOF_ALREADY_USED):
        return ["auth.replay" if replayed else "auth.invalid_session"]
    if result.reason in STALE_REASONS:
        return ["auth.stale"]
    if result.reason == Reason.ACCOUNT_LOCKED:
        return ["auth.locked_attempt"]
    if result.reason == Reason.USER_NOT_FOUND:
        return ["auth.unknown_user"]
    signals = ["auth.rejected"]
    if result.attempts_left == 0:
        signals.append("auth.lockout")
    return signals
