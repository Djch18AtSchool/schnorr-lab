"""Pruebas de la observabilidad del banco: telemetría, alertas deducidas, trazas de código y cuentas (R11)."""

import pytest
from fastapi.testclient import TestClient

from api.app import create_app
from infra.spans import code_span
from protocol.bank import Bank
from tests.helpers import USER_ID

ANA = {"X-Device": "celular de Ana", "X-Forwarded-For": "192.168.1.23", "User-Agent": "BancoLab-iOS/3.2"}
EVE = {"X-Device": "laptop de Eve", "X-Forwarded-For": "192.168.1.66", "User-Agent": "python-httpx/0.28"}
X, R = 7, 5          # ejemplo del escrito: y = 8, t = 12


@pytest.fixture
def bank() -> TestClient:
    return TestClient(create_app("toy"))


def _register(bank: TestClient) -> None:
    assert bank.post("/zkp/register", json={"user_id": USER_ID, "y": "8"}, headers=ANA).status_code == 201


def _login(bank: TestClient, forged: bool = False, correlation: str = "acto:1") -> dict:
    """Inicio de sesión del ejemplo; forged=True envía s + 1 (inválida sea cual sea c)."""
    commit = bank.post("/zkp/login/commit", json={"user_id": USER_ID, "t": "12"},
                       headers={**ANA, "X-Correlation-Id": correlation}).json()
    s = (R + int(commit["c"]) * X + (1 if forged else 0)) % 11
    body = {"session_id": commit["session_id"], "s": str(s)}
    return {"body": body, "verdict": bank.post("/zkp/login/respond", json=body, headers=ANA).json()}


@pytest.mark.req("R11")
def test_cada_peticion_queda_registrada_con_origen_dispositivo_y_senal(bank):
    _register(bank)
    _login(bank)
    records = bank.get("/telemetry/requests").json()
    assert [r["route"] for r in records] == ["/zkp/register", "/zkp/login/commit", "/zkp/login/respond"]
    assert {r["client"] for r in records} == {"192.168.1.23"}
    assert {r["device"] for r in records} == {"celular de Ana"}
    assert [r["signal"] for r in records] == ["account.created", "auth.challenge", "auth.ok"]
    assert records[1]["correlation_id"] == "acto:1"


@pytest.mark.req("R11")
def test_la_consola_no_se_observa_a_si_misma(bank):
    bank.get("/telemetry/summary")
    bank.get("/events")
    assert bank.get("/telemetry/requests").json() == []


@pytest.mark.req("R10")
def test_repetir_la_respuesta_desde_otro_dispositivo_genera_una_alerta_con_evidencia(bank):
    _register(bank)
    captured = _login(bank)["body"]
    replay = bank.post("/zkp/login/respond", json=captured, headers=EVE).json()
    assert replay["reason"] == "Sesión inválida"
    alert = bank.get("/telemetry/alerts").json()[-1]
    assert alert["kind"] == "replay" and alert["severity"] == "alta" and alert["user_id"] == USER_ID
    assert "192.168.1.23" in alert["detail"] and "192.168.1.66" in alert["detail"]
    evidence = {r["id"]: r for r in bank.get("/telemetry/requests").json()}
    assert [evidence[i]["device"] for i in alert["evidence"]] == ["celular de Ana", "laptop de Eve"]


@pytest.mark.req("R9")
def test_tres_pruebas_invalidas_bloquean_y_la_alerta_lo_explica(bank):
    _register(bank)
    for _ in range(3):
        assert not _login(bank, forged=True)["verdict"]["accepted"]
    kinds = [alert["kind"] for alert in bank.get("/telemetry/alerts").json()]
    assert kinds.count("invalid_proof") == 3 and kinds[-1] == "lockout"
    account = bank.get("/bank/accounts").json()[0]
    assert account["status"] == "bloqueada" and account["attempts_left"] == 0
    assert bank.get("/telemetry/summary").json()["totals"]["locked_accounts"] == 1


@pytest.mark.req("R11")
def test_resumen_con_totales_series_y_rutas(bank):
    _register(bank)
    _login(bank)
    _login(bank, forged=True)
    summary = bank.get("/telemetry/summary?window=300&bucket=30").json()
    assert summary["totals"]["auth_ok"] == 1 and summary["totals"]["auth_rejected"] == 1
    assert summary["requests_per_min"] == 5
    assert sum(point["ok"] + point["rejected"] + point["other"] for point in summary["series"]) == 5
    assert {route["route"] for route in summary["routes"]} == {"/zkp/register", "/zkp/login/commit",
                                                                "/zkp/login/respond"}


@pytest.mark.req("R11")
def test_los_eventos_del_banco_traen_traza_de_codigo_y_calculos(bank):
    _register(bank)
    _login(bank)
    events = bank.get("/events").json()
    verdict = next(e for e in events if e["kind"] == "verificacion")
    span = verdict["data"]["span"]
    assert span["function"] == "Bank._decide" and span["tone"] == "ok"
    highlighted = [line["text"] for line in span["lines"] if line["n"] in span["highlight"]]
    assert 'if details["gs"] == details["tyc"]' in highlighted[0]
    assert any("= t ✔" in line for line in verdict["data"]["math"])
    access = [e for e in events if e["kind"] == "acceso"]
    assert access[1]["correlation_id"] == "acto:1" and access[1]["data"]["device"] == "celular de Ana"


@pytest.mark.req("R11")
def test_la_traza_omite_el_docstring_y_falla_si_el_texto_no_existe():
    span = code_span(Bank.verify, ("Reason.INVALID_SESSION",), "bad")
    numbers = [line["n"] for line in span["lines"]]
    assert numbers[1] - numbers[0] > 1                    # salto: el docstring no se muestra
    with pytest.raises(ValueError):
        code_span(Bank.verify, ("esto no está en la función",))


@pytest.mark.req("R2")
def test_las_cuentas_muestran_solo_y_y_la_actividad_observada(bank):
    _register(bank)
    _login(bank)
    account = bank.get("/bank/accounts").json()[0]
    assert account["stored"] == {"y": "8"} and account["status"] == "activa"
    assert account["created_at"] is not None and account["last_login_at"] is not None


@pytest.mark.req("R11")
def test_cuerpo_mal_formado_genera_alerta_baja(bank):
    bank.post("/zkp/login/commit", json={"user_id": USER_ID, "t": "12", "x": "7"}, headers=EVE)
    alert = bank.get("/telemetry/alerts").json()[-1]
    assert alert["kind"] == "malformed" and alert["severity"] == "baja"
