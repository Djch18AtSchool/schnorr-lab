"""Pruebas de los parámetros públicos (p, q, g): generación y validación (R1, R7)."""

import json

import mpmath
import pytest
import sympy

from core import params
from core.modular import mod_pow
from core.params import (
    SCHNORR_GROUP_SIZES,
    TOY_GROUP,
    GroupParams,
    generator_for,
    get_group,
    in_subgroup,
    load_rfc_group,
    safe_prime_group,
    schnorr_group,
    validate_params,
)
from core.rfc3526 import modp_prime

TOY_SUBGROUP = {4, 16, 18, 3, 12, 2, 8, 9, 13, 6, 1}  # potencias de 4 en Z23* (definición 7)
# Fórmula de cada sección del RFC 3526: p = 2^k − 2^(k − 64) − 1 + 2^64·(⌊2^e·π⌋ + desplazamiento)
RFC_PI_FORMULA = {2048: (1918, 124476), 3072: (2942, 1690314)}
PI_PRECISION_BITS = 3200


# --------------------------------------------------------------------- R1: validación

@pytest.mark.req("R1")
def test_grupo_de_ejemplo_23_11_4_es_valido():
    assert validate_params(TOY_GROUP) == []
    assert TOY_GROUP.bits == 5  # k = 5 porque 2^4 < 23 <= 2^5
    assert TOY_GROUP.is_safe_prime


@pytest.mark.req("R1")
@pytest.mark.parametrize(
    ("p", "q", "g"),
    [(23, 11, 1), (21, 10, 4), (23, 11, 5), (23, 7, 4), (23, 11, 23), (24, 11, 4)],
)
def test_parametros_incorrectos_se_rechazan(p, q, g):
    assert validate_params(GroupParams(p, q, g, "invalido")) != []


@pytest.mark.req("R1")
def test_validacion_explica_cada_falla_en_espanol():
    failures = validate_params(GroupParams(21, 10, 4, "invalido"))
    assert "p no es primo" in failures
    assert "q no es primo" in failures
    assert "g^q no es congruente con 1 (mod p)" in failures


@pytest.mark.req("R1")
def test_exige_p_igual_a_2q_mas_1_salvo_que_se_indique_lo_contrario():
    schnorr_like = GroupParams(p=67, q=11, g=generator_for(67, 11), name="schnorr-like")  # 67 = 6·11 + 1
    assert "p ≠ 2q + 1: p no es un primo seguro" in validate_params(schnorr_like)
    assert validate_params(schnorr_like, require_safe_prime=False) == []


@pytest.mark.req("R1")
def test_generador_se_obtiene_como_h_al_cuadrado_en_un_primo_seguro():
    assert generator_for(23, 11) == 4  # h = 2 → g = 2² = 4


@pytest.mark.req("R1")
def test_generador_exige_que_q_divida_a_p_menos_1():
    with pytest.raises(ValueError):
        generator_for(23, 5)


@pytest.mark.req("R1")
def test_pertenencia_al_subgrupo_de_orden_q():
    members = {u for u in range(-2, 30) if in_subgroup(u, TOY_GROUP)}
    assert members == TOY_SUBGROUP


@pytest.mark.req("R1")
@pytest.mark.parametrize("bits", [5, 16, 32, 64, 128])
def test_primos_seguros_pequenos_son_validos(bits):
    group = safe_prime_group(bits)
    assert validate_params(group) == []
    assert group.p.bit_length() == bits
    assert group.p == 2 * group.q + 1
    assert sympy.isprime(group.p) and sympy.isprime(group.q)


@pytest.mark.req("R1")
def test_primo_seguro_rechaza_tamanos_demasiado_pequenos():
    with pytest.raises(ValueError):
        safe_prime_group(4)


@pytest.mark.req("R1")
def test_get_group_devuelve_el_ejemplo_y_rechaza_nombres_desconocidos():
    assert get_group("toy") == TOY_GROUP
    with pytest.raises(ValueError, match="Grupo desconocido"):
        get_group("safe-999")


@pytest.mark.req("R1")
def test_get_group_rechaza_un_grupo_alterado_en_el_archivo(tmp_path):
    cache = tmp_path / "groups.json"
    cache.write_text(json.dumps({"safe-256": {"p": "23", "q": "11", "g": "1"}}), encoding="utf-8")
    with pytest.raises(ValueError, match="no es válido"):
        get_group("safe-256", cache_path=cache)


@pytest.mark.req("R1")
def test_get_group_rechaza_un_archivo_mal_formado(tmp_path):
    cache = tmp_path / "groups.json"
    cache.write_text(json.dumps({"safe-256": {"p": "no-es-numero"}}), encoding="utf-8")
    with pytest.raises(ValueError, match="groups.json"):
        get_group("safe-256", cache_path=cache)


