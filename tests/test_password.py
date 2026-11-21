"""Pruebas del mecanismo de contraseña con Argon2id (C1–C4)."""

import pytest
from fastapi.testclient import TestClient

from api.app import create_app
from mechanisms.common import AttemptLimiter
from mechanisms.password import credentials
from tests.mechanism_helpers import USER, make_lab, run_flow, sent_bodies

PASSWORD = "correcto-caballo-bateria"


@pytest.fixture
def api() -> TestClient:
    return TestClient(create_app("toy"))


def _register(api: TestClient, password: str = PASSWORD, user_id: str = USER):
    return api.post("/password/register", json={"user_id": user_id, "password": password})


def _login(api: TestClient, password: str = PASSWORD, user_id: str = USER):
    return api.post("/password/login", json={"user_id": user_id, "password": password})


# -------------------------------------------------------------- C1: funcionamiento

@pytest.mark.req("C1")
def test_hash_argon2id_usa_los_parametros_de_owasp_y_verifica():
    stored = credentials.hash_password(PASSWORD)
    assert stored.startswith("$argon2id$v=19$m=19456,t=2,p=1$")
    assert credentials.verify_password(stored, PASSWORD)
    assert not credentials.verify_password(stored, PASSWORD + "x")


@pytest.mark.req("C1")
def test_misma_contrasena_produce_hashes_distintos_por_la_sal():
    assert credentials.hash_password(PASSWORD) != credentials.hash_password(PASSWORD)


@pytest.mark.req("C1")
def test_registro_e_inicio_de_sesion_por_la_api(api):
    assert _register(api).status_code == 201
    body = _login(api).json()
    assert body == {"accepted": True, "reason": "Acceso concedido", "attempts_left": 3}


@pytest.mark.req("C1")
@pytest.mark.parametrize(("password", "user_id"), [("otra-contrasena", USER), (PASSWORD, "fantasma")])
def test_contrasena_o_usuario_incorrectos_se_rechazan_con_el_mismo_mensaje(api, password, user_id):
    _register(api)
    body = _login(api, password, user_id).json()
    assert body["accepted"] is False and body["reason"] == "Usuario o contraseña incorrectos"


@pytest.mark.req("C1")
def test_flujos_del_celular_registran_e_inician_sesion():
    _, phone = make_lab()
    register = run_flow(phone, "password", "register")
    assert register["status"] == "aceptado"
    assert [step["id"] for step in register["steps"]] == ["password", "register"]
    login = run_flow(phone, "password", "login")
    assert login["status"] == "aceptado"
    assert login["steps"][-1]["record"]["exchange"]["path"] == "/password/login"


@pytest.mark.req("C1")
def test_iniciar_sesion_sin_cuenta_en_el_celular_termina_con_error():
    _, phone = make_lab()
    login = run_flow(phone, "password", "login", user="sin-cuenta")
    assert login["status"] == "error" and "primero cree la cuenta" in login["steps"][0]["record"]["message"]


# ------------------------------------------------- C2: qué guarda el banco y qué viaja

@pytest.mark.req("C2")
def test_el_banco_guarda_solo_el_hash_y_la_contrasena_viaja():
    bank, phone = make_lab()
    run_flow(phone, "password", "register")
    login = run_flow(phone, "password", "login")
    password = phone.get("/api/wallet").json()[0]["secret"]["contraseña (la recuerda la persona)"]
    stored = bank.get("/bank/users").json()["password"][USER]
    assert set(stored) == {"hash"} and password not in stored["hash"]
    assert all(body["password"] == password for body in sent_bodies(login))


@pytest.mark.req("C2")
def test_describe_publica_los_parametros_de_argon2id(api):
    password = next(m for m in api.get("/mechanisms").json() if m["id"] == "password")
    assert password["server"]["memoria_kib"] == "19456" and password["server"]["max_attempts"] == 3


# ---------------------------------------------- C3: validación de entradas y bloqueo

@pytest.mark.req("C3")
def test_registro_repetido_se_rechaza(api):
    _register(api)
    response = _register(api)
    assert response.status_code == 400 and response.json()["reason"] == "El usuario ya está registrado"


@pytest.mark.req("C3")
@pytest.mark.parametrize("body", [
    {"user_id": USER, "password": "corta"},
    {"user_id": USER, "password": "x" * 129},
    {"user_id": "con espacio", "password": PASSWORD},
    {"user_id": USER, "password": PASSWORD, "hash": "intruso"},
])
def test_cuerpos_invalidos_se_rechazan_y_quedan_auditados(api, body):
    response = api.post("/password/register", json=body)
    assert response.status_code == 422
    assert api.get("/audit/log").json()[-1] == {"endpoint": "/password/register", "mechanism": "password",
                                                "valid": False, "body": body}


@pytest.mark.req("C3")
def test_tres_fallos_bloquean_aun_con_la_contrasena_correcta(api):
    _register(api)
    assert [_login(api, "otra-contrasena").json()["attempts_left"] for _ in range(3)] == [2, 1, 0]
    locked = _login(api)
    assert locked.status_code == 423 and "bloqueada" in locked.json()["reason"]


@pytest.mark.req("C3")
def test_un_acceso_correcto_reinicia_los_fallos():
    limiter = AttemptLimiter(max_attempts=3)
    limiter.fail(USER)
    limiter.fail(USER)
    assert limiter.succeed(USER) == 3 and limiter.attempts_left(USER) == 3
    with pytest.raises(ValueError):
        AttemptLimiter(max_attempts=0)


@pytest.mark.req("C3")
def test_reiniciar_el_laboratorio_borra_usuarios_y_bloqueos(api):
    _register(api)
    for _ in range(3):
        _login(api, "otra-contrasena")
    assert api.post("/lab/reset", json={"group": "toy"}).status_code == 200
    assert api.get("/bank/users").json()["password"] == {}
    _register(api)
    assert _login(api).json()["accepted"] is True


# ------------------------------------------------------------------ C4: repetición

@pytest.mark.req("C4")
def test_repetir_el_mensaje_capturado_si_entra():
    bank, phone = make_lab()
    run_flow(phone, "password", "register")
    captured = sent_bodies(run_flow(phone, "password", "login"))[-1]
    replay = bank.post("/password/login", json=captured).json()
    assert replay["accepted"] is True        # la contraseña sirve siempre: es la línea base
