"""Pruebas de los experimentos que se guardan en results/experimentos.json (R3–R5, R8, R10)."""

import pytest

from benchmark import experiments


@pytest.mark.req("R10")
def test_simulador_tiene_la_misma_distribucion_por_t():
    result = experiments.simulator_experiment()
    assert result["identical"] and result["all_simulated_verify"]
    assert all(row["real"] == row["simulated"] for row in result["by_t"])
    assert sum(row["real"] for row in result["by_t"]) == 110


@pytest.mark.req("R10")
def test_r_repetido_recupera_x_en_el_ejemplo_y_al_azar():
    result = experiments.nonce_reuse_experiment()
    assert result["example"]["x_extracted"] == 7
    assert result["random"]["recovered"] >= result["random"]["trials"] - 2   # salvo retos iguales


@pytest.mark.req("R8")
def test_repeticion_se_acepta_sin_proteccion_y_se_rechaza_con_ella():
    result = experiments.replay_experiment()
    assert result["accepted_without_protection"] and not result["accepted_with_protection"]
    assert not result["accepted_stale"]


@pytest.mark.req("R10")
def test_convergencia_del_impostor_tiene_los_puntos_de_control(monkeypatch):
    monkeypatch.setattr(experiments, "CHECKPOINTS", (10, 100))
    points = experiments._impostor_convergence(experiments.TOY_GROUP, 100)
    assert [p["n"] for p in points] == [10, 100] and all(0 <= p["rate"] <= 1 for p in points)
