"""Auxiliares de las pruebas de los mecanismos alternativos (contraseña, TOTP, SRP)."""

from fastapi.testclient import TestClient

from api.app import create_app
from client_app.app import create_client_app
from mechanisms.base import FlowContext, StepError, StepResult

USER = "cliente01"


def make_lab(group: str = "toy") -> tuple[TestClient, TestClient]:
    """Banco y celular en el mismo proceso: el celular habla con el banco por un TestClient."""
    bank = TestClient(create_app(group))
    phone = TestClient(create_client_app(bank_url="http://testserver", bank_http=bank))
    return bank, phone


def _record(result: StepResult | None, error: str | None) -> dict:
    if result is None:
        return {"status": "error", "values": {}, "exchange": None, "message": error or ""}
    return {"status": result.outcome, "values": dict(result.values), "message": result.message,
            "exchange": result.exchange.to_json() if result.exchange else None}


def run_flow(phone: TestClient, mechanism: str, flow: str, user: str = USER) -> dict:
    """Ejecuta en el celular todos los pasos de un flujo del mecanismo, como lo hace un acto del Escenario."""
    state = phone.app.state.phone
    context = FlowContext(user_id=user, gateway=state.gateway, wallet=state.wallet)
    steps, status = [], "aceptado"
    for step in state.mechanisms[mechanism].steps(flow):
        try:
            result, error = step.action(context), None
        except StepError as exc:
            result, error = None, str(exc)
        steps.append({**vars(step.info), "record": _record(result, error)})
        if result is None:
            status = "error"
            break
        if result.finished:
            status = "rechazado" if result.outcome == "rechazado" else "aceptado"
            break
    return {"status": status, "steps": steps}


def sent_bodies(flow: dict) -> list[dict]:
    """Cuerpos que el celular envió al banco durante un flujo, en orden."""
    return [step["record"]["exchange"]["request_body"] for step in flow["steps"]
            if step["record"] and step["record"]["exchange"] and step["record"]["exchange"]["request_body"]]


def bank_server(bank: TestClient, mechanism: str):
    """La parte del banco de un mecanismo (para fijar el reloj en las pruebas)."""
    return bank.app.state.bank.servers[mechanism]


def phone_mechanism(phone: TestClient, mechanism: str):
    """La parte del celular de un mecanismo (para fijar el reloj en las pruebas)."""
    return phone.app.state.phone.mechanisms[mechanism]


class FakeClock:
    """Reloj fijo que la prueba adelanta a mano (para TOTP)."""

    def __init__(self, now: float = 1_700_000_000.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds
