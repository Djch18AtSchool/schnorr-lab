"""Pruebas del experimento de comparación de mecanismos (C5)."""

import csv
import json

import pytest

import demo
from benchmark import compare
from benchmark.compare_harness import SCENARIOS, SCENARIOS_BY_KEY

FIGURES = ("comparacion_latencia.png", "comparacion_red.png", "comparacion_base_robada.png")
LOGIN_ROUND_TRIPS = {"password": 1, "totp": 1, "srp": 3, "zkp-rfc-2048": 3, "zkp-schnorr-2048": 3,
                     "zkp-nizk-schnorr-2048": 2}


@pytest.fixture(scope="module")
def measured(tmp_path_factory) -> tuple[dict, object]:
    results_dir = tmp_path_factory.mktemp("comparacion")
    result = compare.run(reps=1, guesses=2, results_dir=results_dir)
    compare.plot(result, results_dir)
    return result, results_dir


def _rows(result: dict) -> dict[str, dict]:
    return {row["key"]: row for row in result["rows"]}


@pytest.mark.req("C5")
def test_guarda_json_csv_y_tres_graficas(measured):
    result, results_dir = measured
    assert [row["key"] for row in result["rows"]] == [scenario.key for scenario in SCENARIOS]
    saved = json.loads((results_dir / "comparacion.json").read_text(encoding="utf-8"))
    assert saved["backend"] == "propia" and set(saved["qualitative"]) == {"password", "totp", "srp", "zkp"}
    with (results_dir / "comparacion.csv").open(encoding="utf-8") as handle:
        assert len(list(csv.DictReader(handle))) == len(SCENARIOS)
    assert all((results_dir / name).stat().st_size > 0 for name in FIGURES)


@pytest.mark.req("C5")
def test_idas_y_vueltas_y_bytes_por_inicio_de_sesion(measured):
    rows = _rows(measured[0])
    assert {key: row["login_network"]["round_trips"] for key, row in rows.items()} == LOGIN_ROUND_TRIPS
    assert all(row["login_network"]["sent_bytes"] > 0 and row["login_ms"] > 0 for row in rows.values())


@pytest.mark.req("C5")
def test_solo_contrasena_y_totp_envian_el_secreto(measured):
    rows = _rows(measured[0])
    travels = {key: any(row["secrets_on_wire"]["login"].values()) for key, row in rows.items()}
    assert travels == {"password": True, "totp": True, "srp": False, "zkp-rfc-2048": False,
                       "zkp-schnorr-2048": False, "zkp-nizk-schnorr-2048": False}
    totp = rows["totp"]["secrets_on_wire"]
    assert totp["register"]["secreto TOTP K"] is True and totp["login"]["secreto TOTP K"] is False


@pytest.mark.req("C5")
def test_lo_que_guarda_el_banco_por_mecanismo(measured):
    rows = _rows(measured[0])
    assert rows["password"]["stored"]["fields"] == ["hash"]
    assert "totp_secret" in rows["totp"]["stored"]["fields"]
    assert rows["srp"]["stored"]["fields"] == ["salt", "v"]
    assert rows["zkp-rfc-2048"]["stored"]["fields"] == ["y"]


@pytest.mark.req("C5")
def test_solo_la_contrasena_acepta_la_repeticion(measured):
    rows = _rows(measured[0])
    assert {key: row["replay"]["accepted"] for key, row in rows.items()} == {
        key: key == "password" for key in LOGIN_ROUND_TRIPS}


@pytest.mark.req("C5")
def test_base_robada_argon2id_cuesta_mas_por_intento_que_el_verificador_srp(measured):
    rows, stolen = _rows(measured[0]), measured[0]["stolen_database"]
    assert stolen["password"]["seconds_per_guess"] > stolen["srp"]["propia"]["seconds_per_guess"]
    assert rows["zkp-schnorr-2048"]["offline_dictionary_log10_years"] is None
    assert rows["zkp-schnorr-2048"]["offline_random8_log10_years"] > rows["password"]["offline_random8_log10_years"]


@pytest.mark.req("C5")
def test_tabla_de_texto_y_errores_de_uso(measured):
    lines = compare.format_table(measured[0])
    assert any("SRP-6a" in line for line in lines) and "¿replay?" in lines[0]
    with pytest.raises(ValueError):
        compare.measure_scenario(SCENARIOS_BY_KEY["password"], reps=0)


@pytest.mark.req("C5")
def test_cli_mide_un_escenario_y_guarda_resultados(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(compare, "RESULTS_DIR", tmp_path)
    assert compare.main(["--scenarios", "password", "--reps", "1", "--guesses", "2"]) == 0
    assert "Contraseña (Argon2id)" in capsys.readouterr().out
    assert (tmp_path / "comparacion.json").exists()


@pytest.mark.req("C5")
def test_opcion_8_del_menu_muestra_la_comparacion(measured, monkeypatch, capsys):
    _, results_dir = measured
    monkeypatch.setattr(demo, "COMPARISON_RESULTS", results_dir / "comparacion.json")
    assert demo.main(["--option", "8"]) == 0
    assert "SRP-6a" in capsys.readouterr().out
    monkeypatch.setattr(demo, "COMPARISON_RESULTS", results_dir / "no-existe.json")
    assert demo.main(["--option", "8"]) == 0
    assert "python -m benchmark.compare" in capsys.readouterr().out
