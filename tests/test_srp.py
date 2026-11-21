"""Pruebas del mecanismo SRP-6a (C1–C4).

La matemática se contrasta con los vectores del apéndice B del RFC 5054 (grupo de 1024 bits y
SHA-1); el mecanismo usa el grupo de 2048 bits con SHA-256.
"""

import pytest
import sympy
from fastapi.testclient import TestClient

from api.app import create_app
from core.modular import mod_pow
from mechanisms.base import Exchange, FlowContext, StepError
from mechanisms.srp import client as srp_client
from mechanisms.srp import srp6a
from tests.mechanism_helpers import USER, make_lab, run_flow, sent_bodies

GROUP = srp6a.RFC5054_2048
PASSWORD = "correcto-caballo-bateria"
RFC_N_1024 = srp6a.hex_to_int("""
    EEAF0AB9 ADB38DD6 9C33F80A FA8FC5E8 60726187 75FF3C0B 9EA2314C 9C256576 D674DF74 96EA81D3
    383B4813 D692C6E0 E0D5D8E2 50B98BE4 8E495C1D 6089DAD1 5DC7D7B4 6154D6B6 CE8EF4AD 69B15D49
    82559B29 7BCF1885 C529F566 660E57EC 68EDBC3C 05726CC0 2FD4CBF4 976EAA9A FD5138FE 8376435B
    9FC61D2F C0EB06E3""")
RFC_GROUP = srp6a.SrpGroup(N=RFC_N_1024, g=2, hash_name="sha1", name="rfc5054-1024")
RFC_SALT = bytes.fromhex("BEB25379D1A8581EB5A727673A2441EE")
RFC_VECTORS = {
    "k": "7556AA04 5AEF2CDD 07ABAF0F 665C3E81 8913186F",
    "x": "94B7555A ABE9127C C58CCF49 93DB6CF8 4D16C124",
    "v": """7E273DE8 696FFC4F 4E337D05 B4B375BE B0DDE156 9E8FA00A 9886D812 9BADA1F1 822223CA 1A605B53
            0E379BA4 729FDC59 F105B478 7E5186F5 C671085A 1447B52A 48CF1970 B4FB6F84 00BBF4CE BFBB1681
            52E08AB5 EA53D15C 1AFF87B2 B9DA6E04 E058AD51 CC72BFC9 033B564E 26480D78 E955A5E2 9E7AB245
            DB2BE315 E2099AFB""",
    "a": "60975527 035CF2AD 1989806F 0407210B C81EDC04 E2762A56 AFD529DD DA2D4393",
    "b": "E487CB59 D31AC550 471E81F0 0F6928E0 1DDA08E9 74A004F4 9E61F5D1 05284D20",
    "A": """61D5E490 F6F1B795 47B0704C 436F523D D0E560F0 C64115BB 72557EC4 4352E890 3211C046 92272D8B
            2D1A5358 A2CF1B6E 0BFCF99F 921530EC 8E393561 79EAE45E 42BA92AE ACED8251 71E1E8B9 AF6D9C03
            E1327F44 BE087EF0 6530E69F 66615261 EEF54073 CA11CF58 58F0EDFD FE15EFEA B349EF5D 76988A36
            72FAC47B 0769447B""",
    "B": """BD0C6151 2C692C0C B6D041FA 01BB152D 4916A1E7 7AF46AE1 05393011 BAF38964 DC46A067 0DD125B9
            5A981652 236F99D9 B681CBF8 7837EC99 6C6DA044 53728610 D0C6DDB5 8B318885 D7D82C7F 8DEB75CE
            7BD4FBAA 37089E6F 9C6059F3 88838E7A 00030B33 1EB76840 910440B1 B27AAEAE EB4012B7 D7665238
            A8E3FB00 4B117B58""",
    "u": "CE38B959 3487DA98 554ED47D 70A7AE5F 462EF019",
    "S": """B0DC82BA BCF30674 AE450C02 87745E79 90A3381F 63B387AA F271A10D 233861E3 59B48220 F7C4693C
            9AE12B0A 6F67809F 0876E2D0 13800D6C 41BB59B6 D5979B5C 00A172B4 A2A5903A 0BDCAF8A 709585EB
            2AFAFA8F 3499B200 210DCC1F 10EB3394 3CD67FC8 8A2F39A4 BE5BEC4E C0A3212D C346D7E4 74B29EDE
            8A469FFE CA686E5A""",
}


def _vector(name: str) -> int:
    return srp6a.hex_to_int(RFC_VECTORS[name])


@pytest.fixture
def api() -> TestClient:
    return TestClient(create_app("toy"))


def _register(api: TestClient, password: str = PASSWORD, user_id: str = USER) -> None:
    salt = srp6a.new_salt()
    v = srp6a.verifier(GROUP, srp6a.private_key(GROUP, salt, user_id, password))
    response = api.post("/srp/register", json={"user_id": user_id, "salt": salt.hex(), "v": str(v)})
    assert response.status_code == 201, response.text


