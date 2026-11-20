"""Ejecución paso a paso de los flujos de cualquier mecanismo (R11).

Un Flow toma los pasos que declara el mecanismo (por ejemplo, el inicio de sesión del ZKP) y
los ejecuta uno por vez, cuando la interfaz lo pide. Así se puede recorrer el protocolo en
vivo, explicando cada cálculo y cada mensaje, sin que este módulo sepa nada del ZKP.
"""

import secrets
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any

from infra.events import EventLog
from mechanisms.base import ClientMechanism, ClientStep, FlowContext, Gateway, StepError, StepResult

MAX_FLOWS = 200
FLOW_ID_BYTES = 6
RUNNING, ACCEPTED, REJECTED, FAILED = "en_curso", "aceptado", "rechazado", "error"


class FlowFinishedError(Exception):
    """Se pidió otro paso a un flujo que ya terminó."""


@dataclass(frozen=True)
class StepRecord:
    """Lo que ocurrió al ejecutar un paso."""

    index: int
    status: str                  # ok | aceptado | rechazado | error
    result: StepResult | None
    error: str | None
    duration_ms: float
    correlation_id: str

    def to_json(self) -> dict[str, Any]:
        """Representación serializable para la interfaz. Cubre R11."""
        result = self.result
        return {
            "index": self.index,
            "status": self.status,
            "values": dict(result.values) if result else {},
            "exchange": result.exchange.to_json() if result and result.exchange else None,
            "trace": list(result.trace) if result else [],
            "message": (result.message if result else "") or (self.error or ""),
            "duration_ms": self.duration_ms,
            "correlation_id": self.correlation_id,
        }


class Flow:
    """Un flujo en curso (registro, inicio de sesión, ...) de un usuario con un mecanismo. Cubre R11."""

    def __init__(self, flow_id: str, mechanism: ClientMechanism, name: str, context: FlowContext,
                 events: EventLog) -> None:
        self.id = flow_id
        self.mechanism = mechanism
        self.name = name
        self.context = context
        self._events = events
        self._steps: list[ClientStep] = mechanism.steps(name)
        self.records: list[StepRecord] = []
        self.status = RUNNING

    @property
    def finished(self) -> bool:
        return self.status != RUNNING

    def next(self) -> StepRecord:
        """Ejecuta el siguiente paso y actualiza el estado del flujo. Cubre R11."""
        if self.finished:
            raise FlowFinishedError(f"El flujo {self.id} ya terminó ({self.status}).")
        index = len(self.records)
        step = self._steps[index]
        self.context.correlation_id = f"{self.id}:{index}"
        start = time.perf_counter()
        try:
            result, error = step.action(self.context), None
        except StepError as exc:
            result, error = None, str(exc)
        elapsed = round((time.perf_counter() - start) * 1000, 2)
        record = StepRecord(index, self._step_status(result, error), result, error, elapsed,
                            self.context.correlation_id)
        self.records.append(record)
        self._update_status(record, index)
        self._publish(step, record)
        return record

    def run_all(self) -> list[StepRecord]:
        """Ejecuta todos los pasos que faltan. Cubre R11."""
        while not self.finished:
            self.next()
        return self.records

    @staticmethod
    def _step_status(result: StepResult | None, error: str | None) -> str:
        if error is not None or result is None:
            return FAILED
        return result.outcome

    def _update_status(self, record: StepRecord, index: int) -> None:
        if record.status == FAILED:
            self.status = FAILED
        elif record.result is not None and record.result.finished:
            self.status = REJECTED if record.status == REJECTED else ACCEPTED
        elif index == len(self._steps) - 1:
            self.status = ACCEPTED

    def _publish(self, step: ClientStep, record: StepRecord) -> None:
        kind = "error" if record.status == FAILED else "paso"
        self._events.publish("cliente", kind, f"Paso {record.index + 1}: {step.info.title}",
                             self.mechanism.info.id, {**record.to_json(), "actor": step.info.actor},
                             record.correlation_id)

    def to_json(self) -> dict[str, Any]:
        """El flujo con todos sus pasos (los ejecutados incluyen su resultado). Cubre R11."""
        info = self.mechanism.info.flow(self.name)
        steps = [{**vars(step.info), "record": self.records[i].to_json() if i < len(self.records) else None}
                 for i, step in enumerate(self._steps)]
        return {"id": self.id, "mechanism": self.mechanism.info.id, "flow": self.name, "title": info.title,
                "user_id": self.context.user_id, "status": self.status, "next_index": len(self.records),
                "steps": steps}


class FlowManager:
    """Crea y guarda los flujos del celular y su wallet de secretos locales. Cubre R11."""

    def __init__(self, mechanisms: dict[str, ClientMechanism], gateway: Gateway, events: EventLog) -> None:
        self.mechanisms = mechanisms
        self.wallet: dict[tuple[str, str], Any] = {}
        self._gateway = gateway
        self._events = events
        self._flows: OrderedDict[str, Flow] = OrderedDict()
        self.lock = threading.Lock()

    def start(self, mechanism_id: str, flow_name: str, user_id: str, trace: bool = False) -> Flow:
        """Crea un flujo nuevo; ValueError si el mecanismo o el flujo no existen. Cubre R11."""
        mechanism = self.mechanisms.get(mechanism_id)
        if mechanism is None:
            raise ValueError(f"Mecanismo desconocido: «{mechanism_id}».")
        context = FlowContext(user_id=user_id, gateway=self._gateway, wallet=self.wallet, trace_enabled=trace)
        flow = Flow(secrets.token_hex(FLOW_ID_BYTES), mechanism, flow_name, context, self._events)
        self._flows[flow.id] = flow
        while len(self._flows) > MAX_FLOWS:
            self._flows.popitem(last=False)
        return flow

    def get(self, flow_id: str) -> Flow:
        """El flujo con ese identificador; KeyError si no existe. Cubre R11."""
        return self._flows[flow_id]

    def wallet_view(self) -> list[dict[str, Any]]:
        """Lo que el celular tiene guardado por cuenta (solo se muestra en su propia pantalla). Cubre R2."""
        return [{"mechanism": mechanism_id, "user_id": user_id,
                 "secret": self.mechanisms[mechanism_id].describe_secret(secret)}
                for (mechanism_id, user_id), secret in self.wallet.items()]

    def reset(self) -> None:
        """Olvida flujos y secretos (cuando el banco se reinicia). Cubre R11."""
        self.wallet.clear()
        self._flows.clear()
