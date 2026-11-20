"""Server-Sent Events: transmite una EventLog al navegador en tiempo real (R11).

Se usa sondeo corto sobre la bitácora (cada POLL_SECONDS) en lugar de colas por cliente:
es simple, funciona igual desde endpoints síncronos y asíncronos y permite reanudar con
la cabecera Last-Event-ID si la conexión se corta.
"""

import asyncio
import json
from collections.abc import AsyncIterator, Callable, Iterable

from fastapi import Request
from fastapi.responses import StreamingResponse

from infra.events import Event, EventLog

POLL_SECONDS = 0.15
KEEP_ALIVE_SECONDS = 15.0
SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


def format_sse(event: Event) -> str:
    """Un evento en el formato de texto de SSE (id, tipo y datos JSON). Cubre R11."""
    payload = json.dumps(event.to_json(), ensure_ascii=False)
    return f"id: {event.id}\nevent: {event.kind}\ndata: {payload}\n\n"


async def stream_events(
    log: EventLog,
    last_id: int,
    is_disconnected: Callable[[], object],
    max_polls: int | None = None,
) -> AsyncIterator[str]:
    """Genera los eventos nuevos a medida que llegan, hasta que el navegador se desconecta. Cubre R11.

    max_polls limita las vueltas (solo para pruebas).
    """
    idle = 0.0
    polls = 0
    while max_polls is None or polls < max_polls:
        polls += 1
        if await is_disconnected():
            return
        events: Iterable[Event] = log.since(last_id)
        for event in events:
            last_id = event.id
            idle = 0.0
            yield format_sse(event)
        idle += POLL_SECONDS
        if idle >= KEEP_ALIVE_SECONDS:
            idle = 0.0
            yield ": sigue conectado\n\n"
        await asyncio.sleep(POLL_SECONDS)


def sse_response(log: EventLog, request: Request, since: int = 0) -> StreamingResponse:
    """Respuesta HTTP de tipo text/event-stream que reanuda desde Last-Event-ID si viene. Cubre R11."""
    header = request.headers.get("last-event-id", "")
    last_id = int(header) if header.isdigit() else since
    return StreamingResponse(
        stream_events(log, last_id, request.is_disconnected),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )
