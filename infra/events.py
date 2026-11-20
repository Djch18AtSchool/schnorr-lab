"""Registro de eventos en tiempo real: lo que hace cada actor, en orden (R11).

El banco y la app del cliente publican aquí cada paso (cálculos locales, mensajes HTTP,
verificaciones). La interfaz los recibe por SSE para mostrar el sistema funcionando en vivo.
No depende de ningún mecanismo de autenticación: el ZKP es solo uno de los que publican.

Un evento puede llevar un identificador de correlación: la app del cliente lo envía en la
cabecera X-Correlation-Id y el banco lo copia en sus eventos, así la interfaz agrupa bajo un
mismo paso lo que hizo el cliente y lo que hizo el banco al recibir el mensaje.
"""

import threading
import time
from collections import deque
from collections.abc import Mapping
from contextvars import ContextVar
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Any

DEFAULT_CAPACITY = 5_000
DEFAULT_PAGE_SIZE = 500
CORRELATION_HEADER = "X-Correlation-Id"
SOURCES = frozenset({"banco", "cliente", "atacante", "sistema"})

current_correlation_id: ContextVar[str | None] = ContextVar("current_correlation_id", default=None)


@dataclass(frozen=True)
class Event:
    """Un hecho observable del sistema. Los enteros grandes van en data como cadenas."""

    id: int
    timestamp: float
    source: str                  # banco | cliente | atacante | sistema
    kind: str                    # paso | http | verificacion | registro | log | error
    title: str
    mechanism: str | None = None
    correlation_id: str | None = None
    data: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "data", MappingProxyType(dict(self.data)))

    def to_json(self) -> dict[str, Any]:
        """Representación serializable para la API y el flujo SSE. Cubre R11."""
        return {"id": self.id, "timestamp": self.timestamp, "source": self.source, "kind": self.kind,
                "title": self.title, "mechanism": self.mechanism, "correlation_id": self.correlation_id,
                "data": dict(self.data)}


class EventLog:
    """Bitácora acotada y segura entre hilos, con identificadores crecientes. Cubre R11."""

    def __init__(self, capacity: int = DEFAULT_CAPACITY) -> None:
        self._events: deque[Event] = deque(maxlen=capacity)
        self._lock = threading.Lock()
        self._next_id = 1

    def publish(
        self,
        source: str,
        kind: str,
        title: str,
        mechanism: str | None = None,
        data: Mapping[str, Any] | None = None,
        correlation_id: str | None = None,
    ) -> Event:
        """Agrega un evento; si no se indica correlación, usa la de la petición en curso. Cubre R11."""
        if source not in SOURCES:
            raise ValueError(f"Fuente de evento desconocida: {source!r}.")
        with self._lock:
            event = Event(
                id=self._next_id,
                timestamp=time.time(),
                source=source,
                kind=kind,
                title=title,
                mechanism=mechanism,
                correlation_id=correlation_id or current_correlation_id.get(),
                data=data or {},
            )
            self._events.append(event)
            self._next_id += 1
        return event

    def since(self, last_id: int = 0, limit: int = DEFAULT_PAGE_SIZE) -> list[Event]:
        """Eventos con id mayor que last_id, en orden, como máximo limit. Cubre R11."""
        with self._lock:
            newer = [event for event in self._events if event.id > last_id]
        return newer[:limit]

    @property
    def last_id(self) -> int:
        """Identificador del último evento publicado (0 si no hay ninguno)."""
        with self._lock:
            return self._next_id - 1
