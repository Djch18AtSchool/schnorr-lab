"""Banco de pruebas del experimento de comparación: escenarios, red medida y flujos (C5).

Cada escenario arranca un banco real (api.create_app) en el mismo proceso y ejecuta los pasos
del celular de su mecanismo (mechanisms.registry) a través de un canal que mide cada mensaje:
así todos los mecanismos pasan por la misma pila (JSON, validación, auditoría, eventos) y por
el mismo backend aritmético. Los bytes son los de los cuerpos JSON tal como viajaron.
"""

import time
from dataclasses import dataclass, field
from typing import Any

from fastapi.testclient import TestClient

from api.app import create_app
from mechanisms.base import ClientMechanism, Exchange, FlowContext
from mechanisms.registry import create_clients

DEFAULT_BANK_GROUP = "toy"           # el grupo solo afecta al ZKP; los demás lo ignoran
TOTP_START_TIME = 1_700_000_000.0
TOTP_STEP_SECONDS = 30
ACCEPTED = "aceptado"


@dataclass(frozen=True)
class Scenario:
    """Un mecanismo en una configuración concreta (el ZKP, además, con un grupo y un flujo)."""

    key: str
    label: str
    mechanism: str
    group: str | None = None
    login_flow: str = "login"
    security_bits: str = "—"


SCENARIOS = (
    Scenario("password", "Contraseña (Argon2id)", "password"),
    Scenario("totp", "Contraseña + TOTP", "totp"),
    Scenario("srp", "SRP-6a (2048 bits)", "srp", security_bits="112"),
    Scenario("zkp-rfc-2048", "ZKP Schnorr · rfc-2048", "zkp", "rfc-2048", security_bits="112"),
    Scenario("zkp-schnorr-2048", "ZKP Schnorr · schnorr-2048", "zkp", "schnorr-2048", security_bits="112"),
    Scenario("zkp-nizk-schnorr-2048", "ZKP Fiat-Shamir · schnorr-2048", "zkp", "schnorr-2048", "login_nizk",
             security_bits="112"),
)
SCENARIOS_BY_KEY = {scenario.key: scenario for scenario in SCENARIOS}


@dataclass(frozen=True)
class NetworkRecord:
    """Un mensaje HTTP medido: ruta, estado, cuerpos y su tamaño en bytes."""

    method: str
    path: str
    status: int
    request_body: Any
    response_body: Any
    sent_bytes: int
    received_bytes: int


class MeasuringGateway:
    """Canal del celular al banco (contrato Gateway) que guarda cada mensaje con su tamaño. Cubre C5."""

    def __init__(self, http: TestClient) -> None:
        self._http = http
        self.records: list[NetworkRecord] = []

    def request(self, method: str, path: str, body: dict[str, Any] | None = None,
                correlation_id: str | None = None, mechanism: str | None = None) -> Exchange:
        start = time.perf_counter()
        response = self._http.request(method, path, json=body)
        elapsed_ms = (time.perf_counter() - start) * 1000
        payload = response.json()
        self.records.append(NetworkRecord(method, path, response.status_code, body, payload,
                                          len(response.request.content), len(response.content)))
        return Exchange(method, path, response.status_code, body, payload, elapsed_ms, correlation_id)

    def take(self) -> list[NetworkRecord]:
        """Devuelve los mensajes guardados y empieza una lista nueva."""
        records, self.records = self.records, []
        return records


class SteppingClock:
    """Reloj compartido por banco y celular en TOTP: avanza 30 s entre inicios de sesión."""

    def __init__(self, now: float = TOTP_START_TIME) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float = TOTP_STEP_SECONDS) -> None:
        self.now += seconds


@dataclass
class Lab:
    """Un banco y un celular de un escenario, con su wallet y el reloj de TOTP."""

    scenario: Scenario
    bank: TestClient
    gateway: MeasuringGateway
    client: ClientMechanism
    clock: SteppingClock
    wallet: dict[tuple[str, str], Any] = field(default_factory=dict)

    @property
    def server(self) -> Any:
        return self.bank.app.state.bank.servers[self.scenario.mechanism]


def create_lab(scenario: Scenario) -> Lab:
    """Banco nuevo en el grupo del escenario y la parte del celular de su mecanismo. Cubre C5."""
    bank = TestClient(create_app(scenario.group or DEFAULT_BANK_GROUP))
    client = create_clients()[scenario.mechanism]
    lab = Lab(scenario, bank, MeasuringGateway(bank), client, SteppingClock())
    if hasattr(client, "clock"):
        client.clock = lab.clock
        lab.server.clock = lab.clock
    return lab


@dataclass(frozen=True)
class FlowRun:
    """Un flujo ejecutado: sus mensajes y la duración de cada paso (segundos, time.perf_counter)."""

    records: list[NetworkRecord]
    durations: tuple[tuple[str, float], ...]

    @property
    def total_s(self) -> float:
        return sum(seconds for _, seconds in self.durations)

    @property
    def without_params_s(self) -> float:
        """Sin el paso «params» (descargar y validar los parámetros públicos, que se pueden cachear)."""
        return sum(seconds for step_id, seconds in self.durations if step_id != PARAMS_STEP_ID)


PARAMS_STEP_ID = "params"


def run_flow(lab: Lab, flow_id: str, user_id: str) -> FlowRun:
    """Ejecuta un flujo completo midiendo cada paso; RuntimeError si no termina aceptado. Cubre C5."""
    if lab.scenario.mechanism == "totp" and flow_id != "register":
        lab.clock.advance()                     # un código nuevo: el anterior ya está usado
    ctx = FlowContext(user_id=user_id, gateway=lab.gateway, wallet=lab.wallet)
    outcome, message, durations = "", "", []
    for step in lab.client.steps(flow_id):
        start = time.perf_counter()
        result = step.action(ctx)
        durations.append((step.info.id, time.perf_counter() - start))
        outcome, message = result.outcome, result.message
        if result.finished:
            break
    records = lab.gateway.take()
    if outcome != ACCEPTED:
        raise RuntimeError(f"{lab.scenario.key}: el flujo {flow_id} terminó «{outcome}»: {message}")
    return FlowRun(records, tuple(durations))


SECRET_FIELDS = {"password": ("password",), "totp": ("password", "totp_secret"), "srp": ("password",),
                 "zkp": ("x",)}
SECRET_LABELS = {"password": "contraseña", "totp_secret": "secreto TOTP K", "x": "clave secreta x"}


def secret_values(lab: Lab, user_id: str) -> dict[str, str]:
    """Los secretos del celular para esa cuenta (contraseña, K o x), como texto. Cubre C5."""
    secret = lab.wallet[(lab.scenario.mechanism, user_id)]
    return {SECRET_LABELS[name]: str(getattr(secret, name)) for name in SECRET_FIELDS[lab.scenario.mechanism]}
