"""Pruebas de la variante no interactiva con Fiat-Shamir (R8).

Son el contrato para el informe final: mientras protocol/fiat_shamir.py sea un esqueleto,
se marcan xfail (estricto), así que pasarán a fallar como XPASS cuando se implemente y
habrá que quitar la marca.
"""

import pytest

from core.params import TOY_GROUP, get_group
from protocol.fiat_shamir import DEFAULT_WINDOW_SECONDS, hash_challenge, prove, verify_nizk
from tests.helpers import registrar

NOW = 1_700_000_000
PENDING_FINAL = pytest.mark.xfail(
    raises=NotImplementedError, strict=True, reason="Esqueleto: disponible en el informe final"
)
pytestmark = [pytest.mark.req("R8"), PENDING_FINAL]


def test_reto_hash_es_deterministico_y_menor_que_q():
    gp = get_group("safe-256")
    first = hash_challenge(gp, y=gp.g, t=gp.g, user_id="cliente01", m=NOW)
    assert first == hash_challenge(gp, y=gp.g, t=gp.g, user_id="cliente01", m=NOW)
    assert 0 <= first < gp.q
    assert first != hash_challenge(gp, y=gp.g, t=gp.g, user_id="cliente01", m=NOW + 1)


def test_prueba_no_interactiva_valida_es_aceptada():
    bank, client = registrar(TOY_GROUP, x=7)
    assert verify_nizk(bank, prove(client, m=NOW), now=NOW).accepted


def test_prueba_repetida_es_rechazada():
    bank, client = registrar(TOY_GROUP, x=7)
    proof = prove(client, m=NOW)
    assert verify_nizk(bank, proof, now=NOW).accepted
    assert not verify_nizk(bank, proof, now=NOW + 1).accepted


def test_prueba_con_m_fuera_de_la_ventana_es_rechazada():
    bank, client = registrar(TOY_GROUP, x=7)
    proof = prove(client, m=NOW)
    assert not verify_nizk(bank, proof, now=NOW + DEFAULT_WINDOW_SECONDS + 1).accepted


def test_sin_proteccion_la_misma_prueba_se_acepta_dos_veces():
    bank, client = registrar(TOY_GROUP, x=7)
    proof = prove(client, m=None)
    assert verify_nizk(bank, proof, protect=False).accepted
    assert verify_nizk(bank, proof, protect=False).accepted
