"""Pruebas de la app del celular contra el banco: flujos paso a paso, eventos y laboratorio (R11)."""

import pytest
from fastapi.testclient import TestClient

from api.app import create_app
from client_app.app import create_client_app

USER = "cliente01"
PUBLIC_FIELDS = {"user_id", "y", "t", "session_id", "s"}


@pytest.fixture
def lab() -> tuple[TestClient, TestClient]:
    bank = TestClient(create_app("toy"))
    phone = TestClient(create_client_app(bank_url="http://testserver", bank_http=bank))
    return bank, phone


def _start(phone: TestClient, flow: str, user: str = USER) -> dict:
    response = phone.post("/api/flows", json={"flow": flow, "user_id": user})
    assert response.status_code == 201, response.text
    return response.json()


def _run(phone: TestClient, flow: str, user: str = USER) -> dict:
    return phone.post(f"/api/flows/{_start(phone, flow, user)['id']}/run").json()


@pytest.mark.req("R11")
def test_registro_e_inicio_de_sesion_paso_a_paso(lab):
    _, phone = lab
    register = _start(phone, "register")
    assert [step["id"] for step in register["steps"]] == ["params", "keygen", "register"]
    for expected_next in (1, 2, 3):
        register = phone.post(f"/api/flows/{register['id']}/next").json()
        assert register["next_index"] == expected_next
    assert register["status"] == "aceptado"
    login = _run(phone, "login")
    assert login["status"] == "aceptado"
    assert [step["record"]["status"] for step in login["steps"]] == ["ok", "ok", "ok", "ok", "aceptado"]
    assert login["steps"][-1]["record"]["exchange"]["path"] == "/zkp/login/respond"


@pytest.mark.req("R8")
def test_inicio_de_sesion_no_interactivo_en_un_solo_mensaje(lab):
    bank, phone = lab
    _run(phone, "register")
    login = _run(phone, "login_nizk")
    assert login["status"] == "aceptado"
    assert [step["id"] for step in login["steps"]] == ["params", "prove", "send_proof"]
    sent = login["steps"][-1]["record"]["exchange"]["request_body"]
    assert set(sent) == {"user_id", "t", "s", "m"}
    assert bank.get("/audit/log").json()[-1]["endpoint"] == "/zkp/login/nizk"


@pytest.mark.req("R10")
def test_repetir_la_prueba_no_interactiva_capturada_es_rechazado(lab):
    _, phone = lab
    _run(phone, "register")
    _run(phone, "login_nizk")
    replay = phone.post("/api/lab/attacks/replay_nizk", json={}).json()
    assert replay["accepted"] is False and "Prueba ya utilizada" in replay["conclusion"]


@pytest.mark.req("R11")
def test_cada_paso_muestra_sus_valores_y_la_traza_con_p_pequeno(lab):
    _, phone = lab
    _run(phone, "register")
    login = _run(phone, "login")
    commit = login["steps"][1]["record"]
    assert set(commit["values"]) == {"r (aleatorio, de un solo uso)", "t = g^r mod p"}
    assert commit["trace"] and commit["trace"][0].startswith("bit 0")
    assert "g^s mod p" in login["steps"][-1]["record"]["values"]


@pytest.mark.req("R2")
def test_x_queda_en_el_celular_y_nunca_llega_al_banco(lab):
    bank, phone = lab
    _run(phone, "register")
    _run(phone, "login")
    wallet = phone.get("/api/wallet").json()
    assert wallet[0]["mechanism"] == "zkp" and "x (secreta)" in wallet[0]["secret"]
    for entry in bank.get("/audit/log").json():
        assert set(entry["body"]) <= PUBLIC_FIELDS


@pytest.mark.req("R11")
def test_los_eventos_del_banco_se_correlacionan_con_los_pasos_del_celular(lab):
    bank, phone = lab
    _run(phone, "register")
    login = _run(phone, "login")
    verify_step = login["steps"][-1]["record"]["correlation_id"]
    bank_events = [e for e in bank.get("/events").json() if e["correlation_id"] == verify_step]
    assert any(e["kind"] == "verificacion" and e["title"] == "ACCESO CONCEDIDO" for e in bank_events)
    kinds = {e["kind"] for e in phone.get("/api/events").json()}
    assert {"paso", "http"} <= kinds


@pytest.mark.req("R11")
def test_iniciar_sesion_sin_cuenta_termina_con_error_explicado(lab):
    _, phone = lab
    login = _run(phone, "login", user="sin-cuenta")
    assert login["status"] == "error"
    assert "primero cree la cuenta" in login["steps"][1]["record"]["message"]


@pytest.mark.req("R11")
def test_registro_repetido_termina_rechazado(lab):
    _, phone = lab
    _run(phone, "register")
    again = _run(phone, "register")
    assert again["status"] == "rechazado"
    assert again["steps"][-1]["record"]["message"] == "El usuario ya está registrado"


@pytest.mark.req("R11")
def test_errores_de_uso_de_la_api_del_celular(lab):
    _, phone = lab
    flow = _run(phone, "register")
    assert phone.post(f"/api/flows/{flow['id']}/next").status_code == 409
    assert phone.get("/api/flows/no-existe").status_code == 404
    bad = phone.post("/api/flows", json={"mechanism": "otro", "flow": "login", "user_id": USER})
    assert bad.status_code == 400
    assert phone.post("/api/flows", json={"flow": "login", "user_id": "con espacio"}).status_code == 422


@pytest.mark.req("R7")
def test_reiniciar_el_laboratorio_cambia_el_grupo_y_borra_secretos(lab):
    bank, phone = lab
    _run(phone, "register")
    response = phone.post("/api/lab/reset", json={"group": "safe-256"})
    assert response.status_code == 200
    assert bank.get("/mechanisms").json()[0]["server"]["group"] == "safe-256"
    assert phone.get("/api/wallet").json() == []
    assert _run(phone, "register")["status"] == "aceptado"
    assert _run(phone, "login")["status"] == "aceptado"


@pytest.mark.req("R7")
def test_reiniciar_con_un_grupo_desconocido_devuelve_400(lab):
    _, phone = lab
    assert phone.post("/api/lab/reset", json={"group": "inexistente"}).status_code == 400


@pytest.mark.req("R10")
def test_ataque_fuera_de_linea_devuelve_resultado_y_reporte(lab):
    _, phone = lab
    result = phone.post("/api/lab/attacks/nonce_reuse", json={}).json()
    assert result["result"]["x_extracted"] == "7"
    assert any("mod 11 = 7" in line for line in result["report"])


@pytest.mark.req("R10")
def test_repetir_la_respuesta_capturada_es_rechazado(lab):
    _, phone = lab
    assert phone.post("/api/lab/attacks/replay_response", json={}).status_code == 400
    _run(phone, "register")
    _run(phone, "login")
    replay = phone.post("/api/lab/attacks/replay_response", json={}).json()
    assert replay["accepted"] is False and "Sesión inválida" in replay["conclusion"]


@pytest.mark.req("R10")
def test_robar_la_base_solo_entrega_claves_publicas(lab):
    _, phone = lab
    _run(phone, "register")
    stolen = phone.post("/api/lab/attacks/steal_database", json={}).json()["stolen"]
    assert set(stolen[USER]) == {"y"}


@pytest.mark.req("R10")
def test_impostor_en_vivo_es_rechazado_y_consume_intentos(lab):
    _, phone = lab
    phone.post("/api/lab/reset", json={"group": "safe-256"})  # con q grande acertar el reto es despreciable
    _run(phone, "register")
    result = phone.post("/api/lab/attacks/impostor_live", json={"user_id": USER}).json()
    assert result["accepted"] is False and result["attempts_left"] == 2


@pytest.mark.req("R11")
def test_configuracion_y_pagina_principal(lab):
    _, phone = lab
    config = phone.get("/api/config").json()
    assert config["bank_url"] == "http://testserver" and config["mechanisms"][0]["id"] == "zkp"
    assert "nonce_reuse" in config["attacks"]["offline"]
    assert phone.get("/").status_code == 200
    assert isinstance(phone.get("/api/results").json(), list)
