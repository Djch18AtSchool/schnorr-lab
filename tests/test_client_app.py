"""Pruebas del proceso del celular: configuración, secretos locales, reinicio y eventos (R2, R7, R11).

Los actos completos (Ana y Eve contra el banco) se prueban en test_acts.py.
"""

import pytest
from fastapi.testclient import TestClient

from api.app import create_app
from client_app.app import create_client_app

PUBLIC_FIELDS = {"user_id", "y", "t", "session_id", "s", "m"}


@pytest.fixture
def lab() -> tuple[TestClient, TestClient]:
    bank = TestClient(create_app("toy"))
    phone = TestClient(create_client_app(bank_url="http://testserver", bank_http=bank))
    return bank, phone


def _play(phone: TestClient, act: str) -> dict:
    run = phone.post("/api/acts", json={"act": act}).json()
    return phone.post(f"/api/acts/{run['id']}/run").json()


@pytest.mark.req("R2")
def test_x_queda_en_el_celular_y_nunca_llega_al_banco(lab):
    bank, phone = lab
    _play(phone, "espia_respuesta")
    wallet = phone.get("/api/wallet").json()
    assert wallet[0]["mechanism"] == "zkp" and "x (secreta)" in wallet[0]["secret"]
    for entry in bank.get("/audit/log").json():
        assert set(entry["body"]) <= PUBLIC_FIELDS


@pytest.mark.req("R7")
def test_reiniciar_cambia_el_grupo_y_borra_los_secretos(lab):
    bank, phone = lab
    _play(phone, "login")
    assert phone.post("/api/lab/reset", json={"group": "safe-256"}).json() == {"group": "safe-256"}
    assert bank.get("/mechanisms").json()[0]["server"]["group_id"] == "safe-256"
    assert phone.get("/api/wallet").json() == []
    assert phone.get("/api/config").json()["group"] == "safe-256"
    assert _play(phone, "login")["status"] == "aceptado"


@pytest.mark.req("R7")
def test_reiniciar_con_un_grupo_desconocido_devuelve_400(lab):
    _, phone = lab
    assert phone.post("/api/lab/reset", json={"group": "inexistente"}).status_code == 400


@pytest.mark.req("R11")
def test_los_pasos_de_ana_y_eve_quedan_en_los_eventos_del_celular(lab):
    _, phone = lab
    _play(phone, "espia_respuesta")
    sources = {event["source"] for event in phone.get("/api/events").json() if event["kind"] == "acto"}
    assert sources == {"cliente", "atacante"}


@pytest.mark.req("R11")
def test_la_pagina_principal_responde_aunque_la_web_no_este_compilada(lab):
    _, phone = lab
    response = phone.get("/")
    assert response.status_code == 200 and "html" in response.headers["content-type"]
    assert phone.get("/clasico").status_code == 404
