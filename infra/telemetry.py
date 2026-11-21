"""Telemetría del banco: registro de peticiones, métricas y alertas deducidas (R11).

El banco no sabe qué «acto» se está simulando: solo observa las peticiones que recibe. Cada
mecanismo emite señales genéricas mientras atiende una petición (auth.ok, auth.rejected,
auth.replay, ...) y este módulo las une a la petición, calcula métricas y deduce alertas con
reglas que no dependen de ningún mecanismo. Es lo que muestra la Consola del banco.
"""

import math
import threading
import time
from collections import deque
from collections.abc import Callable, Mapping
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any

from infra.events import EventLog

MAX_REQUESTS = 5_000
MAX_ALERTS = 500
DEFAULT_WINDOW_S = 900
DEFAULT_BUCKET_S = 30
SECONDS_PER_MINUTE = 60
LOCKOUT_EVIDENCE = 3

OK_SIGNALS = frozenset({"auth.ok"})
REJECTED_SIGNALS = frozenset({"auth.rejected", "auth.replay", "auth.stale", "auth.lockout", "auth.locked_attempt"})


@dataclass(frozen=True)
class Signal:
    """Algo que el mecanismo concluyó al atender una petición (sin datos secretos)."""

    name: str
    user_id: str | None = None
    mechanism: str | None = None
    evidence: Mapping[str, str] = field(default_factory=dict)   # campo del cuerpo → valor repetido


@dataclass
class RequestScope:
    """Lo que se acumula mientras se atiende una petición (vive en un ContextVar)."""

    signals: list[Signal] = field(default_factory=list)


current_scope: ContextVar[RequestScope | None] = ContextVar("current_scope", default=None)


@dataclass(frozen=True)
class RequestRecord:
    """Una petición atendida, tal como la ve el banco."""

    id: int
    timestamp: float
    method: str
    path: str
    route: str
    status: int
    duration_ms: float
    client: str
    user_agent: str
    device: str
    correlation_id: str | None
    mechanism: str | None
    request_body: Any
    response_body: Any
    signals: tuple[Signal, ...] = ()

    @property
    def signal(self) -> str | None:
        return self.signals[-1].name if self.signals else None

    @property
    def outcome(self) -> str:
        """ok | rejected | error | other, para las series y los totales."""
        names = {s.name for s in self.signals}
        if names & OK_SIGNALS:
            return "ok"
        if names & REJECTED_SIGNALS:
            return "rejected"
        return "error" if self.status >= 400 else "other"

    def to_json(self) -> dict[str, Any]:
        return {"id": self.id, "timestamp": self.timestamp, "method": self.method, "path": self.path,
                "route": self.route, "status": self.status, "duration_ms": self.duration_ms,
                "client": self.client, "user_agent": self.user_agent, "device": self.device,
                "correlation_id": self.correlation_id, "mechanism": self.mechanism,
                "request_body": self.request_body, "response_body": self.response_body, "signal": self.signal}


@dataclass(frozen=True)
class AlertRecord:
    id: int
    timestamp: float
    severity: str               # alta | media | baja
    kind: str
    title: str
    detail: str
    user_id: str | None
    evidence: tuple[int, ...]

    def to_json(self) -> dict[str, Any]:
        return {**vars(self), "evidence": list(self.evidence)}


def percentile(values: list[float], fraction: float) -> float:
    """Percentil por el método del rango más cercano (0 si no hay datos)."""
    if not values:
        return 0.0
    ordered = sorted(values)
    rank = max(1, math.ceil(fraction * len(ordered)))
    return round(ordered[rank - 1], 2)


def signal(name: str, user_id: str | None = None, mechanism: str | None = None,
           evidence: Mapping[str, str] | None = None) -> None:
    """Asocia una señal a la petición en curso (no hace nada fuera de una petición). Cubre R11."""
    scope = current_scope.get()
    if scope is not None:
        scope.signals.append(Signal(name, user_id, mechanism, dict(evidence or {})))


