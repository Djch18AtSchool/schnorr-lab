"""Pruebas de BSGS y del experimento de la base de datos robada (R10)."""

import csv
import json
import secrets

import pytest

from attacks import bsgs, stolen_db
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


# ------------------------------------------------------------ base de datos robada

@pytest.mark.req("R10")
def test_experimento_guarda_csv_json_y_grafica(tmp_path):
    rows = stolen_db.stolen_db_experiment(bits=[24, 16, 20], results_dir=tmp_path)
    assert [row["q_bits"] for row in rows] == [16, 20, 24]
    assert all(row["p_bits"] == row["q_bits"] + stolen_db.EXTRA_P_BITS for row in rows)
    assert all(row["x_found"] == row["x_real"] for row in rows)
    with (tmp_path / "bsgs.csv").open(encoding="utf-8") as handle:
        assert len(list(csv.DictReader(handle))) == 3
    saved = json.loads((tmp_path / "bsgs.json").read_text(encoding="utf-8"))
    assert [p["q_bits"] for p in saved["predictions"]] == [160, 224, 256]
    assert saved["holdout"]["q_bits"] == 24
    assert (tmp_path / "bsgs.png").stat().st_size > 0


@pytest.mark.req("R10")
def test_prediccion_extrapola_raiz_de_q_en_anios():
    small, large = stolen_db.predict(160, 1e-7), stolen_db.predict(162, 1e-7)
    assert large["operations"] == pytest.approx(2 * small["operations"])  # 2 bits más de q → √q se duplica
    assert small["operations"] == pytest.approx(1.5 * 2**80)
    assert small["years"] == pytest.approx(1e-7 * 1.5 * 2**80 / stolen_db.SECONDS_PER_YEAR)


@pytest.mark.req("R10")
def test_ajustes_de_costo_por_operacion_y_crecimiento():
    rows = [{"q_bits": bits, "operations": 2 ** (bits // 2), "seconds": 3e-7 * 2 ** (bits // 2)}
            for bits in (16, 20, 24)]
    assert stolen_db.fit_seconds_per_operation(rows) == pytest.approx(3e-7)
    assert stolen_db.fit_growth_exponent(rows) == pytest.approx(0.5)
    with pytest.raises(ValueError):
        stolen_db.fit_growth_exponent(rows[:1])


@pytest.mark.req("R10")
def test_experimento_rechaza_q_demasiado_grande():
    with pytest.raises(ValueError, match="demasiado grandes"):
        stolen_db.stolen_db_experiment(bits=[MAX_BSGS_Q_BITS + 4], results_dir=None)


@pytest.mark.req("R10")
def test_run_del_menu_imprime_tabla_y_predicciones(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(stolen_db, "RESULTS_DIR", tmp_path)
    stolen_db.run(bits=[16, 20], verbose=True)
    out = capsys.readouterr().out
    assert "q de 224 bits" in out and "años" in out
