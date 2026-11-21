"""Canal HTTP del celular hacia el banco, que registra cada mensaje tal como viaja (R11).

Cada intercambio queda en la bitácora de eventos del celular (pestaña «Red» de la interfaz)
y en una lista de mensajes capturados, que el laboratorio usa para simular a un espía.
"""

import time
from collections import deque
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import httpx

from infra.events import CORRELATION_HEADER, EventLog
from mechanisms.base import Exchange, StepError

MAX_CAPTURED = 200
DEVICE_HEADER = "X-Device"
FORWARDED_HEADER = "X-Forwarded-For"


@dataclass(frozen=True)
class Identity:
    """Cómo se presenta un dispositivo ante el banco (el laboratorio corre todo en 127.0.0.1)."""

    actor: str               # ana | eve
    device: str              # «celular de Ana»
    user_agent: str
    address: str             # dirección simulada en la red local del café

    def headers(self) -> dict[str, str]:
        return {"User-Agent": self.user_agent, DEVICE_HEADER: quote(self.device), FORWARDED_HEADER: self.address}


ANA_PHONE = Identity("ana", "celular de Ana", "BancoLab-iOS/3.2 (iPhone; iOS 18)", "192.168.1.23")
EVE_LAPTOP = Identity("eve", "laptop de Eve", "python-httpx/0.28 (Linux x86_64)", "192.168.1.66")
DIRECTOR = Identity("direccion", "dirección del laboratorio", "SchnorrLab-Escenario/0.4", "127.0.0.1")


class BankUnavailableError(StepError):
    """El banco no respondió (servidor apagado o dirección incorrecta)."""


def _body(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return response.text


class BankGateway:
    """Envía cuerpos JSON al banco y publica cada intercambio. Cubre R11."""

    def __init__(self, http: httpx.Client, events: EventLog, source: str = "cliente",
                 identity: Identity = ANA_PHONE) -> None:
        self._http = http
        self._events = events
        self._source = source
        self.identity = identity
        self._captured: deque[Exchange] = deque(maxlen=MAX_CAPTURED)

    def request(self, method: str, path: str, body: dict[str, Any] | None = None,
                correlation_id: str | None = None, mechanism: str | None = None) -> Exchange:
        """Un intercambio completo con el banco; BankUnavailableError si no hay conexión. Cubre R11."""
        headers = {**self.identity.headers(), **({CORRELATION_HEADER: correlation_id} if correlation_id else {})}
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
                            correlation_id=correlation_id, origin=self.identity.actor)
        self._captured.append(exchange)
        self._events.publish(self._source, "http", f"{method} {path} → {response.status_code}", mechanism,
                             exchange.to_json(), correlation_id)
        return exchange

    def captured_count(self) -> int:
        """Cuántos mensajes pasaron por la red hasta ahora (para saber desde cuándo escucha un espía)."""
        return len(self._captured)

    def captured(self) -> list[Exchange]:
        """Mensajes que pasaron por la red, del más viejo al más nuevo (lo que vería un espía). Cubre R10."""
        return list(self._captured)

    def clear(self) -> None:
        """Olvida los mensajes capturados (al reiniciar el laboratorio). Cubre R11."""
        self._captured.clear()
