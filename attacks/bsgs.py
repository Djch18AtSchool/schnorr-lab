"""Paso de bebé, paso de gigante (BSGS): costo de resolver el logaritmo discreto (R10).

ESQUELETO: informe final. Ilustra la definición 9: dado y ≡ g^x (mod p), hallar x cuesta
del orden de √q operaciones con BSGS, que es inviable cuando q tiene cientos de bits.
"""

from core.params import TOY_GROUP, GroupParams

PENDING_MESSAGE = "Disponible en el informe final: BSGS"


def bsgs(g: int, y: int, p: int, q: int) -> tuple[int, int]:
    """Devuelve (x, operaciones) con g^x ≡ y (mod p) y 0 ≤ x < q. Cubre R10.

    Plan: m = ⌈√q⌉; pasos de bebé g^j para j < m guardados en un diccionario; pasos de
    gigante y·(g^-m)^i hasta encontrar coincidencia; x = i·m + j. Con p = 23, g = 4, y = 8:
    m = 4 y x = 7. Usa mod_pow y mod_inverse de core.modular.
    """
    raise NotImplementedError(PENDING_MESSAGE)


def run(gp: GroupParams = TOY_GROUP, verbose: bool = False) -> dict:
    """Recupera x a partir de y en el grupo dado (opción 6 del menú). Cubre R10."""
    raise NotImplementedError(PENDING_MESSAGE)
