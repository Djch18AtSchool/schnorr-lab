"""Ataque de repetición de una prueba no interactiva (R8, R10). ESQUELETO: informe final.

Justifica la marca de tiempo m, la ventana Δ y el registro de pruebas usadas de la variante
de Fiat-Shamir: un espía captura una prueba (id, t, s, m) válida y la reenvía.
"""

from core.params import TOY_GROUP, GroupParams

PENDING_MESSAGE = "Disponible en el informe final: ataque de repetición"


def run(gp: GroupParams = TOY_GROUP, verbose: bool = False) -> dict:
    """Captura una prueba y la reenvía con protect=False y con protect=True. Cubre R10.

    Resultado esperado: {"accepted_without_protection": True, "accepted_with_protection": False}.
    """
    raise NotImplementedError(PENDING_MESSAGE)
