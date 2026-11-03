"""Ataque de reutilización de r: justifica que r sea nuevo en cada intento (R3, R10).

Si el cliente responde a dos retos distintos con el mismo r (mismo compromiso t), cualquiera
que vea las dos transcripciones públicas despeja x:
    s₁ − s₂ ≡ (c₁ − c₂)·x (mod q)   ⇒   x ≡ (s₁ − s₂)·(c₁ − c₂)^-1 (mod q).
Es la propiedad de solidez (definición 12) vista desde el atacante: dos respuestas al mismo
compromiso equivalen a conocer x. Por eso Client.respond borra r después de usarlo.
"""

from core.modular import mod_inverse
from core.params import TOY_GROUP, GroupParams
from protocol.bank import Bank
from protocol.client import Client

VICTIM_ID = "victima"
TOY_EXAMPLE = {"x": 7, "r": 5, "c1": 3, "c2": 5}  # con p = 23: s₁ = 4, s₂ = 7 → x = 7


class FaultyClient(Client):
    """Cliente defectuoso: no borra r y lo reutiliza en el siguiente compromiso. Cubre R10."""

    def commit(self, r: int | None = None, trace: list[str] | None = None) -> int:
        """Reutiliza el r anterior si no se borró (el defecto que se ataca). Cubre R10."""
        reused = self._r if r is None else r
        return super().commit(r=reused, trace=trace)

    def respond(self, c: int) -> int:
        """Responde igual que Client.respond, pero conserva r para el próximo intento. Cubre R10."""
        kept = self._r
        s = super().respond(c)
        self._r = kept  # el error: r sigue disponible para el próximo intento
        return s


def extract_secret(gp: GroupParams, c1: int, s1: int, c2: int, s2: int) -> int:
    """x = (s₁ − s₂)·(c₁ − c₂)^-1 mod q, usando el inverso por Euclides extendido. Cubre R10."""
    if (c1 - c2) % gp.q == 0:
        raise ValueError("Los dos retos deben ser distintos módulo q para despejar x.")
    return (s1 - s2) * mod_inverse(c1 - c2, gp.q) % gp.q


def _login(bank: Bank, victim: FaultyClient, fixed_c: int | None) -> tuple[int, int, bool]:
    """Un inicio de sesión completo de la víctima: devuelve (c, s, aceptado)."""
    session_id, c = bank.challenge(VICTIM_ID, victim.commit(), c=fixed_c)
    s = victim.respond(c)
    return c, s, bank.verify(session_id, s).accepted


def _login_with_new_challenge(bank: Bank, victim: FaultyClient, first_c: int,
                              fixed_c: int | None) -> tuple[int, int, bool]:
    """Repite inicios de sesión completos hasta que el banco elija un reto distinto del primero.

    Con q grande ocurre a la primera. No se abandonan sesiones, porque cada una abandonada
    cuenta como intento fallido y podría bloquear a la víctima.
    """
    while True:
        c, s, accepted = _login(bank, victim, fixed_c)
        if c != first_c:
            return c, s, accepted


def run(gp: GroupParams = TOY_GROUP, verbose: bool = False) -> dict:
    """Dos inicios de sesión válidos con el mismo r y extracción de x a partir de lo público. Cubre R10.

    Con el grupo de ejemplo usa r = 5 y retos 3 y 5 (s = 4 y 7 → x = 7); con otros grupos,
    valores aleatorios.
    """
    example = TOY_EXAMPLE if gp == TOY_GROUP else dict.fromkeys(TOY_EXAMPLE)
    bank = Bank(gp)
    victim = FaultyClient(VICTIM_ID, gp, x=example["x"])
    bank.register(*victim.register_payload())

    t = victim.commit(r=example["r"])  # el FaultyClient repetirá este r (y este t) siempre
    c1, s1, first_accepted = _login(bank, victim, example["c1"])
    c2, s2, second_accepted = _login_with_new_challenge(bank, victim, c1, example["c2"])

    x_extracted = extract_secret(gp, c1, s1, c2, s2)
    result = {
        "t": t, "c1": c1, "s1": s1, "c2": c2, "s2": s2,
        "both_accepted": first_accepted and second_accepted,
        "x_real": victim.x, "x_extracted": x_extracted, "recovered": x_extracted == victim.x,
    }
    if verbose:
        _print_report(gp, result)
    return result


def _print_report(gp: GroupParams, r: dict) -> None:
    print(f"[Reutilización de r] La víctima usa el mismo r en dos inicios de sesión (t = {r['t']}).")
    print(f"    Sesión 1: c₁ = {r['c1']}, s₁ = {r['s1']}")
    accepted = "sí" if r["both_accepted"] else "no"
    print(f"    Sesión 2: c₂ = {r['c2']}, s₂ = {r['s2']}   (¿el banco aceptó ambas? {accepted})")
    print(f"    x = (s₁ − s₂)·(c₁ − c₂)^-1 mod q = ({r['s1']} − {r['s2']})·({r['c1']} − {r['c2']})^-1 "
          f"mod {gp.q} = {r['x_extracted']}")
    verdict = "sí" if r["recovered"] else "no"
    print(f"    ¿Coincide con la x real? {verdict}: por eso el cliente borra r después de responder.")
