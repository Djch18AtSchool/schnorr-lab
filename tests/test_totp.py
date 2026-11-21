"""Pruebas del mecanismo contraseña + TOTP del RFC 6238 (C1–C4)."""

from concurrent.futures import ThreadPoolExecutor

import pyotp
import pytest
from fastapi.testclient import TestClient

from mechanisms.totp import otp
from tests.mechanism_helpers import (
    USER,
    FakeClock,
    bank_server,
    make_lab,
    phone_mechanism,
    run_flow,
    sent_bodies,
)

PASSWORD = "correcto-caballo-bateria"
STEP = otp.PERIOD_SECONDS
# Vector del apéndice B del RFC 6238 (SHA-1): K = "12345678901234567890", t = 59 → 94287082 (8 dígitos)
RFC6238_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"


@pytest.fixture
def lab() -> tuple[TestClient, TestClient, FakeClock]:
    bank, phone = make_lab()
    clock = FakeClock()
    bank_server(bank, "totp").clock = clock
    phone_mechanism(phone, "totp").clock = clock
    return bank, phone, clock


def _enroll(bank: TestClient, clock: FakeClock, user_id: str = USER) -> str:
    """Registra y confirma por la API; devuelve el secreto K."""
    enrolled = bank.post("/totp/register", json={"user_id": user_id, "password": PASSWORD})
    assert enrolled.status_code == 201, enrolled.text
    secret = enrolled.json()["secret"]
    confirm = bank.post("/totp/register/confirm", json={"user_id": user_id, "code": otp.code_at(secret, clock())})
    assert confirm.json()["accepted"] is True
    return secret


def _login(bank: TestClient, code: str, password: str = PASSWORD, user_id: str = USER):
    return bank.post("/totp/login", json={"user_id": user_id, "password": password, "code": code})


# -------------------------------------------------------------- C1: funcionamiento

@pytest.mark.req("C1")
def test_codigo_coincide_con_el_vector_del_rfc_6238():
    assert pyotp.TOTP(RFC6238_SECRET, digits=8).at(59) == "94287082"
    assert otp.code_at(RFC6238_SECRET, 59) == "287082"      # mismo HOTP mod 10^6


@pytest.mark.req("C1")
def test_ventana_de_tolerancia_acepta_un_paso_antes_o_despues():
    secret, now = otp.new_secret(), 1_700_000_000
    assert otp.matching_step(secret, otp.code_at(secret, now - STEP), now) == otp.time_step(now) - 1
    assert otp.matching_step(secret, otp.code_at(secret, now + STEP), now) == otp.time_step(now) + 1
    assert otp.matching_step(secret, otp.code_at(secret, now - 2 * STEP), now) is None


@pytest.mark.req("C1")
def test_enrolamiento_devuelve_el_qr_y_activa_con_el_primer_codigo(lab):
    bank, _, clock = lab
    enrolled = bank.post("/totp/register", json={"user_id": USER, "password": PASSWORD}).json()
    assert enrolled["otpauth_uri"].startswith("otpauth://totp/") and enrolled["digits"] == 6
    assert bank.get("/bank/users").json()["totp"][USER]["status"] == "pendiente de confirmar"
    confirm = bank.post("/totp/register/confirm",
                        json={"user_id": USER, "code": otp.code_at(enrolled["secret"], clock())}).json()
    assert confirm["accepted"] is True
    assert bank.get("/bank/users").json()["totp"][USER]["status"] == "activo"


@pytest.mark.req("C1")
def test_inicio_de_sesion_con_contrasena_y_codigo_del_siguiente_paso(lab):
    bank, _, clock = lab
    secret = _enroll(bank, clock)
    clock.advance(STEP)
    assert _login(bank, otp.code_at(secret, clock())).json() == {
        "accepted": True, "reason": "Acceso concedido", "attempts_left": 3}


@pytest.mark.req("C1")
@pytest.mark.parametrize("wrong", ["password", "code", "pending"])
def test_contrasena_codigo_incorrectos_o_cuenta_sin_confirmar_se_rechazan(lab, wrong):
    bank, _, clock = lab
    if wrong == "pending":
        secret = bank.post("/totp/register", json={"user_id": USER, "password": PASSWORD}).json()["secret"]
    else:
        secret = _enroll(bank, clock)
    clock.advance(STEP)
    code = otp.code_at(secret, clock())
    code = f"{(int(code) + 1) % 10**6:06d}" if wrong == "code" else code
    body = _login(bank, code, password="otra-contrasena" if wrong == "password" else PASSWORD).json()
    assert body["accepted"] is False and body["reason"] == "Usuario, contraseña o código incorrectos"


@pytest.mark.req("C1")
def test_flujos_del_celular_enrolan_e_inician_sesion(lab):
    _, phone, clock = lab
    register = run_flow(phone, "totp", "register")
    assert register["status"] == "aceptado"
    assert [step["id"] for step in register["steps"]] == ["password", "enroll", "authenticator", "confirm"]
    clock.advance(STEP)
    login = run_flow(phone, "totp", "login")
    assert login["status"] == "aceptado"
    assert set(sent_bodies(login)[-1]) == {"user_id", "password", "code"}


# ------------------------------------------------- C2: qué guarda el banco y qué viaja

