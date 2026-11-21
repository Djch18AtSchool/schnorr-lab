"""Ejecución de los actos: preparación, paso a paso, registro de lo ocurrido y eventos (R11).

ActManager prepara cada acto desde un estado conocido (banco reiniciado y, si el acto lo pide,
Ana ya registrada) para que la demostración sea repetible, y guarda las ejecuciones en curso.
"""

import secrets
import threading
import time
from collections import OrderedDict
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

from client_app.acts.model import ActContext, ActDefinition, ActStep, StepOutcome
from client_app.gateway import BankGateway
from infra.events import EventLog
from mechanisms.base import ClientMechanism, FlowContext, StepError

RUNNING, ACCEPTED, REJECTED, FAILED = "en_curso", "aceptado", "rechazado", "error"
MAX_RUNS = 50
RUN_ID_BYTES = 5
DEFAULT_USER = "ana"
SETUP_SUFFIX = "preparacion"


class ActFinishedError(Exception):
    """Se pidió otro paso a un acto que ya terminó."""


@dataclass(frozen=True)
class ActRecord:
    """Lo que ocurrió al ejecutar un paso del acto."""

    index: int
    status: str                 # ok | aceptado | rechazado | error
    outcome: StepOutcome | None
    error: str | None
    duration_ms: float
    correlation_id: str
    intercepted: bool

    def to_json(self) -> dict[str, Any]:
        out = self.outcome or StepOutcome()
        return {"index": self.index, "status": self.status, "values": dict(out.values), "math": list(out.math),
                "exchanges": [exchange.to_json() for exchange in out.exchanges],
                "terminal": [vars(line).copy() for line in out.terminal], "intercepted": self.intercepted,
                "message": out.message or (self.error or ""), "duration_ms": self.duration_ms,
                "correlation_id": self.correlation_id}


class ActRun:
    """Un acto en curso. Los pasos de un segmento que termina antes (p. ej. un rechazo) se omiten."""

    def __init__(self, run_id: str, definition: ActDefinition, context: ActContext, group: str,
                 events: EventLog) -> None:
        self.id = run_id
        self.definition = definition
        self.context = context
        self.group = group
        self._events = events
        self.steps: list[ActStep] = definition.build()
        self.cast = definition.cast(self.steps)
        self.records: list[ActRecord] = []
        self.status = RUNNING

    @property
    def finished(self) -> bool:
        return self.status != RUNNING

    def next(self) -> ActRecord:
        """Ejecuta el siguiente paso de verdad (cálculo, mensaje al banco o acción de Eve). Cubre R11."""
        if self.finished:
            raise ActFinishedError(f"El acto {self.id} ya terminó ({self.status}).")
        index = len(self.records)
        step = self.steps[index]
        self.context.correlation_id = f"{self.id}:{index}"
        start = time.perf_counter()
        try:
            outcome, error = step.run(self.context), None
        except StepError as exc:
            outcome, error = None, str(exc)
        intercepted = bool(outcome and any(self.context.intercepted(ex) for ex in outcome.exchanges))
        record = ActRecord(index, FAILED if outcome is None else outcome.outcome, outcome, error,
                           round((time.perf_counter() - start) * 1000, 2), self.context.correlation_id, intercepted)
        self.records.append(record)
        if outcome is not None and outcome.finished:
            self._skip_rest_of(step.segment, index)
        self._update_status(record)
        self._publish(step, record)
        return record

    def run_all(self) -> None:
        while not self.finished:
            self.next()

    def _skip_rest_of(self, segment: str, index: int) -> None:
        self.steps = self.steps[:index + 1] + [s for s in self.steps[index + 1:] if s.segment != segment]

    def _update_status(self, record: ActRecord) -> None:
        if record.status == FAILED:
            self.status = FAILED
        elif len(self.records) == len(self.steps):
            self.status = REJECTED if record.status == REJECTED else ACCEPTED

    def _publish(self, step: ActStep, record: ActRecord) -> None:
        source = "atacante" if step.info.actor == "eve" else "cliente"
        self._events.publish(source, "acto", f"{self.definition.title} · {step.info.title}",
                             self.definition.mechanism, {"act": self.id, **record.to_json()}, record.correlation_id)

    def to_json(self) -> dict[str, Any]:
        steps = [{**vars(step.info), "record": self.records[i].to_json() if i < len(self.records) else None}
                 for i, step in enumerate(self.steps)]
        return {"id": self.id, "act": self.definition.id, "title": self.definition.title,
                "user_id": self.context.user_id, "group": self.group, "status": self.status,
                "next_index": len(self.records), "cast": self.cast, "steps": steps}


