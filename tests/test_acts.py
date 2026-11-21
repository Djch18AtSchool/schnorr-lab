"""Pruebas de los actos del Escenario contra el banco real: Ana, Eve y lo que observa el banco (R10, R11)."""

import pytest
from fastapi.testclient import TestClient

from api.app import create_app
from client_app.app import create_client_app

ANA = "ana"


@pytest.fixture
def lab() -> tuple[TestClient, TestClient]:
    bank = TestClient(create_app("toy"))
    phone = TestClient(create_client_app(bank_url="http://testserver", bank_http=bank))
    return bank, phone


def _play(phone: TestClient, act: str, group: str | None = None) -> dict:
    if group is not None:
        assert phone.post("/api/lab/reset", json={"group": group}).status_code == 200
    run = phone.post("/api/acts", json={"act": act})
    assert run.status_code == 201, run.text
    return phone.post(f"/api/acts/{run.json()['id']}/run").json()


def _records(run: dict) -> list[dict]:
    return [step["record"] for step in run["steps"]]


@pytest.mark.req("R11")
def test_el_catalogo_trae_los_ocho_actos_con_su_elenco(lab):
    _, phone = lab
    config = phone.get("/api/config").json()
    acts = {act["id"]: act for act in config["acts"]}
    assert list(acts) == ["registro", "login", "nizk", "espia_respuesta", "robo_base", "impostor", "espia_nizk",
                          "r_repetido"]
    assert acts["login"]["cast"] == ["ana", "red", "banco"]
    assert "eve" in acts["espia_respuesta"]["cast"]
    assert config["group"] == "toy" and config["console_url"].endswith("/consola/")
    assert {group["id"] for group in config["groups"]} >= {"toy", "rfc-2048", "schnorr-2048"}


@pytest.mark.req("R2")
def test_registro_parte_de_un_banco_vacio_y_crea_la_cuenta(lab):
    bank, phone = lab
    run = _play(phone, "registro")
    assert run["status"] == "aceptado" and len(run["steps"]) == 3
    assert bank.get("/bank/users").json()["zkp"].keys() == {ANA}


@pytest.mark.req("R6")
def test_inicio_de_sesion_paso_a_paso_con_calculos_y_trazas_del_banco(lab):
    bank, phone = lab
    run = _play(phone, "login")
    assert run["status"] == "aceptado"
    kinds = [step["kind"] for step in run["steps"]]
    assert kinds == ["exchange", "compute", "exchange", "compute", "exchange"]
    commit = _records(run)[1]
    assert commit["math"][0].startswith("t = g^r mod p = 4^")
    verify = _records(run)[-1]
    assert verify["exchanges"][0]["origin"] == ANA and not verify["intercepted"]
    events = [e for e in bank.get("/events").json() if e["correlation_id"] == verify["correlation_id"]]
    assert {e["kind"] for e in events} >= {"acceso", "verificacion"}
    assert next(e for e in events if e["kind"] == "verificacion")["data"]["span"]["function"] == "Bank._decide"


@pytest.mark.req("R8")
def test_inicio_sin_interaccion_en_un_mensaje(lab):
    _, phone = lab
    run = _play(phone, "nizk")
    assert run["status"] == "aceptado"
    assert _records(run)[-1]["exchanges"][0]["path"] == "/zkp/login/nizk"


@pytest.mark.req("R10")
def test_espia_copia_el_inicio_de_sesion_y_su_repeticion_es_rechazada(lab):
    bank, phone = lab
    run = _play(phone, "espia_respuesta")
    records = _records(run)
    assert all(r["intercepted"] for r in records[1:-1] if r["exchanges"])
    last = records[-1]
    assert run["status"] == "rechazado" and "Sesión inválida" in last["message"]
    assert last["exchanges"][0]["origin"] == "eve" and last["terminal"][0]["kind"] == "cmd"
    assert bank.get("/telemetry/alerts").json()[-1]["kind"] == "replay"


@pytest.mark.req("R10")
def test_espia_repite_la_prueba_no_interactiva_y_el_banco_la_reconoce(lab):
    _, phone = lab
    run = _play(phone, "espia_nizk")
    assert "Prueba ya utilizada" in _records(run)[-1]["message"]


@pytest.mark.req("R10")
def test_robo_de_base_con_p_23_despeja_x_y_eve_entra(lab):
    _, phone = lab
    steal, crack, enter = _records(_play(phone, "robo_base"))
    assert steal["values"]["usuarios"] == "1"
    assert crack["status"] == "aceptado" and enter["status"] == "aceptado"


