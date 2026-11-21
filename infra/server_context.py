"""Contexto compartido del servidor del banco: eventos, auditoría y exclusión mutua (R11).

Cada mecanismo de autenticación recibe el mismo ServerContext, así todos publican en la
misma bitácora de eventos y en la misma auditoría sin conocerse entre sí.
"""

import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

from infra.events import EventLog, current_request_id
from infra.telemetry import Telemetry

MAX_AUDIT_ENTRIES = 10_000


@dataclass(frozen=True)
class AuditEntry:
    """Un cuerpo recibido por el banco, tal como llegó (valid = False si se rechazó por mal formado)."""

    endpoint: str
    mechanism: str | None
    valid: bool
    body: dict[str, Any] = field(default_factory=dict)
    timestamp: float = 0.0
    request_id: int | None = None           # petición de la telemetría que trajo este cuerpo


class ServerContext:
    """Bitácora de eventos, telemetría, auditoría de cuerpos recibidos y un lock para el estado del banco. Cubre R11."""

    def __init__(self) -> None:
        self.events = EventLog()
        self.telemetry = Telemetry(self.events)
        self.lock = threading.Lock()     # el estado de los mecanismos no es seguro entre hilos
        self._audit: deque[AuditEntry] = deque(maxlen=MAX_AUDIT_ENTRIES)
        self._audit_lock = threading.Lock()

    def audit(self, endpoint: str, body: dict[str, Any], mechanism: str | None = None, valid: bool = True) -> None:
        """Registra un cuerpo recibido en la auditoría. Cubre R11."""
        with self._audit_lock:
            self._audit.append(AuditEntry(endpoint=endpoint, mechanism=mechanism, valid=valid, body=dict(body),
                                          timestamp=time.time(), request_id=current_request_id.get()))

    def audit_entries(self) -> list[AuditEntry]:
        """Copia de la auditoría, en orden de llegada. Cubre R11."""
        with self._audit_lock:
            return list(self._audit)

    def clear_audit(self) -> None:
        """Vacía la auditoría (al reiniciar el laboratorio). Cubre R11."""
        with self._audit_lock:
            self._audit.clear()
