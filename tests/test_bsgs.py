"""Pruebas de BSGS: costo del logaritmo discreto con la base de datos robada (R10)."""

import secrets

import pytest

from attacks import bsgs
from attacks.bsgs import MAX_BSGS_Q_BITS, ceil_sqrt
from core.modular import mod_pow
from core.params import TOY_GROUP, get_group, safe_prime_group, schnorr_group

RANDOM_LOGS = 50


@pytest.mark.req("R10")
@pytest.mark.parametrize(("q", "m"), [(1, 1), (4, 2), (5, 3), (11, 4), (16, 4), (17, 5), (2**40, 2**20)])
def test_m_es_el_techo_de_la_raiz_de_q(q, m):
    assert ceil_sqrt(q) == m


@pytest.mark.req("R10")
def test_bsgs_cuenta_4_pasos_de_bebe_y_2_de_gigante_en_el_ejemplo():
    trace: list[str] = []
    assert bsgs.bsgs(g=4, y=8, p=23, q=11, trace=trace) == (7, 6)
    assert sum(line.startswith("bebé") for line in trace) == 4
    assert sum(line.startswith("gigante") for line in trace) == 2


@pytest.mark.req("R10")
def test_bsgs_recupera_todos_los_logaritmos_del_grupo_de_ejemplo():
    for x in range(TOY_GROUP.q):
        y = mod_pow(TOY_GROUP.g, x, TOY_GROUP.p)
        found, operations = bsgs.bsgs(TOY_GROUP.g, y, TOY_GROUP.p, TOY_GROUP.q)
        assert found == x
        assert operations <= 2 * ceil_sqrt(TOY_GROUP.q)


@pytest.mark.req("R10")
@pytest.mark.parametrize("group", [safe_prime_group(32), schnorr_group(64, 28)], ids=["seguro-32", "schnorr-64-28"])
def test_bsgs_recupera_x_aleatorias(group):
    for _ in range(RANDOM_LOGS):
        x = secrets.randbelow(group.q)
        found, _ = bsgs.bsgs(group.g, mod_pow(group.g, x, group.p), group.p, group.q)
        assert found == x


@pytest.mark.req("R10")
def test_bsgs_sin_solucion_lanza_error():
    with pytest.raises(ValueError, match="no pertenece al subgrupo"):
        bsgs.bsgs(g=4, y=5, p=23, q=11)  # 5 no es potencia de 4 módulo 23


@pytest.mark.req("R10")
def test_run_roba_y_del_banco_y_recupera_x_7(capsys):
    result = bsgs.run(verbose=True)
    assert (result["y"], result["m"], result["x_found"], result["operations"]) == (8, 4, 7, 6)
    assert result["recovered"] and result["seconds"] >= 0
    out = capsys.readouterr().out
    assert "m = ⌈√q⌉ = 4" in out and "x = 1·4 + 3 = 7" in out


@pytest.mark.req("R10")
def test_run_con_q_grande_explica_que_es_inviable():
    assert get_group("safe-256").q.bit_length() > MAX_BSGS_Q_BITS
    with pytest.raises(ValueError, match="inviable"):
        bsgs.run(get_group("safe-256"))
