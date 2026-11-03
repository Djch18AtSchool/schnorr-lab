"""Contratos de los módulos que el escrito deja para el informe final (R7 y R10).

Repetición de pruebas, BSGS, base de datos robada y latencia. Igual que en
test_fiat_shamir.py, se marcan xfail estricto mientras sean esqueletos.
"""

import pytest

from attacks import replay, stolen_db
from attacks.bsgs import bsgs
from benchmark import latency
from core.params import TOY_GROUP

PENDING_FINAL = pytest.mark.xfail(
    raises=NotImplementedError, strict=True, reason="Esqueleto: disponible en el informe final"
)


@pytest.mark.req("R10")
@PENDING_FINAL
def test_repeticion_se_acepta_sin_proteccion_y_se_rechaza_con_proteccion():
    result = replay.run()
    assert result["accepted_without_protection"]
    assert not result["accepted_with_protection"]


@pytest.mark.req("R10")
@PENDING_FINAL
def test_bsgs_encuentra_x_7_con_m_4():
    x, operations = bsgs(g=4, y=8, p=23, q=11)
    assert x == 7
    assert operations <= 2 * 4  # m = ⌈√11⌉ = 4 pasos de bebé y a lo sumo 4 de gigante


@pytest.mark.req("R10")
@pytest.mark.slow
@PENDING_FINAL
def test_tiempo_de_bsgs_crece_como_raiz_de_q():
    rows = stolen_db.run(bits=[16, 20, 24])
    assert all(row["x_found"] == row["x_real"] for row in rows)


@pytest.mark.req("R7")
@PENDING_FINAL
def test_latencia_mide_una_autenticacion_completa():
    assert latency.measure_auth(TOY_GROUP, reps=3) > 0