class Telemetry:
    """Peticiones recientes, métricas por ventana y alertas deducidas. Segura entre hilos. Cubre R11."""

    def __init__(self, events: EventLog, clock: Callable[[], float] = time.time) -> None:
        self._events = events
        self._clock = clock
        self._lock = threading.Lock()
        self._requests: deque[RequestRecord] = deque(maxlen=MAX_REQUESTS)
        self._alerts: deque[AlertRecord] = deque(maxlen=MAX_ALERTS)
        self._next_request = 1
        self._next_alert = 1
        self._first_seen: dict[tuple[str, str], float] = {}
        self._last_login: dict[tuple[str, str], float] = {}
        self.started_at = clock()
        self.locked_accounts: Callable[[], int] = lambda: 0

    # ------------------------------------------------------------ registro

    def record(self, **fields: Any) -> RequestRecord:
        """Guarda una petición atendida, publica su línea de acceso y deduce alertas. Cubre R11."""
        with self._lock:
            record = RequestRecord(id=self._next_request, timestamp=self._clock(), **fields)
            self._next_request += 1
            self._requests.append(record)
            self._track_accounts(record)
            alerts = [self._store_alert(draft) for draft in deduce_alerts(record, list(self._requests))]
        self._publish_access(record)
        for alert in alerts:
            self._events.publish("banco", "alerta", alert.title, record.mechanism, alert.to_json(),
                                 record.correlation_id)
        return record

    def _track_accounts(self, record: RequestRecord) -> None:
        for item in record.signals:
            if item.user_id is None or item.mechanism is None:
                continue
            key = (item.mechanism, item.user_id)
            if item.name == "account.created":
                self._first_seen[key] = record.timestamp
            elif item.name == "auth.ok":
                self._last_login[key] = record.timestamp

    def _store_alert(self, draft: dict[str, Any]) -> AlertRecord:
        alert = AlertRecord(id=self._next_alert, timestamp=self._clock(), **draft)
        self._next_alert += 1
        self._alerts.append(alert)
        return alert

    def _publish_access(self, record: RequestRecord) -> None:
        data = {"method": record.method, "path": record.path, "status": record.status,
                "duration_ms": record.duration_ms, "client": record.client, "user_agent": record.user_agent,
                "device": record.device, "request_id": record.id}
        self._events.publish("banco", "acceso", f'"{record.method} {record.path} HTTP/1.1" {record.status}',
                             record.mechanism, data, record.correlation_id)

    # ------------------------------------------------------------ lecturas

    def requests_since(self, since: int = 0, limit: int = 500) -> list[RequestRecord]:
        with self._lock:
            return [r for r in self._requests if r.id > since][:limit]

    def alerts(self) -> list[AlertRecord]:
        with self._lock:
            return list(self._alerts)

    def account_times(self, mechanism: str, user_id: str) -> tuple[float | None, float | None]:
        """(alta, último acceso) observados por el banco para esa cuenta."""
        with self._lock:
            key = (mechanism, user_id)
            return self._first_seen.get(key), self._last_login.get(key)

    def summary(self, window_s: int = DEFAULT_WINDOW_S, bucket_s: int = DEFAULT_BUCKET_S) -> dict[str, Any]:
        """Totales, latencias, series por intervalo y estadística por ruta en la ventana. Cubre R11."""
        now = self._clock()
        with self._lock:
            recent = [r for r in self._requests if r.timestamp >= now - window_s]
        durations = [r.duration_ms for r in recent]
        last_minute = [r for r in recent if r.timestamp >= now - SECONDS_PER_MINUTE]
        signals: dict[str, int] = {}
        for record in recent:
            for item in record.signals:
                signals[item.name] = signals.get(item.name, 0) + 1
        return {
            "now": now, "started_at": self.started_at, "window_s": window_s, "bucket_s": bucket_s,
            "requests_per_min": len(last_minute), "p50_ms": percentile(durations, 0.5),
            "p95_ms": percentile(durations, 0.95), "totals": self._totals(recent), "signals": signals,
            "series": _series(recent, now, window_s, bucket_s), "routes": _routes(recent),
        }

    def _totals(self, recent: list[RequestRecord]) -> dict[str, int]:
        outcomes = [r.outcome for r in recent]
        return {"requests": len(recent), "auth_ok": outcomes.count("ok"), "auth_rejected": outcomes.count("rejected"),
                "locked_accounts": self.locked_accounts(),
                "errors_4xx": sum(1 for r in recent if 400 <= r.status < 500),
                "errors_5xx": sum(1 for r in recent if r.status >= 500)}


