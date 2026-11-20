"""Pruebas de la variante no interactiva con Fiat-Shamir (R8).

Las cinco primeras son el contrato del segundo avance (Tabla 7: «Una prueba válida se acepta;
repetida o con m vieja se rechaza»). Las demás cubren la codificación canónica del hash, los
rechazos de una prueba alterada y la API pública que el banco ofrece a la variante no interactiva.
"""

import hashlib
from dataclasses import replace

import pytest

from core.params import TOY_GROUP, get_group
from protocol.bank import Bank
from protocol.client import Client
from protocol.fiat_shamir import (
    DEFAULT_WINDOW_SECONDS,
    NizkProof,
    encode_challenge_input,
    hash_challenge,
    prove,
    verify_nizk,
)
from protocol.transcript import Reason, Transcript
from tests.helpers import USER_ID, registrar

NOW = 1_700_000_000
TIMESTAMP_BYTES = 8
EXAMPLE_DETAILS = {"gs": 3, "yc": 6, "tyc": 3, "yc_inv": 4, "t_rec": 12}
pytestmark = pytest.mark.req("R8")


def _forged(proof: NizkProof) -> NizkProof:
    """Misma prueba con s alterado: g^(s+1) = g·g^s ≠ t·y^c porque g ≠ 1."""
    return replace(proof, s=(proof.s + 1) % TOY_GROUP.q)


# ------------------------------------------------------------- contrato (Tabla 7)

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


# ------------------------------------------------------- hash: codificación canónica

def test_codificacion_canonica_con_p_23_reconstruida_byte_a_byte():
    # L = ⌈5/8⌉ = 1 byte por entero: p = 23, g = 4, y = 8, t = 12; luego len(id) en 4 bytes, id y m.
    expected = bytes([23, 4, 8, 12]) + (9).to_bytes(4, "big") + b"cliente01" + NOW.to_bytes(8, "big")
    assert encode_challenge_input(TOY_GROUP, y=8, t=12, user_id="cliente01", m=NOW) == expected
    digest = int.from_bytes(hashlib.sha256(expected).digest(), "big")
    assert hash_challenge(TOY_GROUP, y=8, t=12, user_id="cliente01", m=NOW) == digest % TOY_GROUP.q


def test_enteros_con_longitud_fija_de_p():
    gp = get_group("safe-256")
    length = (gp.bits + 7) // 8
    data = encode_challenge_input(gp, y=gp.g, t=gp.g, user_id="a", m=None)
    assert len(data) == 4 * length + 4 + 1
    assert data[:length] == gp.p.to_bytes(length, "big")


def test_m_none_se_omite_de_la_codificacion():
    with_m = encode_challenge_input(TOY_GROUP, y=8, t=12, user_id=USER_ID, m=NOW)
    without_m = encode_challenge_input(TOY_GROUP, y=8, t=12, user_id=USER_ID, m=None)
    assert with_m == without_m + NOW.to_bytes(TIMESTAMP_BYTES, "big")


def test_cambiar_cualquier_dato_cambia_el_reto():
    gp = get_group("safe-256")  # q de 255 bits: una coincidencia por azar es despreciable
    base = {"y": gp.g, "t": pow(gp.g, 2, gp.p), "user_id": USER_ID, "m": NOW}
    other_element = pow(gp.g, 3, gp.p)
    variants = [{"user_id": "cliente02"}, {"m": NOW + 1}, {"m": None}, {"t": other_element}, {"y": other_element}]
    reference = hash_challenge(gp, **base)
    assert all(hash_challenge(gp, **(base | change)) != reference for change in variants)


def test_el_prefijo_de_longitud_evita_confundir_el_id_con_m():
    # Sin el prefijo, ("abcdefghij", sin m) y ("ab", m = bytes de "cdefghij") darían los mismos bytes.
    m = int.from_bytes(b"cdefghij", "big")
    first = encode_challenge_input(TOY_GROUP, y=8, t=12, user_id="abcdefghij", m=None)
    second = encode_challenge_input(TOY_GROUP, y=8, t=12, user_id="ab", m=m)
    assert len(first) == len(second) and first != second


@pytest.mark.parametrize(
    "bad",
    [{"y": 0}, {"y": 23}, {"t": 0}, {"t": 23}, {"t": -4}, {"m": -1}, {"m": 2**64}],
    ids=["y=0", "y=p", "t=0", "t=p", "t<0", "m<0", "m=2^64"],
)
def test_hash_rechaza_entradas_fuera_de_rango(bad):
    values = {"y": 8, "t": 12, "user_id": USER_ID, "m": NOW} | bad
    with pytest.raises(ValueError):
        hash_challenge(TOY_GROUP, **values)


