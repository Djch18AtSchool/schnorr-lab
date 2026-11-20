"""Canal HTTP del celular hacia el banco, que registra cada mensaje tal como viaja (R11).

Cada intercambio queda en la bitácora de eventos del celular (pestaña «Red» de la interfaz)
y en una lista de mensajes capturados, que el laboratorio usa para simular a un espía.
"""

import time
from collections import deque
from typing import Any

import httpx

from infra.events import CORRELATION_HEADER, EventLog
from mechanisms.base import Exchange, StepError

MAX_CAPTURED = 200


class BankUnavailableError(StepError):
    """El banco no respondió (servidor apagado o dirección incorrecta)."""


def _body(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return response.text


class BankGateway:
    """Envía cuerpos JSON al banco y publica cada intercambio. Cubre R11."""

    def __init__(self, http: httpx.Client, events: EventLog, source: str = "cliente") -> None:
        self._http = http
        self._events = events
        self._source = source
        self._captured: deque[Exchange] = deque(maxlen=MAX_CAPTURED)

    def request(self, method: str, path: str, body: dict[str, Any] | None = None,
                correlation_id: str | None = None, mechanism: str | None = None) -> Exchange:
        """Un intercambio completo con el banco; BankUnavailableError si no hay conexión. Cubre R11."""
        headers = {CORRELATION_HEADER: correlation_id} if correlation_id else {}
        start = time.perf_counter()
        try:
            response = self._http.request(method, path, json=body, headers=headers)
        except httpx.HTTPError as error:
            self._events.publish(self._source, "error", f"Sin conexión con el banco ({method} {path})",
                                 mechanism, {"detalle": str(error)}, correlation_id)
            raise BankUnavailableError(f"No se pudo conectar con el banco: {error}") from error
        exchange = Exchange(method=method, path=path, status=response.status_code, request_body=body,
                            response_body=_body(response),
                            elapsed_ms=round((time.perf_counter() - start) * 1000, 2),
                            correlation_id=correlation_id)
        self._captured.append(exchange)
        self._events.publish(self._source, "http", f"{method} {path} → {response.status_code}", mechanism,
                             exchange.to_json(), correlation_id)
        return exchange

    def captured(self) -> list[Exchange]:
        """Mensajes que pasaron por la red, del más viejo al más nuevo (lo que vería un espía). Cubre R10."""
        return list(self._captured)

    def clear(self) -> None:
        """Olvida los mensajes capturados (al reiniciar el laboratorio). Cubre R11."""
        self._captured.clear()
