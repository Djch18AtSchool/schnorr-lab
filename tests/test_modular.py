"""Pruebas de la aritmética modular propia (R4, R5), contrastadas con pow y SymPy."""

import secrets

import pytest
import sympy

from core.modular import extended_gcd, mod_inverse, mod_pow

RANDOM_CASES = 1000
OPERAND_BITS = 256


def _random_modulus() -> int:
    return 2 + secrets.randbelow(2**OPERAND_BITS)


# ---------------------------------------------------------------- R4: potencia modular

@pytest.mark.req("R4")
@pytest.mark.parametrize(
    ("base", "exp", "mod", "expected"),
    [(4, 7, 23, 8), (4, 11, 23, 1), (5, 0, 23, 1), (4, 5, 23, 12), (8, 3, 23, 6)],
)
def test_mod_pow_valores_de_referencia_del_escrito(base, exp, mod, expected):
    assert mod_pow(base, exp, mod) == expected


@pytest.mark.req("R4")
def test_mod_pow_coincide_con_pow_en_1000_casos_aleatorios():
    for _ in range(RANDOM_CASES):
        base = secrets.randbelow(2**OPERAND_BITS)
        exp = secrets.randbelow(2**OPERAND_BITS)
        mod = _random_modulus()
        assert mod_pow(base, exp, mod) == pow(base, exp, mod), (base, exp, mod)


@pytest.mark.req("R4")
def test_mod_pow_reduce_bases_negativas_como_pow():
    assert mod_pow(-3, 3, 7) == pow(-3, 3, 7)


@pytest.mark.req("R4")
@pytest.mark.parametrize(("exp", "mod"), [(-1, 23), (3, 1), (3, 0), (3, -5)])
def test_mod_pow_rechaza_exponente_negativo_o_modulo_menor_que_2(exp, mod):
    with pytest.raises(ValueError):
        mod_pow(4, exp, mod)


@pytest.mark.req("R4")
def test_mod_pow_traza_un_paso_por_bit_del_exponente():
    trace: list[str] = []
    assert mod_pow(4, 7, 23, trace) == 8
    assert trace == [
        "bit 0 = 1   base = 4   acumulador = 4",
        "bit 1 = 1   base = 16   acumulador = 18",
        "bit 2 = 1   base = 3   acumulador = 8",
    ]


# ---------------------------------------------------------- R5: Euclides extendido e inverso

@pytest.mark.req("R5")
def test_extended_gcd_ejemplo_del_escrito():
    assert extended_gcd(6, 23) == (1, 4, -1)  # 4·6 − 1·23 = 1


@pytest.mark.req("R5")
def test_extended_gcd_cumple_identidad_de_bezout_en_casos_aleatorios():
    for _ in range(RANDOM_CASES):
        a = secrets.randbelow(2**OPERAND_BITS)
        b = secrets.randbelow(2**OPERAND_BITS)
        d, u, v = extended_gcd(a, b)
        assert d == sympy.gcd(a, b), (a, b)
        assert u * a + v * b == d, (a, b)


@pytest.mark.req("R5")
@pytest.mark.parametrize(("a", "n", "expected"), [(6, 23, 4), (9, 11, 5), (18, 23, 9), (-2, 11, 5)])
def test_mod_inverse_valores_de_referencia(a, n, expected):
    assert mod_inverse(a, n) == expected


@pytest.mark.req("R5")
def test_mod_inverse_coincide_con_sympy_en_1000_casos_aleatorios():
    checked = 0
    while checked < RANDOM_CASES:
        n = _random_modulus()
        a = secrets.randbelow(n)
        if sympy.gcd(a, n) != 1:
            continue
        inverse = mod_inverse(a, n)
        assert inverse == sympy.mod_inverse(a, n), (a, n)
        assert 1 <= inverse <= n - 1
        checked += 1


@pytest.mark.req("R5")
@pytest.mark.parametrize(("a", "n"), [(4, 22), (0, 23), (23, 23), (3, 1)])
def test_mod_inverse_lanza_error_si_no_existe_inverso(a, n):
    with pytest.raises(ValueError):
        mod_inverse(a, n)


@pytest.mark.req("R5")
def test_mod_inverse_traza_divisiones_y_despeje():
    trace: list[str] = []
    assert mod_inverse(6, 23, trace) == 4
    assert trace == [
        "23 = 3·6 + 5",
        "6 = 1·5 + 1",
        "5 = 5·1 + 0",
        "Despeje: 5 = −3·6 + 1·23",
        "Despeje: 1 = 4·6 − 1·23",
        "⇒ 6^-1 ≡ 4 (mod 23)",
    ]