# ------------------------------------------------------------ prove y verify_nizk

def test_la_prueba_solo_lleva_datos_publicos_y_el_reto_es_el_hash():
    bank, client = registrar(TOY_GROUP, x=7)
    proof = prove(client, m=NOW)
    assert (proof.user_id, proof.m) == (USER_ID, NOW)
    result = verify_nizk(bank, proof, now=NOW)
    expected_c = hash_challenge(TOY_GROUP, client.y, proof.t, USER_ID, NOW)
    assert result.transcript == Transcript(t=proof.t, c=expected_c, s=proof.s)


@pytest.mark.parametrize("name", ["toy", "safe-512"])
def test_prueba_valida_aceptada_y_registrada(name):
    bank, client = registrar(get_group(name))
    proof = prove(client, m=NOW)
    result = verify_nizk(bank, proof, now=NOW)
    assert result.accepted and result.reason == Reason.ACCESS_GRANTED
    assert bank.is_proof_used(proof.t, proof.s)


def test_motivos_de_rechazo_por_frescura():
    bank, client = registrar(TOY_GROUP, x=7)
    proof = prove(client, m=NOW)
    late = NOW + DEFAULT_WINDOW_SECONDS + 1
    assert verify_nizk(bank, proof, now=late).reason == Reason.TIMESTAMP_OUT_OF_WINDOW
    assert verify_nizk(bank, proof, now=NOW - DEFAULT_WINDOW_SECONDS - 1).reason == Reason.TIMESTAMP_OUT_OF_WINDOW
    assert verify_nizk(bank, proof, now=NOW + DEFAULT_WINDOW_SECONDS).accepted  # el borde aún vale
    assert verify_nizk(bank, proof, now=NOW).reason == Reason.PROOF_ALREADY_USED


def test_con_proteccion_se_exige_la_marca_de_tiempo():
    bank, client = registrar(TOY_GROUP, x=7)
    result = verify_nizk(bank, prove(client, m=None), now=NOW)
    assert not result.accepted and result.reason == Reason.MISSING_TIMESTAMP


def test_los_rechazos_por_frescura_no_cuentan_como_fallos():
    # Igual que una sesión ya usada en el modo interactivo: reenviar una prueba no bloquea a la víctima.
    bank, client = registrar(TOY_GROUP, x=7)
    proof = prove(client, m=NOW)
    assert verify_nizk(bank, proof, now=NOW).accepted
    for _ in range(bank.max_attempts + 1):
        assert verify_nizk(bank, proof, now=NOW).reason == Reason.PROOF_ALREADY_USED
    assert bank.attempts_left(USER_ID) == bank.max_attempts


def test_prueba_con_s_alterado_es_rechazada_y_no_se_registra():
    bank, client = registrar(TOY_GROUP, x=7)
    forged = _forged(prove(client, m=NOW))
    result = verify_nizk(bank, forged, now=NOW)
    assert not result.accepted and result.reason == Reason.CONGRUENCE_FAILED
    assert result.attempts_left == bank.max_attempts - 1
    assert not bank.is_proof_used(forged.t, forged.s)


def test_prueba_presentada_con_otro_usuario_es_rechazada():
    gp = get_group("safe-256")  # con q = 11 la coincidencia por azar sería 1/11
    bank, alice = registrar(gp, user_id="alicia")
    bob = Client("roberto", gp)
    bank.register(*bob.register_payload())
    stolen = replace(prove(alice, m=NOW), user_id="roberto")
    assert verify_nizk(bank, stolen, now=NOW).reason == Reason.CONGRUENCE_FAILED


def test_prueba_de_usuario_no_registrado_es_rechazada():
    _, client = registrar(TOY_GROUP, x=7)
    result = verify_nizk(Bank(TOY_GROUP), prove(client, m=NOW), now=NOW)
    assert not result.accepted and result.reason == Reason.USER_NOT_FOUND


@pytest.mark.parametrize("t", [5, 0, 23, -4])
def test_t_fuera_del_subgrupo_es_rechazado_y_cuenta_un_fallo(t):
    bank, _ = registrar(TOY_GROUP, x=7)
    result = verify_nizk(bank, NizkProof(USER_ID, t=t, s=4, m=NOW), now=NOW)
    assert not result.accepted and result.reason == Reason.T_NOT_IN_SUBGROUP
    assert result.attempts_left == bank.max_attempts - 1


@pytest.mark.parametrize("s", [11, -1])
def test_s_fuera_de_rango_es_rechazado(s):
    bank, _ = registrar(TOY_GROUP, x=7)
    result = verify_nizk(bank, NizkProof(USER_ID, t=12, s=s, m=NOW), now=NOW)
    assert result.reason == Reason.S_OUT_OF_RANGE


