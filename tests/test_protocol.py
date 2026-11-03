"""Pruebas del protocolo interactivo: registro, aleatoriedad, verificación y control de intentos.

Cubre R2, R3, R6, R7 (autenticación con distintos tamaños de p) y R9.
"""

import pytest

from core.params import TOY_GROUP, get_group
from protocol.bank import Bank
from protocol.client import Client
from protocol.transcript import Reason, Transcript, VerifyResult
from tests.helpers import USER_ID, all_ints, login, registrar

SESSIONS_R3 = 1000
EXAMPLE_DETAILS = {"gs": 3, "yc": 6, "tyc": 3, "yc_inv": 4, "t_rec": 12}


def _open_session(bank: Bank, client: Client, r: int = 5, c: int = 3) -> str:
    session_id, _ = bank.challenge(client.user_id, client.commit(r=r), c=c)
    return session_id


# ---------------------------------------------------------------------- R2: registro

@pytest.mark.req("R2")
def test_registro_guarda_solo_id_y_clave_publica():
    bank, client = registrar(TOY_GROUP, x=7)
    assert client.register_payload() == (USER_ID, 8)  # y = 4^7 mod 23 = 8
    assert bank.users == {USER_ID: 8}


@pytest.mark.req("R2")
def test_el_banco_nunca_contiene_x_ni_despues_de_iniciar_sesion():
    bank, client = registrar(get_group("safe-512"))
    assert login(bank, client).accepted
    assert client.x not in all_ints(bank)


@pytest.mark.req("R2")
def test_la_vista_de_usuarios_no_permite_modificar_el_banco():
    bank, _ = registrar(TOY_GROUP, x=7)
    bank.users["intruso"] = 4
    assert bank.users == {USER_ID: 8}


# ------------------------------------------------------------------ R3: aleatoriedad

@pytest.mark.req("R3")
def test_r_y_c_no_se_repiten_en_1000_inicios_de_sesion():
    # Tabla 7 pide q de 256 bits. En safe-256, q = (p − 1)/2 tiene 255 bits, así que se usa
    # safe-512 (q de 511 bits): el criterio se cumple con holgura.
    gp = get_group("safe-512")
    assert gp.q.bit_length() >= 256
    bank, client = registrar(gp)
    commitments, challenges = set(), set()
    for _ in range(SESSIONS_R3):
        t = client.commit()  # t = g^r es inyectiva en r ∈ [1, q − 1]: t distintos ⇔ r distintos
        session_id, c = bank.challenge(USER_ID, t)
        assert bank.verify(session_id, client.respond(c)).accepted
        commitments.add(t)
        challenges.add(c)
    assert len(commitments) == SESSIONS_R3
    assert len(challenges) == SESSIONS_R3


@pytest.mark.req("R3")
def test_el_cliente_borra_r_despues_de_responder():
    client = Client(USER_ID, TOY_GROUP, x=7)
    client.commit(r=5)
    client.respond(3)
    with pytest.raises(RuntimeError):
        client.respond(5)


@pytest.mark.req("R3")
def test_x_aleatoria_queda_en_el_rango_1_a_q_menos_1():
    values = {Client(USER_ID, TOY_GROUP).x for _ in range(500)}
    assert values <= set(range(1, TOY_GROUP.q))
    assert len(values) > 1


@pytest.mark.req("R3")
@pytest.mark.parametrize("x", [0, 11, -1])
def test_cliente_rechaza_x_fuera_de_rango(x):
    with pytest.raises(ValueError):
        Client(USER_ID, TOY_GROUP, x=x)


# --------------------------------------------------------------- R6: verificación

@pytest.mark.req("R6")
def test_ejemplo_del_escrito_12_3_4_es_aceptado():
    bank, client = registrar(TOY_GROUP, x=7)
    result = login(bank, client, r=5, c=3)
    assert result.accepted
    assert result.reason == Reason.ACCESS_GRANTED == "Acceso concedido"
    assert result.transcript == Transcript(t=12, c=3, s=4)
    assert result.details == EXAMPLE_DETAILS


@pytest.mark.req("R6")
def test_respuesta_falsa_s_5_es_rechazada():
    bank, client = registrar(TOY_GROUP, x=7)
    result = bank.verify(_open_session(bank, client), 5)
    assert not result.accepted
    assert result.reason == "La congruencia no se cumple"
    assert result.details["gs"] != result.details["tyc"]


@pytest.mark.req("R6")
def test_completitud_todo_cliente_honesto_es_aceptado():
    for x in range(1, TOY_GROUP.q):
        bank, client = registrar(TOY_GROUP, x=x)
        assert all(login(bank, client).accepted for _ in range(20))


@pytest.mark.req("R6")
def test_quien_no_conoce_x_es_rechazado_con_reto_distinto_al_adivinado():
    bank, _ = registrar(TOY_GROUP, x=7)
    impostor = Client(USER_ID, TOY_GROUP, x=3)  # misma identidad, clave equivocada
    session_id, c = bank.challenge(USER_ID, impostor.commit(r=5), c=3)
    assert not bank.verify(session_id, impostor.respond(c)).accepted


# ------------------------------------------------------- R7: distintos tamaños de p

