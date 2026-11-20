"""Paso de bebé, paso de gigante (BSGS): costo de resolver el logaritmo discreto (R10).

Ilustra la definición 9: dado y ≡ g^x (mod p), hallar x con el algoritmo de Shanks cuesta del
orden de √q operaciones y √q entradas de memoria (Menezes et al., 1996), que es inviable cuando
q tiene cientos de bits. Con m = ⌈√q⌉, todo x en [0, q − 1] se escribe x = i·m + j con
0 ≤ i, j < m, y g^x ≡ y equivale a g^j ≡ y·(g^−m)^i (mod p).

Qué cuenta «operaciones»: cada paso de bebé (una multiplicación modular y una inserción en el
diccionario) y cada paso de gigante probado (una búsqueda en el diccionario y, si no hay
coincidencia, una multiplicación por g^−m). Son m + (i + 1) ≤ 2m ≈ 2√q. No se cuenta el
cálculo único de g^−m (una potencia y un inverso, del orden de log q pasos), que no crece con √q.
Ejemplo del escrito (p = 23, q = 11, g = 4, y = 8): m = 4, 4 pasos de bebé y 2 de gigante,
x = 1·4 + 3 = 7 en 6 operaciones.
"""

import math
import time

from core.modular import mod_inverse, mod_pow
from core.params import TOY_GROUP, GroupParams
from protocol.bank import Bank
from protocol.client import Client

VICTIM_ID = "victima"
TOY_X = 7                       # con p = 23: y = 4^7 mod 23 = 8, como en el escrito
MAX_BSGS_Q_BITS = 44            # m = 2^22 entradas en el diccionario (unos 500 MB)
MAX_TRACE_STEPS = 16            # con más pasos la traza deja de ser legible


def ceil_sqrt(q: int) -> int:
    """m = ⌈√q⌉ con aritmética entera (math.isqrt, sin redondeo de punto flotante). Cubre R10."""
    if q < 1:
        raise ValueError(f"q debe ser al menos 1 (se recibió {q}).")
    return math.isqrt(q - 1) + 1


def _baby_steps(g: int, p: int, m: int, trace: list[str] | None) -> dict[int, int]:
    """Diccionario g^j mod p → j para j = 0, …, m − 1 (se conserva el menor j)."""
    table: dict[int, int] = {}
    value = 1
    for j in range(m):
        table.setdefault(value, j)
        if trace is not None:
            trace.append(f"bebé    j = {j}: g^{j} mod p = {value}")
        value = value * g % p
    return table


def bsgs(g: int, y: int, p: int, q: int, trace: list[str] | None = None) -> tuple[int, int]:
    """Devuelve (x, operaciones) con g^x ≡ y (mod p) y 0 ≤ x < q (definición 9). Cubre R10.

    m = ⌈√q⌉; pasos de bebé g^j (j < m) guardados en un diccionario; pasos de gigante
    y·(g^−m)^i hasta encontrar una coincidencia g^j; entonces x = i·m + j. Usa mod_pow y
    mod_inverse (Euclides extendido) para g^−m. «operaciones» = pasos de bebé + pasos de
    gigante probados (≤ 2m). Si trace no es None, agrega un renglón por paso.
    Si y no está en el subgrupo generado por g, no hay solución y lanza ValueError.
    """
    if p < 2:
        raise ValueError(f"p debe ser al menos 2 (se recibió {p}).")
    m = ceil_sqrt(q)
    table = _baby_steps(g, p, m, trace)
    giant_factor = mod_inverse(mod_pow(g, m, p), p)  # g^−m mod p
    if trace is not None:
        trace.append(f"g^−m = (g^{m})^−1 mod p = {giant_factor}")
    gamma = y % p
    for i in range(m):
        j = table.get(gamma)
        if trace is not None:
            found = f"coincide con j = {j} ⇒ x = {i}·{m} + {j} = {i * m + j}" if j is not None else "no está"
            trace.append(f"gigante i = {i}: y·(g^−m)^{i} mod p = {gamma} → {found}")
        if j is not None:
            return i * m + j, m + i + 1
        gamma = gamma * giant_factor % p
    raise ValueError(f"No existe x con {g}^x ≡ {y} (mod {p}) y 0 ≤ x < {q}: "
                     "y no pertenece al subgrupo generado por g.")


def run(gp: GroupParams = TOY_GROUP, verbose: bool = False) -> dict:
    """Roba la tabla id → y del banco y recupera x con BSGS (opción 6 del menú). Cubre R10.

    Con el grupo de ejemplo la víctima usa x = 7 (y = 8, como en el escrito); con otros grupos,
    x al azar. Devuelve q, m, y, la x real, la encontrada, las operaciones y los segundos.
    Si q tiene más de MAX_BSGS_Q_BITS bits lanza ValueError: la memoria y el tiempo crecen
    como √q, y justamente esa inviabilidad es la que protege al banco.
    """
    q_bits = gp.q.bit_length()
    if q_bits > MAX_BSGS_Q_BITS:
        raise ValueError(f"q tiene {q_bits} bits: BSGS necesitaría unas 2^{q_bits // 2} operaciones y "
                         f"otras tantas entradas de memoria; es inviable. Use un q de a lo sumo "
                         f"{MAX_BSGS_Q_BITS} bits.")
    bank = Bank(gp)
    victim = Client(VICTIM_ID, gp, x=TOY_X if gp == TOY_GROUP else None)
    bank.register(*victim.register_payload())
    y = bank.users[VICTIM_ID]  # lo único que obtiene el atacante al robar la base de datos
    m = ceil_sqrt(gp.q)
    trace: list[str] | None = [] if verbose and m <= MAX_TRACE_STEPS else None
    start = time.perf_counter()
    x_found, operations = bsgs(gp.g, y, gp.p, gp.q, trace)
    seconds = time.perf_counter() - start
    result = {
        "q": gp.q, "q_bits": q_bits, "m": m, "y": y, "x_real": victim.x, "x_found": x_found,
        "recovered": x_found == victim.x, "operations": operations, "seconds": seconds,
    }
    if verbose:
        _print_report(gp, result, trace or [])
    return result


def _print_report(gp: GroupParams, r: dict, trace: list[str]) -> None:
    print(f"[BSGS] El atacante roba la tabla del banco y obtiene y = {r['y']} "
          f"(p de {gp.bits} bits, q de {r['q_bits']} bits, g = {gp.g}).")
    print(f"    m = ⌈√q⌉ = {r['m']}: guarda g^j para j < m (pasos de bebé) y prueba y·(g^−m)^i "
          "(pasos de gigante).")
    for line in trace:
        print(f"        {line}")
    verdict = "sí" if r["recovered"] else "no"
    print(f"    x encontrada = {r['x_found']} en {r['operations']} operaciones (≤ 2m = {2 * r['m']}) "
          f"y {r['seconds']:.6f} s. ¿Coincide con la x real? {verdict}.")
    print("    Con q de 224 bits harían falta unas 2^112 operaciones: por eso basta con guardar y.")
