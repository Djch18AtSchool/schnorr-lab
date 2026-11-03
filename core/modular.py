"""Aritmética modular propia: potencia rápida, Euclides extendido e inverso (R4, R5).

Este módulo no depende de ningún otro del proyecto. Por convención, dentro de ``core/``,
``protocol/`` y ``attacks/`` está prohibido usar ``pow(a, b, n)`` o ``pow(a, -1, n)``:
toda potencia e inverso modular pasa por estas funciones, para que el programa implemente
la matemática del marco teórico y no la delegue en Python.
"""

from dataclasses import dataclass

MIN_MODULUS = 2
MINUS_SIGN = "−"  # signo menos tipográfico, igual al del escrito


@dataclass(frozen=True)
class EuclidStep:
    """Una división del Algoritmo de Euclides: dividend = quotient · divisor + remainder.

    Además guarda los coeficientes de Bézout del residuo: remainder = u · a + v · b,
    donde (a, b) son los números con los que empezó el algoritmo.
    """

    dividend: int
    quotient: int
    divisor: int
    remainder: int
    u: int
    v: int


def mod_pow(base: int, exp: int, mod: int, trace: list[str] | None = None) -> int:
    """Exponenciación modular rápida por cuadrados y multiplicaciones (definición 8). Cubre R4.

    Recorre los bits de exp de derecha a izquierda: si el bit es 1 multiplica el acumulador
    por la base actual y luego eleva la base al cuadrado. Así se necesitan del orden de
    log₂(exp) multiplicaciones modulares. Si trace no es None, agrega una línea por paso
    (bit, base actual, acumulador) para el modo --verbose.
    Requiere exp >= 0 y mod >= 2; si no, lanza ValueError.
    """
    if exp < 0:
        raise ValueError(f"El exponente debe ser mayor o igual que 0 (se recibió {exp}).")
    if mod < MIN_MODULUS:
        raise ValueError(f"El módulo debe ser mayor o igual que {MIN_MODULUS} (se recibió {mod}).")

    accumulator = 1
    power = base % mod
    remaining = exp
    bit_index = 0
    while remaining > 0:
        bit = remaining & 1
        if bit:
            accumulator = accumulator * power % mod
        if trace is not None:
            trace.append(f"bit {bit_index} = {bit}   base = {power}   acumulador = {accumulator}")
        remaining >>= 1
        if remaining:
            power = power * power % mod
        bit_index += 1
    return accumulator


def euclid_steps(a: int, b: int) -> tuple[int, int, int, tuple[EuclidStep, ...]]:
    """Algoritmo Extendido de Euclides iterativo, conservando cada división (definiciones 3 y 4).

    Devuelve (d, u, v, pasos) con d = mcd(a, b) y u·a + v·b = d.
    """
    prev_r, r = a, b
    prev_u, u = 1, 0
    prev_v, v = 0, 1
    steps: list[EuclidStep] = []
    while r != 0:
        quotient = prev_r // r
        remainder = prev_r - quotient * r
        next_u = prev_u - quotient * u
        next_v = prev_v - quotient * v
        steps.append(EuclidStep(prev_r, quotient, r, remainder, next_u, next_v))
        prev_r, r = r, remainder
        prev_u, u = u, next_u
        prev_v, v = v, next_v
    return prev_r, prev_u, prev_v, tuple(steps)


def extended_gcd(a: int, b: int) -> tuple[int, int, int]:
    """Algoritmo Extendido de Euclides, versión iterativa (definición 4). Cubre R5.

    Devuelve (d, u, v) con d = mcd(a, b) y u·a + v·b = d (identidad de Bézout).
    Ejemplo del escrito: extended_gcd(6, 23) = (1, 4, −1), porque 4·6 − 1·23 = 1.
    """
    d, u, v, _ = euclid_steps(a, b)
    return d, u, v


def mod_inverse(a: int, n: int, trace: list[str] | None = None) -> int:
    """Inverso de a módulo n con el Algoritmo Extendido de Euclides (definición 5). Cubre R5.

    Aplica Euclides a (n, a mod n); el coeficiente de a en la identidad de Bézout, reducido
    módulo n, es el inverso. Devuelve un valor en el rango [1, n − 1].
    Si mcd(a, n) ≠ 1 (o n < 2) lanza ValueError, porque el inverso no existe.
    Si trace no es None, agrega las divisiones y el despeje hacia atrás.
    """
    if n < MIN_MODULUS:
        raise ValueError(f"El módulo debe ser mayor o igual que {MIN_MODULUS} (se recibió {n}).")
    reduced = a % n
    d, _, coef_a, steps = euclid_steps(n, reduced)
    if d != 1:
        raise ValueError(f"{a} no tiene inverso módulo {n}: mcd({a}, {n}) = {d} ≠ 1.")
    inverse = coef_a % n
    if trace is not None:
        trace.extend(_inverse_trace(reduced, n, steps, inverse))
    return inverse


def _signed(value: int) -> str:
    return f"{MINUS_SIGN}{abs(value)}" if value < 0 else str(value)


def _inverse_trace(a: int, n: int, steps: tuple[EuclidStep, ...], inverse: int) -> list[str]:
    """Líneas legibles: primero las divisiones, luego cada residuo despejado como v·a + u·n."""
    divisions = [f"{s.dividend} = {s.quotient}·{s.divisor} + {s.remainder}" for s in steps]
    back_substitution = [
        f"Despeje: {s.remainder} = {_signed(s.v)}·{a} "
        f"{MINUS_SIGN if s.u < 0 else '+'} {abs(s.u)}·{n}"
        for s in steps
        if s.remainder != 0
    ]
    return [*divisions, *back_substitution, f"⇒ {a}^-1 ≡ {inverse} (mod {n})"]
