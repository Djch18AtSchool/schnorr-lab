"""Pruebas de los parámetros públicos (p, q, g): generación y validación (R1, R7)."""

import json

import pytest
import sympy

from core.params import (
    TOY_GROUP,
    GroupParams,
    generator_for,
    get_group,
    in_subgroup,
    safe_prime_group,
    validate_params,
)

TOY_SUBGROUP = {4, 16, 18, 3, 12, 2, 8, 9, 13, 6, 1}  # potencias de 4 en Z23* (definición 7)
PENDING_FINAL = pytest.mark.xfail(
    raises=NotImplementedError, strict=True, reason="Esqueleto: disponible en el informe final"
)


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
@pytest.mark.slow
@PENDING_FINAL
@pytest.mark.parametrize("name", ["rfc-2048", "rfc-3072", "schnorr-2048", "schnorr-3072"])
def test_grupos_rfc_y_de_schnorr_son_validos(name):
    assert validate_params(get_group(name), require_safe_prime=name.startswith("rfc")) == []
