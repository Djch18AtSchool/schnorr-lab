"""Pruebas del ataque de repetición de una prueba no interactiva (R10).

El contrato principal está en test_pending.py; aquí se revisan los motivos de cada rechazo,
un grupo grande y el reporte del menú.
"""

import pytest

from attacks import replay
from core.params import get_group
from protocol.transcript import Reason

pytestmark = pytest.mark.req("R10")


def test_la_victima_entra_en_ambos_bancos_antes_del_ataque():
    result = replay.replay_experiment()
    assert result["original_accepted_without_protection"]
    assert result["original_accepted_with_protection"]


def test_motivos_de_cada_intento_del_espia():
    result = replay.replay_experiment()
    assert result["reason_without_protection"] == Reason.ACCESS_GRANTED
    assert result["reason_with_protection"] == Reason.PROOF_ALREADY_USED
    assert not result["accepted_stale"]
    assert result["reason_stale"] == Reason.TIMESTAMP_OUT_OF_WINDOW


def test_la_repeticion_inmediata_cae_dentro_de_la_ventana():
    # Así se ve que la rechaza el registro de pruebas usadas y no la ventana.
    result = replay.replay_experiment()
    assert result["replay_delay"] <= result["window"] < result["stale_delay"]


def test_la_repeticion_tambien_funciona_sin_proteccion_en_un_grupo_grande():
    result = replay.replay_experiment(get_group("safe-256"))
    assert result["accepted_without_protection"]
    assert not result["accepted_with_protection"]


def test_run_imprime_el_reporte_en_espanol(capsys):
    result = replay.run(verbose=True)
    output = capsys.readouterr().out
    assert "[Repetición de pruebas]" in output
    assert Reason.PROOF_ALREADY_USED in output and Reason.TIMESTAMP_OUT_OF_WINDOW in output
    assert not result["accepted_with_protection"]