class ActManager:
    """Catálogo, preparación y ejecuciones de los actos. Cubre R10 y R11."""

    def __init__(self, acts: Mapping[str, ActDefinition], mechanisms: Mapping[str, ClientMechanism],
                 ana: BankGateway, eve: BankGateway, support: BankGateway, wallet: dict, events: EventLog,
                 active_group: Callable[[], str]) -> None:
        self.acts = dict(acts)
        self._mechanisms = mechanisms
        self._ana, self._eve, self._support, self._wallet = ana, eve, support, wallet
        self._events = events
        self._active_group = active_group
        self._runs: OrderedDict[str, ActRun] = OrderedDict()
        self.lock = threading.Lock()

    def catalog(self) -> list[dict[str, Any]]:
        return [act.to_json() for act in self.acts.values()]

    def start(self, act_id: str, user_id: str = DEFAULT_USER) -> ActRun:
        """Deja la cuenta de Ana como el acto la necesita, sin reiniciar el banco, y el acto listo. Cubre R11.

        Como lo haría un banco real: si hace falta, soporte desbloquea o da de baja la cuenta y Ana se
        registra de nuevo. El banco conserva su historial; solo cambiar de grupo lo reinicia.

        ValueError si el acto no existe o no está disponible; StepError si la preparación falla.
        """
        definition = self.acts.get(act_id)
        if definition is None or not definition.available:
            raise ValueError(f"Acto desconocido o no disponible: «{act_id}».")
        run_id = secrets.token_hex(RUN_ID_BYTES)
        self._prepare(definition, user_id, f"{run_id}:{SETUP_SUFFIX}")
        group = self._active_group()
        context = ActContext(user_id=user_id, ana_gateway=self._ana, eve_gateway=self._eve, wallet=self._wallet,
                             defects=dict(definition.defects))
        run = ActRun(run_id, definition, context, group, self._events)
        self._runs[run_id] = run
        while len(self._runs) > MAX_RUNS:
            self._runs.popitem(last=False)
        return run

    def _prepare(self, definition: ActDefinition, user_id: str, correlation_id: str) -> None:
        mechanism_id = definition.mechanism
        accounts = self._support.request("GET", "/bank/accounts").response_body
        account = next((a for a in accounts if a["mechanism"] == mechanism_id and a["user_id"] == user_id), None) \
            if isinstance(accounts, list) else None
        secret = self._wallet.get((mechanism_id, user_id))
        matches = getattr(self._mechanisms[mechanism_id], "matches", lambda _s, _a: True)
        usable = account is not None and secret is not None and matches(secret, account["stored"])
        if definition.setup == "registered" and usable:
            if account["status"] == "bloqueada":
                self._admin("POST", f"/admin/accounts/{mechanism_id}/{user_id}/unlock", correlation_id)
            return
        if account is not None:
            self._admin("DELETE", f"/admin/accounts/{mechanism_id}/{user_id}", correlation_id)
        self._wallet.pop((mechanism_id, user_id), None)
        if definition.setup == "registered":
            self._register(mechanism_id, user_id, correlation_id)

    def _admin(self, method: str, path: str, correlation_id: str) -> None:
        exchange = self._support.request(method, path, correlation_id=correlation_id)
        if exchange.status != 200:
            raise StepError(f"Soporte no pudo preparar la cuenta: {exchange.response_body}")

    def _register(self, mechanism_id: str, user_id: str, correlation_id: str) -> None:
        """Crea la cuenta de Ana en silencio, con los mismos pasos del flujo de registro."""
        context = FlowContext(user_id=user_id, gateway=self._ana, wallet=self._wallet,
                              correlation_id=correlation_id)
        for step in self._mechanisms[mechanism_id].steps("register"):
            result = step.action(context)
            if result.finished and result.outcome != ACCEPTED:
                raise StepError(f"No se pudo preparar la cuenta de {user_id}: {result.message}")

    def get(self, run_id: str) -> ActRun:
        """KeyError si no existe."""
        return self._runs[run_id]

    def clear(self) -> None:
        self._runs.clear()