def _series(recent: list[RequestRecord], now: float, window_s: int, bucket_s: int) -> list[dict[str, Any]]:
    start = math.floor((now - window_s) / bucket_s) * bucket_s
    count = math.ceil((now - start) / bucket_s)
    buckets: list[list[RequestRecord]] = [[] for _ in range(count)]
    for record in recent:
        index = min(count - 1, int((record.timestamp - start) // bucket_s))
        buckets[index].append(record)
    points = []
    for index, items in enumerate(buckets):
        outcomes = [r.outcome for r in items]
        durations = [r.duration_ms for r in items]
        points.append({"t": start + index * bucket_s, "ok": outcomes.count("ok"),
                       "rejected": outcomes.count("rejected"), "other": outcomes.count("other"),
                       "error": outcomes.count("error"), "p50_ms": percentile(durations, 0.5),
                       "p95_ms": percentile(durations, 0.95)})
    return points


def _routes(recent: list[RequestRecord]) -> list[dict[str, Any]]:
    groups: dict[tuple[str, str], list[RequestRecord]] = {}
    for record in recent:
        groups.setdefault((record.method, record.route), []).append(record)
    rows = [{"method": method, "route": route, "count": len(items),
             "errors": sum(1 for r in items if r.status >= 400),
             "p50_ms": percentile([r.duration_ms for r in items], 0.5),
             "p95_ms": percentile([r.duration_ms for r in items], 0.95)}
            for (method, route), items in groups.items()]
    return sorted(rows, key=lambda row: row["count"], reverse=True)


# ---------------------------------------------------------------- reglas de alertas

def _ago(seconds: float) -> str:
    return f"{seconds:.0f} s" if seconds < SECONDS_PER_MINUTE else f"{seconds / SECONDS_PER_MINUTE:.0f} min"


def _matches(record: RequestRecord, evidence: Mapping[str, str]) -> bool:
    body = record.request_body if isinstance(record.request_body, dict) else {}
    return bool(evidence) and all(str(body.get(key)) == value for key, value in evidence.items())


def _replay_alert(record: RequestRecord, item: Signal, history: list[RequestRecord]) -> dict[str, Any]:
    earlier = [r for r in history if r.id < record.id and _matches(r, item.evidence)]
    first = earlier[0] if earlier else None
    fields = ", ".join(f"{key} {value[:8]}…" if len(value) > 10 else f"{key} {value}"
                       for key, value in item.evidence.items())
    detail = f"El mismo cuerpo ({fields}) ya había llegado"
    if first is not None:
        detail += (f" hace {_ago(record.timestamp - first.timestamp)} desde {first.client} ({first.device});"
                   f" ahora llega desde {record.client} ({record.device}).")
    else:
        detail += " antes."
    evidence = tuple(r.id for r in earlier) + (record.id,)
    return {"severity": "alta", "kind": "replay", "title": "Repetición rechazada", "detail": detail,
            "user_id": item.user_id, "evidence": evidence}


def _lockout_alert(record: RequestRecord, item: Signal, history: list[RequestRecord]) -> dict[str, Any]:
    failures = [r for r in history if r.id <= record.id and r.outcome == "rejected"
                and any(s.user_id == item.user_id for s in r.signals)][-LOCKOUT_EVIDENCE:]
    origins = ", ".join(sorted({f"{r.client} ({r.device})" for r in failures}))
    detail = (f"{len(failures)} pruebas inválidas seguidas. Origen: {origins}. "
              "La cuenta no recibe retos hasta que se reinicie el banco.")
    return {"severity": "alta", "kind": "lockout", "title": f"Cuenta bloqueada: {item.user_id}",
            "detail": detail, "user_id": item.user_id, "evidence": tuple(r.id for r in failures)}


SIMPLE_RULES: dict[str, tuple[str, str, str]] = {
    "auth.rejected": ("media", "invalid_proof", "Prueba inválida para {user}"),
    "auth.stale": ("media", "stale_proof", "Prueba no interactiva vieja para {user}"),
    "auth.locked_attempt": ("media", "locked_attempt", "Intento sobre una cuenta bloqueada: {user}"),
}


def deduce_alerts(record: RequestRecord, history: list[RequestRecord]) -> list[dict[str, Any]]:
    """Reglas genéricas: repetición, bloqueo, pruebas inválidas o viejas y cuerpos mal formados. Cubre R11."""
    drafts = []
    for item in record.signals:
        if item.name == "auth.replay":
            drafts.append(_replay_alert(record, item, history))
        elif item.name == "auth.lockout":
            drafts.append(_lockout_alert(record, item, history))
        elif item.name in SIMPLE_RULES:
            severity, kind, title = SIMPLE_RULES[item.name]
            detail = f"{record.method} {record.path} desde {record.client} ({record.device}) → {record.status}."
            drafts.append({"severity": severity, "kind": kind, "title": title.format(user=item.user_id),
                           "detail": detail, "user_id": item.user_id, "evidence": (record.id,)})
    if record.status == 422:
        drafts.append({"severity": "baja", "kind": "malformed", "title": "Cuerpo mal formado (422)",
                       "detail": f"{record.method} {record.path} desde {record.client} ({record.device}).",
                       "user_id": None, "evidence": (record.id,)})
    return drafts
