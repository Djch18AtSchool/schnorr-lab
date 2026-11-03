"""Pruebas del laboratorio de ataques controlados (R10)."""

from collections import Counter

import pytest

from attacks import impostor, nonce_reuse, simulator
from attacks.nonce_reuse import FaultyClient, extract_secret
from attacks.simulator import enumerate_real, enumerate_simulated, simulate
from core.params import TOY_GROUP, get_group
from protocol.bank import Bank
from protocol.transcript import Transcript

IMPOSTOR_TRIALS = 100_000
MAX_DIFFERENCE_POINTS = 1.0
TOY_REAL_TRANSCRIPTS = TOY_GROUP.q * (TOY_GROUP.q - 1)  # r ∈ [1, q − 1] y c ∈ [0, q − 1]: 110


# ------------------------------------------------------------------ reutilización de r

@pytest.mark.req("R10")
def test_reutilizar_r_permite_recuperar_x_7():
    result = nonce_reuse.run()
    assert (result["t"], result["c1"], result["s1"], result["c2"], result["s2"]) == (12, 3, 4, 5, 7)
    assert result["both_accepted"]
    assert result["x_extracted"] == result["x_real"] == 7


@pytest.mark.req("R10")
def test_extraccion_con_formula_del_escrito():
    assert extract_secret(TOY_GROUP, c1=3, s1=4, c2=5, s2=7) == 7  # (4 − 7)·(3 − 5)^-1 mod 11


@pytest.mark.req("R10")
def test_extraccion_exige_retos_distintos():
    with pytest.raises(ValueError):
        extract_secret(TOY_GROUP, c1=3, s1=4, c2=3, s2=4)


@pytest.mark.req("R10")
def test_reutilizar_r_tambien_rompe_un_grupo_grande():
    result = nonce_reuse.run(get_group("safe-256"))
    assert result["both_accepted"] and result["recovered"]


@pytest.mark.req("R10")
def test_cliente_defectuoso_repite_el_compromiso():
    client = FaultyClient("victima", TOY_GROUP, x=7)
    first = client.commit(r=5)
    client.respond(3)
    assert client.commit() == first


# ---------------------------------------------------------------- simulador (ZK honesto)

@pytest.mark.req("R10")
def test_simulador_ejemplo_c_2_s_9_da_t_2():
    assert simulate(TOY_GROUP, y=8, c=2, s=9) == 2


@pytest.mark.req("R10")
def test_transcripciones_reales_y_simuladas_tienen_la_misma_distribucion():
    real = enumerate_real(TOY_GROUP, x=7)
    simulated = enumerate_simulated(TOY_GROUP, y=8)  # el simulador no recibe x
    assert real == simulated
    assert len(real) == TOY_REAL_TRANSCRIPTS
    assert set(real.values()) == {1}


@pytest.mark.req("R10")
def test_transcripciones_simuladas_cumplen_la_verificacion_del_banco():
    bank = Bank(TOY_GROUP)
    bank.register("victima", 8)
    for transcript in enumerate_simulated(TOY_GROUP, y=8):
        session_id, _ = bank.challenge("victima", transcript.t, c=transcript.c)
        assert bank.verify(session_id, transcript.s).accepted, transcript


@pytest.mark.req("R10")
def test_simulador_no_genera_t_igual_a_1():
    assert all(t.t != 1 for t in enumerate_simulated(TOY_GROUP, y=8))
    assert all(simulator.simulate_random(TOY_GROUP, y=8).t != 1 for _ in range(200))


@pytest.mark.req("R10")
def test_enumeracion_se_niega_con_q_mayor_que_2_a_la_12():
    gp = get_group("safe-256")
    with pytest.raises(ValueError):
        enumerate_real(gp, x=7)
    with pytest.raises(ValueError):
        enumerate_simulated(gp, y=gp.g)


@pytest.mark.req("R10")
def test_run_del_simulador_resume_la_comparacion():
    result = simulator.run()
    assert result["identical"] and result["all_simulated_verify"]
    assert result["real"] == result["simulated"] == TOY_REAL_TRANSCRIPTS
    assert result["example"] == Transcript(t=2, c=2, s=9)
    assert isinstance(enumerate_real(TOY_GROUP, 7), Counter)


# ------------------------------------------------------------------------- impostor

@pytest.mark.req("R10")
def test_tasa_del_impostor_se_acerca_a_1_entre_q():
    rate = impostor.impostor_rate(TOY_GROUP, IMPOSTOR_TRIALS)
    difference_points = abs(rate - 1 / TOY_GROUP.q) * 100
    assert difference_points < MAX_DIFFERENCE_POINTS, f"tasa {rate:.4%} frente a 9.09 %"


@pytest.mark.req("R10")
def test_impostor_no_gana_con_q_grande():
    result = impostor.run(get_group("safe-256"), trials=300)
    assert result["wins"] == 0


@pytest.mark.req("R10")
def test_impostor_reporta_la_probabilidad_antes_del_bloqueo():
    result = impostor.run(trials=1000)
    assert result["expected"] == pytest.approx(1 / 11)
    assert result["before_lockout"] == pytest.approx(1 - (10 / 11) ** 3)