def test_tres_pruebas_fallidas_bloquean_la_cuenta():
    bank, client = registrar(TOY_GROUP, x=7)
    attempts = [verify_nizk(bank, _forged(prove(client, m=NOW)), now=NOW).attempts_left for _ in range(3)]
    assert attempts == [2, 1, 0] and bank.is_locked(USER_ID)
    fourth = verify_nizk(bank, prove(client, m=NOW), now=NOW)
    assert not fourth.accepted and fourth.reason == Reason.ACCOUNT_LOCKED


def test_una_prueba_aceptada_reinicia_los_fallos():
    bank, client = registrar(TOY_GROUP, x=7)
    for _ in range(2):
        verify_nizk(bank, _forged(prove(client, m=NOW)), now=NOW)
    assert verify_nizk(bank, prove(client, m=NOW), now=NOW).attempts_left == bank.max_attempts


def test_sin_proteccion_no_se_usa_m_ni_el_registro():
    bank, client = registrar(TOY_GROUP, x=7)
    proof = prove(client, m=None)
    assert verify_nizk(bank, proof, now=NOW + 10**6, protect=False).accepted
    assert not bank.is_proof_used(proof.t, proof.s)


def test_ventana_negativa_es_uso_incorrecto():
    bank, client = registrar(TOY_GROUP, x=7)
    with pytest.raises(ValueError):
        verify_nizk(bank, prove(client, m=NOW), now=NOW, window=-1)


# --------------------------------------------- API pública del banco para la variante

def test_verify_proof_con_el_ejemplo_del_escrito_usa_la_misma_matematica():
    bank, _ = registrar(TOY_GROUP, x=7)
    result = bank.verify_proof(USER_ID, t=12, s=4, challenge_for=lambda y: 3)
    assert result.accepted and result.transcript == Transcript(t=12, c=3, s=4)
    assert result.details == EXAMPLE_DETAILS


def test_verify_proof_entrega_la_y_guardada_al_calcular_el_reto():
    bank, _ = registrar(TOY_GROUP, x=7)
    seen: list[int] = []

    def challenge_for(y: int) -> int:
        seen.append(y)
        return 3

    assert bank.verify_proof(USER_ID, t=12, s=4, challenge_for=challenge_for).accepted
    assert seen == [8]


@pytest.mark.parametrize(
    ("user_id", "t", "reason"),
    [("fantasma", 12, Reason.USER_NOT_FOUND), (USER_ID, 5, Reason.T_NOT_IN_SUBGROUP)],
    ids=["usuario-inexistente", "t-fuera-del-subgrupo"],
)
def test_verify_proof_no_calcula_el_reto_si_la_entrada_es_invalida(user_id, t, reason):
    bank, _ = registrar(TOY_GROUP, x=7)

    def challenge_for(_y: int) -> int:
        raise AssertionError("no debe calcularse el reto")

    assert bank.verify_proof(user_id, t=t, s=4, challenge_for=challenge_for).reason == reason


def test_verify_proof_respeta_el_bloqueo():
    bank, _ = registrar(TOY_GROUP, x=7)
    for _ in range(bank.max_attempts):
        bank.verify_proof(USER_ID, t=12, s=5, challenge_for=lambda y: 3)
    result = bank.verify_proof(USER_ID, t=12, s=4, challenge_for=lambda y: 3)
    assert result.reason == Reason.ACCOUNT_LOCKED and result.attempts_left == 0


@pytest.mark.parametrize("c", [-1, 11])
def test_verify_proof_rechaza_un_reto_fuera_de_rango_como_uso_incorrecto(c):
    bank, _ = registrar(TOY_GROUP, x=7)
    with pytest.raises(ValueError):
        bank.verify_proof(USER_ID, t=12, s=4, challenge_for=lambda y: c)


def test_registro_de_pruebas_usadas():
    bank = Bank(TOY_GROUP)
    assert not bank.is_proof_used(12, 4)
    bank.record_proof(12, 4)
    assert bank.is_proof_used(12, 4)
    assert not bank.is_proof_used(12, 5) and not bank.is_proof_used(4, 12)


def test_verify_proof_no_toca_las_sesiones_interactivas():
    bank, client = registrar(TOY_GROUP, x=7)
    session_id, c = bank.challenge(USER_ID, client.commit(r=5), c=3)
    assert bank.verify_proof(USER_ID, t=12, s=4, challenge_for=lambda y: 3).accepted
    assert bank.verify(session_id, client.respond(c)).accepted
