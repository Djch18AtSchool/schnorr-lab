"""Ataque de repetición de una prueba no interactiva (R8, R10).

Justifica la marca de tiempo m, la ventana Δ y el registro de pruebas usadas de la variante
de Fiat-Shamir: un espía captura una prueba (id, t, s, m) válida y la reenvía.

Sin protección, el reto c = H(p ‖ g ‖ y ‖ t ‖ id) no depende del momento del intento, así
que la misma prueba vale para siempre y el espía entra sin conocer x. Con protección, una
repetición inmediata la detiene el conjunto de pares (t, s) usados y una tardía, la ventana
|ahora − m| ≤ Δ. Cambiar m por una hora reciente tampoco sirve: el par (t, s) ya está
registrado y, además, c cambiaría y la congruencia dejaría de cumplirse (salvo con
probabilidad 1/q, definición 16).
"""

from core.params import TOY_GROUP, GroupParams
from protocol.bank import Bank
from protocol.client import Client
from protocol.fiat_shamir import DEFAULT_WINDOW_SECONDS, current_timestamp, prove, verify_nizk

VICTIM_ID = "victima"
TOY_X = 7                                          # clave del ejemplo del escrito con p = 23
REPLAY_DELAY_SECONDS = 5                           # repetición inmediata: dentro de la ventana Δ
STALE_DELAY_SECONDS = DEFAULT_WINDOW_SECONDS + 1   # repetición tardía: fuera de la ventana Δ


def _bank_with(gp: GroupParams, victim: Client) -> Bank:
    """Banco nuevo con la víctima registrada (solo viaja y)."""
    bank = Bank(gp)
    bank.register(*victim.register_payload())
    return bank


def _attack_without_protection(gp: GroupParams, victim: Client) -> dict:
    """La víctima entra sin marca de tiempo y el espía reenvía la misma prueba al banco vulnerable."""
    bank = _bank_with(gp, victim)
    captured = prove(victim)  # m = None: el reto no depende del momento del intento
    original = verify_nizk(bank, captured, protect=False)
    replayed = verify_nizk(bank, captured, protect=False)
    return {
        "plain_t": captured.t, "plain_s": captured.s, "plain_c": original.transcript.c,
        "original_accepted_without_protection": original.accepted,
        "accepted_without_protection": replayed.accepted,
        "reason_without_protection": replayed.reason,
    }


def _attack_with_protection(gp: GroupParams, victim: Client, now: int) -> dict:
    """La víctima entra con m = now; el espía reenvía su prueba dentro y fuera de la ventana."""
    bank = _bank_with(gp, victim)
    captured = prove(victim, m=now)
    original = verify_nizk(bank, captured, now=now)
    replayed = verify_nizk(bank, captured, now=now + REPLAY_DELAY_SECONDS)
    stale = verify_nizk(bank, captured, now=now + STALE_DELAY_SECONDS)
    return {
        "m": captured.m, "t": captured.t, "s": captured.s, "c": original.transcript.c,
        "original_accepted_with_protection": original.accepted,
        "accepted_with_protection": replayed.accepted,
        "reason_with_protection": replayed.reason,
        "accepted_stale": stale.accepted,
        "reason_stale": stale.reason,
        "victim_locked": bank.is_locked(VICTIM_ID),
    }


def replay_experiment(gp: GroupParams = TOY_GROUP, verbose: bool = False) -> dict:
    """Captura una prueba y la reenvía con protect=False y con protect=True. Cubre R10.

    Resultado esperado: {"accepted_without_protection": True, "accepted_with_protection": False}.
    Además devuelve las pruebas capturadas, el motivo de cada rechazo y la repetición tardía
    (fuera de la ventana Δ), que justifican m y el conjunto de pares (t, s) de la
    definición 14. Con el grupo de ejemplo la víctima usa x = 7.
    """
    victim = Client(VICTIM_ID, gp, x=TOY_X if gp == TOY_GROUP else None)
    result = {
        "window": DEFAULT_WINDOW_SECONDS,
        "replay_delay": REPLAY_DELAY_SECONDS,
        "stale_delay": STALE_DELAY_SECONDS,
        **_attack_without_protection(gp, victim),
        **_attack_with_protection(gp, victim, current_timestamp()),
    }
    if verbose:
        _print_report(result)
    return result


def run(gp: GroupParams = TOY_GROUP, verbose: bool = False) -> dict:
    """Punto de entrada del menú (opción 4): ejecuta replay_experiment (definición 14). Cubre R10."""
    return replay_experiment(gp, verbose)


def _verdict(accepted: bool) -> str:
    return "aceptada" if accepted else "rechazada"


def _print_report(r: dict) -> None:
    print("[Repetición de pruebas] Un espía copia una prueba no interactiva válida y la reenvía.")
    print(f"    Sin protección: c = H(p ‖ g ‖ y ‖ t ‖ id) mod q = {r['plain_c']}, "
          f"prueba (t = {r['plain_t']}, s = {r['plain_s']})")
    print(f"        Víctima: {_verdict(r['original_accepted_without_protection'])}. "
          f"Espía con la misma prueba: {r['reason_without_protection']} (entra sin conocer x)")
    print(f"    Con protección (m y Δ = {r['window']} s): c = H(p ‖ g ‖ y ‖ t ‖ id ‖ m) mod q = {r['c']}, "
          f"prueba (t = {r['t']}, s = {r['s']}, m = {r['m']})")
    print(f"        Víctima: {_verdict(r['original_accepted_with_protection'])}.")
    print(f"        Espía {r['replay_delay']} s después: {r['reason_with_protection']} "
          f"(dentro de la ventana; lo detiene el registro de pares (t, s))")
    print(f"        Espía {r['stale_delay']} s después: {r['reason_stale']}")
    locked = "sí" if r["victim_locked"] else "no"
    print(f"    ¿La víctima quedó bloqueada por las repeticiones? {locked}: reenviar no cuenta como fallo.")
