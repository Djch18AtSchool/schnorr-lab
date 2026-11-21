"""Auxiliares de las pruebas de los mecanismos alternativos (contraseña, TOTP, SRP)."""

from fastapi.testclient import TestClient

from api.app import create_app
from client_app.app import create_client_app

USER = "cliente01"


def make_lab(group: str = "toy") -> tuple[TestClient, TestClient]:
    """Banco y celular en el mismo proceso: el celular habla con el banco por un TestClient."""
    bank = TestClient(create_app(group))
    phone = TestClient(create_client_app(bank_url="http://testserver", bank_http=bank))
    return bank, phone


def run_flow(phone: TestClient, mechanism: str, flow: str, user: str = USER) -> dict:
    """Inicia un flujo en el celular y ejecuta todos sus pasos."""
    started = phone.post("/api/flows", json={"mechanism": mechanism, "flow": flow, "user_id": user})
    assert started.status_code == 201, started.text
    return phone.post(f"/api/flows/{started.json()['id']}/run").json()


def sent_bodies(flow: dict) -> list[dict]:
    """Cuerpos que el celular envió al banco durante un flujo, en orden."""
    return [step["record"]["exchange"]["request_body"] for step in flow["steps"]
            if step["record"] and step["record"]["exchange"] and step["record"]["exchange"]["request_body"]]


def bank_server(bank: TestClient, mechanism: str):
    """La parte del banco de un mecanismo (para fijar el reloj en las pruebas)."""
    return bank.app.state.bank.servers[mechanism]


def phone_mechanism(phone: TestClient, mechanism: str):
    """La parte del celular de un mecanismo (para fijar el reloj en las pruebas)."""
    return phone.app.state.phone.manager.mechanisms[mechanism]