def _login(api: TestClient, password: str = PASSWORD, user_id: str = USER) -> tuple[dict, bytes, bytes, int]:
    """Inicio de sesión completo por la API; devuelve (respuesta final, M1, K, A)."""
    a = srp6a.new_ephemeral()
    A = srp6a.client_public(GROUP, a)
    start = api.post("/srp/login/start", json={"user_id": user_id, "A": str(A)}).json()
    salt, B = bytes.fromhex(start["salt"]), int(start["B"])
    x = srp6a.private_key(GROUP, salt, user_id, password)
    K = srp6a.session_key(GROUP, srp6a.client_premaster(GROUP, B, x, a, srp6a.scrambler(GROUP, A, B)))
    M1 = srp6a.client_proof(GROUP, user_id, salt, A, B, K)
    verify = api.post("/srp/login/verify", json={"session_id": start["session_id"], "M1": M1.hex()}).json()
    return verify, M1, K, A


# -------------------------------------------------------------- C1: funcionamiento

@pytest.mark.req("C1")
def test_matematica_coincide_con_los_vectores_del_rfc_5054():
    x = srp6a.private_key(RFC_GROUP, RFC_SALT, "alice", "password123")
    v = srp6a.verifier(RFC_GROUP, x)
    a, b = _vector("a"), _vector("b")
    A, B = srp6a.client_public(RFC_GROUP, a), srp6a.server_public(RFC_GROUP, v, b)
    u = srp6a.scrambler(RFC_GROUP, A, B)
    assert (srp6a.multiplier(RFC_GROUP), x, v) == (_vector("k"), _vector("x"), _vector("v"))
    assert (A, B, u) == (_vector("A"), _vector("B"), _vector("u"))
    assert srp6a.client_premaster(RFC_GROUP, B, x, a, u) == _vector("S")
    assert srp6a.server_premaster(RFC_GROUP, A, v, u, b) == _vector("S")


@pytest.mark.req("C1")
def test_grupo_de_2048_bits_es_primo_seguro_y_g_tiene_orden_q():
    q = (GROUP.N - 1) // 2
    assert GROUP.bits == 2048 and GROUP.hash_name == "sha256"
    assert sympy.isprime(GROUP.N) and sympy.isprime(q)
    assert mod_pow(GROUP.g, q, GROUP.N) in (1, GROUP.N - 1)


@pytest.mark.req("C1")
def test_registro_e_inicio_de_sesion_por_la_api_con_verificacion_mutua(api):
    _register(api)
    verify, M1, K, A = _login(api)
    assert verify["accepted"] is True and verify["attempts_left"] == 3
    assert verify["M2"] == srp6a.server_proof(GROUP, A, M1, K).hex()


@pytest.mark.req("C1")
def test_contrasena_incorrecta_se_rechaza_sin_m2(api):
    _register(api)
    verify, *_ = _login(api, password="otra-contrasena")
    assert verify == {"accepted": False, "reason": "La prueba M1 no coincide: contraseña incorrecta", "M2": None,
                      "attempts_left": 2}


@pytest.mark.req("C1")
def test_flujos_del_celular_registran_e_inician_sesion():
    _, phone = make_lab()
    register = run_flow(phone, "srp", "register")
    assert register["status"] == "aceptado"
    login = run_flow(phone, "srp", "login")
    assert login["status"] == "aceptado"
    assert [step["id"] for step in login["steps"]] == ["params", "ephemeral", "start", "session_key", "verify",
                                                       "server_proof"]


# ------------------------------------------------- C2: qué guarda el banco y qué viaja

@pytest.mark.req("C2")
def test_el_banco_guarda_sal_y_verificador_y_la_contrasena_no_viaja():
    bank, phone = make_lab()
    register = run_flow(phone, "srp", "register")
    login = run_flow(phone, "srp", "login")
    password = phone.get("/api/wallet").json()[0]["secret"]["contraseña (la recuerda la persona)"]
    assert set(bank.get("/bank/users").json()["srp"][USER]) == {"salt", "v"}
    bodies = sent_bodies(register) + sent_bodies(login)
    assert {key for body in bodies for key in body} == {"user_id", "salt", "v", "A", "session_id", "M1"}
    assert all(password not in str(body) for body in bodies)
    assert all(password not in str(entry["body"]) for entry in bank.get("/audit/log").json())


# ---------------------------------------------- C3: validación de entradas y bloqueo

@pytest.mark.req("C3")
@pytest.mark.parametrize("multiple", [0, 1, 2])
def test_a_congruente_con_cero_modulo_n_se_rechaza(api, multiple):
    _register(api)
    response = api.post("/srp/login/start", json={"user_id": USER, "A": str(multiple * GROUP.N)})
    assert response.status_code == 400 and "A ≡ 0 (mod N)" in response.json()["reason"]