@pytest.mark.req("C2")
def test_el_banco_guarda_hash_y_secreto_k_y_k_viaja_solo_al_enrolar(lab):
    bank, phone, clock = lab
    register = run_flow(phone, "totp", "register")
    clock.advance(STEP)
    login = run_flow(phone, "totp", "login")
    wallet = phone.get("/api/wallet").json()[0]["secret"]
    stored = bank.get("/bank/users").json()["totp"][USER]
    assert stored["totp_secret"] == wallet["K (en la app autenticadora)"]
    assert stored["hash"].startswith("$argon2id$")
    secret = stored["totp_secret"]
    assert register["steps"][1]["record"]["exchange"]["response_body"]["secret"] == secret
    assert all(secret not in str(body) for body in sent_bodies(login))


# ---------------------------------------------- C3: validación de entradas y bloqueo

@pytest.mark.req("C3")
@pytest.mark.parametrize("code", ["12345", "1234567", "abcdef", "12 456"])
def test_codigo_mal_formado_se_rechaza_con_422(lab, code):
    bank, _, _ = lab
    response = _login(bank, code)
    assert response.status_code == 422
    assert bank.get("/audit/log").json()[-1]["valid"] is False


@pytest.mark.req("C3")
def test_registro_repetido_y_confirmacion_sin_enrolamiento_se_rechazan(lab):
    bank, _, clock = lab
    _enroll(bank, clock)
    assert bank.post("/totp/register", json={"user_id": USER, "password": PASSWORD}).status_code == 400
    assert bank.post("/totp/register/confirm", json={"user_id": "fantasma", "code": "123456"}).status_code == 400


@pytest.mark.req("C3")
def test_tres_fallos_bloquean_la_cuenta(lab):
    bank, _, clock = lab
    secret = _enroll(bank, clock)
    clock.advance(STEP)
    left = [_login(bank, otp.code_at(secret, clock()), password="otra-contrasena").json()["attempts_left"]
            for _ in range(3)]
    assert left == [2, 1, 0]
    assert _login(bank, otp.code_at(secret, clock())).status_code == 423


@pytest.mark.req("C3")
def test_confirmacion_con_codigo_incorrecto_suma_fallo(lab):
    bank, _, _ = lab
    bank.post("/totp/register", json={"user_id": USER, "password": PASSWORD})
    body = bank.post("/totp/register/confirm", json={"user_id": USER, "code": "000000"}).json()
    assert body["accepted"] is False and body["attempts_left"] == 2


# --------------------------------------------------------- C4: repetición y reuso

@pytest.mark.req("C4")
def test_el_mismo_codigo_no_sirve_dos_veces_y_no_suma_fallo(lab):
    bank, _, clock = lab
    secret = _enroll(bank, clock)
    clock.advance(STEP)
    code = otp.code_at(secret, clock())
    assert _login(bank, code).json()["accepted"] is True
    replay = _login(bank, code).json()
    assert replay["accepted"] is False and replay["reason"].startswith("Código ya utilizado")
    assert replay["attempts_left"] == 3


@pytest.mark.req("C4")
def test_el_codigo_del_enrolamiento_no_sirve_para_iniciar_sesion(lab):
    _, phone, _ = lab
    run_flow(phone, "totp", "register")
    login = run_flow(phone, "totp", "login")          # mismo paso de 30 s que la confirmación
    assert login["status"] == "rechazado" and "ya utilizado" in login["steps"][-1]["record"]["message"]


@pytest.mark.req("C4")
def test_repetir_el_mensaje_capturado_se_rechaza_dentro_y_fuera_de_la_ventana(lab):
    bank, phone, clock = lab
    run_flow(phone, "totp", "register")
    clock.advance(STEP)
    captured = sent_bodies(run_flow(phone, "totp", "login"))[-1]
    assert bank.post("/totp/login", json=captured).json()["accepted"] is False
    clock.advance(2 * STEP)
    late = bank.post("/totp/login", json=captured).json()
    assert late["accepted"] is False and late["reason"] == "Usuario, contraseña o código incorrectos"


@pytest.mark.req("C4")
def test_el_mismo_codigo_en_paralelo_solo_entra_una_vez(lab):
    bank, _, clock = lab
    secret = _enroll(bank, clock)
    clock.advance(STEP)
    code = otp.code_at(secret, clock())
    with ThreadPoolExecutor(max_workers=4) as pool:
        accepted = list(pool.map(lambda _: _login(bank, code).json().get("accepted"), range(4)))
    assert accepted.count(True) == 1


@pytest.mark.req("C3")
def test_un_enrolamiento_pendiente_se_puede_rehacer_y_confirmar_reinicia_los_fallos(lab):
    bank, _, clock = lab
    bank.post("/totp/register", json={"user_id": USER, "password": "otra-contrasena"})
    bank.post("/totp/register/confirm", json={"user_id": USER, "code": "000000"})       # un fallo
    secret = _enroll(bank, clock)                     # el id pendiente no queda «ocupado»
    clock.advance(STEP)
    left = [_login(bank, otp.code_at(secret, clock()), password="mala-contrasena").json()["attempts_left"]
            for _ in range(2)]
    assert left == [2, 1]                             # la confirmación correcta reinició el contador
