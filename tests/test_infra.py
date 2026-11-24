"""Pruebas de la infraestructura transversal: bitácora de eventos, SSE y registro de mecanismos (R11)."""

import asyncio
import json

import pytest

from infra.events import EventLog, current_correlation_id
from infra.sse import format_sse, stream_events
from mechanisms.registry import INFOS, create_clients


@pytest.mark.req("R11")
def test_bitacora_asigna_ids_crecientes_y_devuelve_los_nuevos():
    log = EventLog(capacity=3)
    for i in range(5):
        log.publish("banco", "log", f"evento {i}")
    assert [e.id for e in log.since(0)] == [3, 4, 5]  # solo conserva los 3 más recientes
    assert [e.title for e in log.since(4)] == ["evento 4"]
    assert log.last_id == 5


@pytest.mark.req("R11")
def test_bitacora_rechaza_fuentes_desconocidas_y_copia_la_correlacion():
    log = EventLog()
    with pytest.raises(ValueError):
        log.publish("intruso", "log", "x")
    token = current_correlation_id.set("flujo:1")
    try:
        assert log.publish("banco", "log", "con correlación").correlation_id == "flujo:1"
    finally:
        current_correlation_id.reset(token)


@pytest.mark.req("R11")
def test_formato_sse_y_flujo_de_eventos():
    log = EventLog()
    log.publish("cliente", "paso", "Paso 1", data={"t": "12"})
    text = format_sse(log.since(0)[0])
    assert text.startswith("id: 1\ndata: ") and text.endswith("\n\n")
    payload = json.loads(text.split("data: ", 1)[1])
    assert payload["kind"] == "paso" and payload["data"] == {"t": "12"}

    async def collect() -> list[str]:
        async def connected() -> bool:
            return False
        return [chunk async for chunk in stream_events(log, 0, connected, max_polls=2)]

    assert asyncio.run(collect()) == [": conectado\n\n", text]   # comentario inicial: cabeceras de inmediato


@pytest.mark.req("R11")
def test_formato_sse_no_usa_nombres_de_evento_reservados_por_el_navegador():
    # Un «event: error» llega también a EventSource.onerror y la interfaz marcaba el banco como desconectado.
    log = EventLog()
    log.publish("banco", "error", "Compromiso rechazado: cuenta bloqueada")
    text = format_sse(log.since(0)[0])
    assert "event:" not in text
    assert json.loads(text.split("data: ", 1)[1])["kind"] == "error"


@pytest.mark.req("R11")
def test_registro_de_mecanismos_describe_flujos_y_pasos():
    zkp = INFOS["zkp"].to_json()
    assert [flow["id"] for flow in zkp["flows"]] == ["register", "login", "login_nizk"]
    assert all(step["actor"] in {"cliente", "red", "banco"} for flow in zkp["flows"] for step in flow["steps"])
    with pytest.raises(ValueError):
        INFOS["zkp"].flow("inexistente")
    assert len(create_clients()["zkp"].steps("login")) == 5
