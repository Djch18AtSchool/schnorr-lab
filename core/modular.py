"""Aritmética modular propia: potencia rápida, Euclides extendido e inverso (R4, R5).

Este módulo no depende de ningún otro del proyecto. Por convención, dentro de ``core/``,
``protocol/`` y ``attacks/`` está prohibido usar ``pow(a, b, n)`` o ``pow(a, -1, n)``:
toda potencia e inverso modular pasa por estas funciones, para que el programa implemente
la matemática del marco teórico y no la delegue en Python.

Backend aritmético intercambiable (solo para experimentos, R7). Por regla del curso, el
protocolo usa siempre la exponenciación rápida propia («propia», la opción por defecto).
Los otros dos backends existen únicamente para que el experimento de latencia compare el
costo de la implementación en igualdad de condiciones (mismos operandos, mismo flujo):
«nativa» delega en ``pow`` de Python y «gmpy2» en ``gmpy2.powmod`` (GMP). Los enteros de
Python ya están implementados en C, así que la diferencia entre «propia» y «nativa» es solo
el bucle de bits interpretado: medido, la propia tarda ≈ 1.6 veces lo que tarda pow nativo,
y gmpy2 es ≈ 7–8 veces más rápido que pow nativo. Separar ese factor constante evita
confundirlo con el efecto del tamaño k de p. Este despacho es la única excepción a la regla
de no llamar a pow. El backend se elige con la variable de entorno ``SCHNORR_ARITHMETIC``
(por defecto «propia») o temporalmente con ``with use_backend("nativa"):``.
"""

import os
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from functools import cache

MIN_MODULUS = 2
MINUS_SIGN = "−"  # signo menos tipográfico, igual al del escrito
ARITHMETIC_BACKENDS = ("propia", "nativa", "gmpy2")
DEFAULT_BACKEND = "propia"
BACKEND_ENV_VAR = "SCHNORR_ARITHMETIC"
GMPY2_INSTALL_HINT = "uv sync --group bench (o pip install gmpy2)"

# Backend fijado por use_backend; None = usar SCHNORR_ARITHMETIC o el valor por defecto.
_backend_override: ContextVar[str | None] = ContextVar("schnorr_arithmetic", default=None)


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
    (bit, base actual, acumulador) para el modo --verbose; en ese caso siempre usa la
    implementación propia, la única que produce la traza. Sin traza usa el backend activo
    (get_backend(): «propia» por defecto; «nativa» o «gmpy2» solo en experimentos).
    Requiere exp >= 0 y mod >= 2; si no, lanza ValueError.
    """
    if exp < 0:
        raise ValueError(f"El exponente debe ser mayor o igual que 0 (se recibió {exp}).")
    if mod < MIN_MODULUS:
        raise ValueError(f"El módulo debe ser mayor o igual que {MIN_MODULUS} (se recibió {mod}).")
    if trace is not None:
        return _square_and_multiply(base, exp, mod, trace)
    return _BACKEND_FUNCTIONS[get_backend()](base, exp, mod)


def _square_and_multiply(base: int, exp: int, mod: int, trace: list[str] | None = None) -> int:
    """Implementación propia de la definición 8 (backend «propia»)."""
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


def _native_pow(base: int, exp: int, mod: int) -> int:
    """Backend «nativa»: pow de Python (única llamada a pow permitida en core/, solo para comparar)."""
    return pow(base, exp, mod)


def _gmpy2_pow(base: int, exp: int, mod: int) -> int:
    """Backend «gmpy2»: gmpy2.powmod (GMP), convertido a int para que el resto del código no cambie."""
    return int(_gmpy2_powmod()(base, exp, mod))


@cache
def _gmpy2_powmod() -> Callable[[int, int, int], object]:
    """Importa gmpy2 solo cuando se usa; si no está instalado, ValueError con la instrucción."""
    try:
        import gmpy2
    except ImportError as error:
        raise ValueError(f"El backend «gmpy2» requiere la biblioteca gmpy2: {GMPY2_INSTALL_HINT}.") from error
    return gmpy2.powmod


_BACKEND_FUNCTIONS: dict[str, Callable[[int, int, int], int]] = {
    "propia": _square_and_multiply,
    "nativa": _native_pow,
    "gmpy2": _gmpy2_pow,
}


def _check_backend(name: str) -> str:
    if name not in ARITHMETIC_BACKENDS:
        raise ValueError(f"Backend aritmético desconocido «{name}». Opciones: {', '.join(ARITHMETIC_BACKENDS)} "
                         f"(se elige con use_backend o con la variable {BACKEND_ENV_VAR}).")
    return name


def get_backend() -> str:
    """Nombre del backend activo de mod_pow. Cubre R4 y R7.

    Prioridad: el fijado con use_backend; si no hay, la variable de entorno SCHNORR_ARITHMETIC;
    si tampoco, «propia». Un nombre desconocido lanza ValueError.
    """
    override = _backend_override.get()
    if override is not None:
        return override
    return _check_backend(os.environ.get(BACKEND_ENV_VAR, DEFAULT_BACKEND))


@contextmanager
def use_backend(name: str) -> Iterator[None]:
    """Usa temporalmente otro backend de mod_pow y al salir restaura el anterior. Cubre R7.

    Pensado para el experimento de latencia: with use_backend("nativa"): ... Un nombre
    desconocido, o «gmpy2» sin la biblioteca instalada, lanza ValueError antes de cambiar nada.
    """
    _check_backend(name)
    if name == "gmpy2":
        _gmpy2_powmod()
    token = _backend_override.set(name)
    try:
        yield
    finally:
        _backend_override.reset(token)


def euclid_steps(a: int, b: int) -> tuple[int, int, int, tuple[EuclidStep, ...]]:
    """Algoritmo Extendido de Euclides iterativo, conservando cada división (definiciones 3 y 4).

    Devuelve (d, u, v, pasos) con d = mcd(a, b) y u·a + v·b = d. Cubre R5.
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