PENDING_2048 = pytest.mark.xfail(raises=NotImplementedError, strict=True,
                                 reason="Grupo RFC 3526 de 2048 bits: disponible en el informe final")


@pytest.mark.req("R7")
@pytest.mark.parametrize(
    "name", ["toy", "safe-256", "safe-512", "safe-1024", pytest.param("rfc-2048", marks=PENDING_2048)]
)
def test_autenticacion_honesta_con_cada_tamano_de_p(name):
    bank, client = registrar(get_group(name))
    assert all(login(bank, client).accepted for _ in range(3))


# ---------------------------------------------- R9: validación de entradas e intentos

@pytest.mark.req("R9")
@pytest.mark.parametrize("s", [11, -1, 100])
def test_rechaza_s_fuera_de_rango(s):
    bank, client = registrar(TOY_GROUP, x=7)
    result = bank.verify(_open_session(bank, client), s)
    assert not result.accepted and result.reason == "s fuera de rango"


@pytest.mark.req("R9")
@pytest.mark.parametrize("t", [5, 0, 23, -4])
def test_rechaza_t_fuera_del_subgrupo(t):
    bank, _ = registrar(TOY_GROUP, x=7)
    result = bank.challenge(USER_ID, t)
    assert isinstance(result, VerifyResult)
    assert not result.accepted and result.reason == Reason.T_NOT_IN_SUBGROUP
    assert result.attempts_left == 2


@pytest.mark.req("R9")
@pytest.mark.parametrize(
    ("y", "reason"),
    [(1, Reason.Y_IS_ONE), (5, Reason.Y_NOT_IN_SUBGROUP), (23, Reason.Y_NOT_IN_SUBGROUP)],
    ids=["y=1", "y=5", "y=23"],
)
def test_rechaza_claves_publicas_invalidas(y, reason):
    result = Bank(TOY_GROUP).register(USER_ID, y)
    assert not result.accepted and result.reason == reason


@pytest.mark.req("R9")
def test_rechaza_registro_repetido_e_identificadores_invalidos():
    bank, _ = registrar(TOY_GROUP, x=7)
    assert bank.register(USER_ID, 16).reason == Reason.USER_EXISTS
    for bad_id in ["", "con espacio", "x" * 65, "ñandú"]:
        assert bank.register(bad_id, 16).reason == Reason.INVALID_USER_ID
    assert bank.users == {USER_ID: 8}


@pytest.mark.req("R9")
def test_bloquea_al_tercer_fallo_y_rechaza_el_cuarto_intento_aunque_sea_valido():
    bank, client = registrar(TOY_GROUP, x=7)
    attempts_left = [bank.verify(_open_session(bank, client), 5).attempts_left for _ in range(3)]
    assert attempts_left == [2, 1, 0]
    assert bank.is_locked(USER_ID)
    fourth = bank.challenge(USER_ID, client.commit(r=5))
    assert isinstance(fourth, VerifyResult) and fourth.reason == "Cuenta bloqueada"


@pytest.mark.req("R9")
def test_un_reto_nuevo_descarta_la_sesion_pendiente_y_cuenta_un_fallo():
    bank, client = registrar(TOY_GROUP, x=7)
    abandoned = _open_session(bank, client)
    current = _open_session(bank, client)
    assert bank.attempts_left(USER_ID) == 2
    assert bank.verify(abandoned, 4).reason == Reason.INVALID_SESSION
    assert bank.verify(current, 4).accepted


@pytest.mark.req("R9")
def test_abandonar_retos_para_esperar_el_adivinado_no_evita_el_bloqueo():
    # Ataque: abrir retos sin responder hasta que salga el c que el impostor adivinó.
    bank, client = registrar(TOY_GROUP, x=7)
    outcomes = [bank.challenge(USER_ID, client.commit()) for _ in range(4)]
    assert all(isinstance(o, tuple) for o in outcomes[:3])
    assert isinstance(outcomes[3], VerifyResult) and outcomes[3].reason == Reason.ACCOUNT_LOCKED


@pytest.mark.req("R9")
def test_un_acceso_exitoso_reinicia_el_contador_de_fallos():
    bank, client = registrar(TOY_GROUP, x=7)
    for _ in range(2):
        bank.verify(_open_session(bank, client), 5)
    assert login(bank, client).attempts_left == 3
    assert not bank.is_locked(USER_ID)


@pytest.mark.req("R9")
def test_cada_sesion_se_usa_una_sola_vez():
    bank, client = registrar(TOY_GROUP, x=7)
    session_id = _open_session(bank, client)
    assert bank.verify(session_id, 4).accepted
    repeated = bank.verify(session_id, 4)
    assert not repeated.accepted and repeated.reason == "Sesión inválida"
    assert bank.verify("no-existe", 4).reason == Reason.INVALID_SESSION


@pytest.mark.req("R9")
def test_reto_para_usuario_inexistente_se_rechaza():
    result = Bank(TOY_GROUP).challenge("fantasma", 12)
    assert isinstance(result, VerifyResult) and result.reason == Reason.USER_NOT_FOUND


@pytest.mark.req("R9")
def test_banco_rechaza_reto_fijo_fuera_de_rango():
    bank, client = registrar(TOY_GROUP, x=7)
    with pytest.raises(ValueError):
        bank.challenge(USER_ID, client.commit(r=5), c=11)