@pytest.mark.req("C3")
@pytest.mark.parametrize(("path", "body", "code"), [
    ("/srp/login/start", {"user_id": USER, "A": str(GROUP.N + 5)}, 400),
    ("/srp/login/start", {"user_id": "fantasma", "A": "5"}, 404),
    ("/srp/register", {"user_id": "otro", "salt": "00" * 16, "v": "1"}, 400),
    ("/srp/register", {"user_id": "otro", "salt": "00" * 16, "v": str(GROUP.N)}, 400),
    ("/srp/register", {"user_id": USER, "salt": "00" * 16, "v": "5"}, 400),
    ("/srp/register", {"user_id": "otro", "salt": "xyz", "v": "5"}, 422),
    ("/srp/login/verify", {"session_id": "0" * 16, "M1": "abc"}, 422),
    ("/srp/login/start", {"user_id": USER, "A": "5", "a": "7"}, 422),
])
def test_entradas_invalidas_se_rechazan(api, path, body, code):
    _register(api)
    assert api.post(path, json=body).status_code == code


@pytest.mark.req("C3")
def test_tres_pruebas_incorrectas_bloquean_la_cuenta(api):
    _register(api)
    assert [_login(api, password="otra-contrasena")[0]["attempts_left"] for _ in range(3)] == [2, 1, 0]
    assert api.post("/srp/login/start", json={"user_id": USER, "A": "5"}).status_code == 423


@pytest.mark.req("C3")
def test_un_inicio_nuevo_reemplaza_la_sesion_pendiente(api):
    _register(api)
    first = api.post("/srp/login/start", json={"user_id": USER, "A": "5"}).json()
    api.post("/srp/login/start", json={"user_id": USER, "A": "7"})
    stale = api.post("/srp/login/verify", json={"session_id": first["session_id"], "M1": "00" * 32}).json()
    assert stale["reason"] == "Sesión inválida o ya utilizada"


class _FakeBankGateway:
    """Banco falso: entrega un grupo o un B elegidos por el atacante."""

    def __init__(self, responses: dict[str, dict]) -> None:
        self._responses = responses

    def request(self, method: str, path: str, body: dict | None = None, correlation_id: str | None = None,
                mechanism: str | None = None) -> Exchange:
        return Exchange(method, path, 200, body, self._responses[path], 0.0)


def _context(responses: dict[str, dict]) -> FlowContext:
    ctx = FlowContext(user_id=USER, gateway=_FakeBankGateway(responses), wallet={})
    ctx.wallet[("srp", USER)] = srp_client.SrpSecret(PASSWORD)
    return ctx


@pytest.mark.req("C3")
def test_el_celular_rechaza_un_grupo_que_no_es_el_del_rfc():
    weak = {"/srp/params": {"N": "23", "g": "5", "hash": "sha256"}}
    with pytest.raises(StepError, match="Grupo SRP desconocido"):
        srp_client.fetch_params(_context(weak))


@pytest.mark.req("C3")
def test_el_celular_aborta_si_b_es_congruente_con_cero():
    params = {"N": str(GROUP.N), "g": "2", "hash": "sha256"}
    start = {"session_id": "0" * 16, "salt": "00" * 16, "B": str(GROUP.N)}
    ctx = _context({"/srp/params": params, "/srp/login/start": start})
    for step in (srp_client.fetch_params, srp_client.make_ephemeral, srp_client.send_start):
        step(ctx)
    result = srp_client.compute_session_key(ctx)
    assert result.outcome == "rechazado" and "B ≡ 0 (mod N)" in result.message


# ------------------------------------------------ C4: repetición y verificación mutua

@pytest.mark.req("C4")
def test_repetir_los_mensajes_capturados_no_permite_entrar():
    bank, phone = make_lab()
    run_flow(phone, "srp", "register")
    start_body, verify_body = sent_bodies(run_flow(phone, "srp", "login"))
    assert bank.post("/srp/login/verify", json=verify_body).json()["reason"] == "Sesión inválida o ya utilizada"
    fresh = bank.post("/srp/login/start", json=start_body).json()      # mismo A, b nuevo → B distinto
    adapted = bank.post("/srp/login/verify", json={**verify_body, "session_id": fresh["session_id"]}).json()
    assert adapted["accepted"] is False and adapted["M2"] is None


@pytest.mark.req("C4")
def test_un_banco_falso_que_no_conoce_v_es_detectado_por_m2():
    params = {"N": str(GROUP.N), "g": "2", "hash": "sha256"}
    fake_b = srp6a.client_public(GROUP, srp6a.new_ephemeral())           # el impostor no conoce v
    start = {"session_id": "0" * 16, "salt": "00" * 16, "B": str(fake_b)}
    verify = {"accepted": True, "reason": "Acceso concedido", "M2": "ab" * 32, "attempts_left": 3}
    ctx = _context({"/srp/params": params, "/srp/login/start": start, "/srp/login/verify": verify})
    for step in srp_client.FLOW_ACTIONS["login"][:-1]:
        step(ctx)
    result = srp_client.check_server(ctx)
    assert result.outcome == "rechazado" and "banco falso" in result.message