@pytest.mark.req("R10")
def test_robo_de_base_con_2048_bits_no_permite_despejar_x(lab):
    _, phone = lab
    _, crack, enter = _records(_play(phone, "robo_base", group="rfc-2048"))
    assert crack["status"] == "rechazado" and "años" in crack["message"] and "inf" not in crack["message"]
    assert enter["status"] == "rechazado" and enter["exchanges"] == []


@pytest.mark.req("R9")
def test_impostor_bloquea_la_cuenta_y_despues_ana_no_puede_entrar(lab):
    bank, phone = lab
    run = _play(phone, "impostor", group="safe-256")   # con q grande, adivinar c es despreciable
    records = _records(run)
    assert [r["values"]["intentos restantes"] for r in records[1:4]] == ["2", "1", "0"]
    assert run["status"] == "rechazado" and "Cuenta bloqueada" in records[-1]["message"]
    assert len(run["steps"]) == 7          # el flujo de Ana se corta en el compromiso rechazado
    assert "lockout" in [alert["kind"] for alert in bank.get("/telemetry/alerts").json()]


@pytest.mark.req("R10")
def test_celular_que_repite_r_permite_a_eve_despejar_x_y_entrar(lab):
    _, phone = lab
    run = _play(phone, "r_repetido", group="safe-256")
    records = _records(run)
    commits = [r["values"]["t = g^r mod p"] for r in records if "t = g^r mod p" in r["values"]]
    assert len(commits) == 2 and commits[0] == commits[1]
    wallet_x = phone.get("/api/wallet").json()[0]["secret"]["x (secreta)"]
    assert records[-2]["values"]["x"] == wallet_x and records[-1]["status"] == "aceptado"


@pytest.mark.req("R11")
def test_errores_de_uso_de_los_actos(lab):
    _, phone = lab
    assert phone.post("/api/acts", json={"act": "no-existe"}).status_code == 400
    assert phone.get("/api/acts/no-existe").status_code == 404
    run = _play(phone, "login")
    assert phone.post(f"/api/acts/{run['id']}/next").status_code == 409


@pytest.mark.req("R11")
def test_los_mensajes_de_ana_y_eve_llegan_al_banco_con_su_dispositivo(lab):
    bank, phone = lab
    _play(phone, "espia_respuesta")
    records = bank.get("/telemetry/requests").json()
    assert {r["device"] for r in records if r["route"].startswith("/zkp")} == {"celular de Ana", "laptop de Eve"}
    assert not [r for r in records if r["route"] == "/lab/reset"]        # los actos no reinician el banco


@pytest.mark.req("R9")
def test_tras_el_impostor_soporte_desbloquea_y_ana_vuelve_a_entrar_sin_reiniciar(lab):
    bank, phone = lab
    _play(phone, "impostor", group="safe-256")
    assert _play(phone, "login")["status"] == "aceptado"
    records = bank.get("/telemetry/requests").json()
    unlock = [r for r in records if r["route"].endswith("/unlock")]
    assert len(unlock) == 1 and unlock[0]["device"] == "soporte del banco"
    assert len(bank.get("/audit/log").json()) == 10   # 1 registro + 3×2 del impostor + 1 rechazo + 2 del login


@pytest.mark.req("R2")
def test_registro_con_cuenta_existente_da_de_baja_y_registra_de_nuevo(lab):
    bank, phone = lab
    _play(phone, "login")
    assert _play(phone, "registro")["status"] == "aceptado"
    removals = [r for r in bank.get("/telemetry/requests").json() if r["method"] == "DELETE"]
    assert [r["route"] for r in removals] == ["/admin/accounts/{mechanism}/{user_id}"]
    assert list(bank.get("/bank/users").json()["zkp"]) == [ANA]


@pytest.mark.req("R11")
def test_una_peticion_trae_los_eventos_que_el_banco_publico_al_atenderla(lab):
    bank, phone = lab
    _play(phone, "login")
    verify = [r for r in bank.get("/telemetry/requests").json() if r["route"] == "/zkp/login/respond"][-1]
    detail = bank.get(f"/telemetry/requests/{verify['id']}").json()
    kinds = {event["kind"] for event in detail["events"]}
    assert {"verificacion", "acceso"} <= kinds and verify["tags"]["user"] == ANA and "session" in verify["tags"]
    account = bank.get("/bank/accounts").json()[0]
    assert account["devices"][0]["device"] == "celular de Ana"