@pytest.mark.req("R1")
def test_get_group_genera_y_guarda_si_falta_en_el_archivo(tmp_path):
    cache = tmp_path / "groups.json"
    group = get_group("safe-256", cache_path=cache)
    stored = json.loads(cache.read_text(encoding="utf-8"))["safe-256"]
    assert int(stored["p"]) == group.p
    assert get_group("safe-256", cache_path=cache) == group


# ----------------------------------------------------------- R7: tamaños de p disponibles

@pytest.mark.req("R7")
@pytest.mark.parametrize("name", ["safe-256", "safe-512", "safe-1024"])
def test_grupos_seguros_del_repositorio_son_validos(name):
    group = get_group(name)
    bits = int(name.split("-")[1])
    assert group.bits == bits
    assert group.is_safe_prime


@pytest.mark.req("R7")
@pytest.mark.parametrize("name", ["rfc-2048", "rfc-3072", "schnorr-2048", "schnorr-3072"])
def test_grupos_rfc_y_de_schnorr_son_validos(name):
    assert validate_params(get_group(name), require_safe_prime=name.startswith("rfc")) == []


# ------------------------------------------------------------- R7: grupos del RFC 3526

@pytest.mark.req("R7")
@pytest.mark.parametrize("bits", [2048, 3072])
def test_grupo_rfc_tiene_el_tamano_y_es_primo_seguro_con_g_2(bits):
    group = load_rfc_group(bits)
    assert group.bits == bits
    assert group.g == 2 and group.q == (group.p - 1) // 2
    assert sympy.isprime(group.p) and sympy.isprime(group.q)
    assert mod_pow(2, group.q, group.p) == 1


@pytest.mark.req("R7")
@pytest.mark.parametrize("bits", [2048, 3072])
def test_hexadecimal_del_rfc_coincide_con_su_formula_de_pi(bits):
    exponent, offset = RFC_PI_FORMULA[bits]
    with mpmath.workprec(PI_PRECISION_BITS):
        pi_part = int(mpmath.floor(mpmath.ldexp(mpmath.pi, exponent)))
    assert modp_prime(bits) == 2**bits - 2 ** (bits - 64) - 1 + 2**64 * (pi_part + offset)


@pytest.mark.req("R7")
def test_get_group_rfc_usa_el_rfc_y_rechaza_otros_tamanos():
    assert get_group("rfc-2048") == load_rfc_group(2048)
    assert get_group("rfc-2048").name == "rfc3526-2048"
    with pytest.raises(ValueError, match="RFC 3526"):
        load_rfc_group(4096)


# ------------------------------------------------------------- R7: grupos de Schnorr

@pytest.mark.req("R7")
@pytest.mark.parametrize(("p_bits", "q_bits"), [(18, 16), (64, 32), (512, 160)])
def test_grupo_de_schnorr_tiene_los_tamanos_pedidos_y_es_valido(p_bits, q_bits):
    group = schnorr_group(p_bits, q_bits)
    assert group.bits == p_bits and group.q.bit_length() == q_bits
    assert ((group.p - 1) // group.q) % 2 == 0  # j par
    assert not group.is_safe_prime
    assert validate_params(group, require_safe_prime=False) == []


@pytest.mark.req("R7")
@pytest.mark.parametrize(("p_bits", "q_bits"), [(17, 16), (16, 16), (10, 1)])
def test_grupo_de_schnorr_rechaza_tamanos_imposibles(p_bits, q_bits):
    with pytest.raises(ValueError):
        schnorr_group(p_bits, q_bits)


@pytest.mark.req("R7")
@pytest.mark.parametrize("name", list(SCHNORR_GROUP_SIZES))
def test_grupos_de_schnorr_del_repositorio_tienen_q_de_224_y_256_bits(name):
    group = get_group(name)
    p_bits, q_bits = SCHNORR_GROUP_SIZES[name]
    assert (group.bits, group.q.bit_length()) == (p_bits, q_bits)
    assert group.name == name


@pytest.mark.req("R7")
def test_get_group_genera_y_guarda_un_grupo_de_schnorr_si_falta(tmp_path, monkeypatch):
    monkeypatch.setitem(SCHNORR_GROUP_SIZES, "schnorr-2048", (64, 32))  # tamaño pequeño para la prueba
    cache = tmp_path / "groups.json"
    group = get_group("schnorr-2048", cache_path=cache)
    stored = json.loads(cache.read_text(encoding="utf-8"))["schnorr-2048"]
    assert (int(stored["p"]), int(stored["q"]), int(stored["g"])) == (group.p, group.q, group.g)
    assert get_group("schnorr-2048", cache_path=cache) == group


@pytest.mark.req("R7")
def test_generate_acepta_tamanos_y_nombres_de_grupos(monkeypatch, capsys):
    requested: list[str] = []

    def fake_get_group(name: str) -> GroupParams:
        requested.append(name)
        return TOY_GROUP

    monkeypatch.setattr(params, "get_group", fake_get_group)
    assert params.main(["--generate", "256", "schnorr-2048"]) == 0
    assert requested == ["safe-256", "schnorr-2048"]
    assert "p de 5 bits" in capsys.readouterr().out
