"""Registro de mecanismos de autenticación disponibles en el laboratorio (R11).

Es el único lugar que hay que tocar para agregar un mecanismo: el banco monta su router y
la app del celular expone sus flujos automáticamente.
"""

from collections.abc import Callable, Mapping

from infra.server_context import ServerContext
from mechanisms.base import ClientMechanism, MechanismInfo, ServerMechanism
from mechanisms.password import client as password_client
from mechanisms.password import server as password_server
from mechanisms.password.info import INFO as PASSWORD_INFO
from mechanisms.zkp import client as zkp_client
from mechanisms.zkp import server as zkp_server
from mechanisms.zkp.info import INFO as ZKP_INFO

ServerFactory = Callable[[ServerContext, Mapping[str, str]], ServerMechanism]
ClientFactory = Callable[[], ClientMechanism]

# (descripción, fábrica del banco, fábrica del celular); el ZKP va primero: es el mecanismo principal.
MECHANISMS: tuple[tuple[MechanismInfo, ServerFactory, ClientFactory], ...] = (
    (ZKP_INFO, zkp_server.create_server, zkp_client.create_client),
    (PASSWORD_INFO, password_server.create_server, password_client.create_client),
)

SERVER_FACTORIES: dict[str, ServerFactory] = {info.id: server for info, server, _ in MECHANISMS}
CLIENT_FACTORIES: dict[str, ClientFactory] = {info.id: client for info, _, client in MECHANISMS}
INFOS: dict[str, MechanismInfo] = {info.id: info for info, _, _ in MECHANISMS}


def create_servers(ctx: ServerContext, settings: Mapping[str, str]) -> dict[str, ServerMechanism]:
    """Instancia la parte del banco de cada mecanismo registrado. Cubre R11."""
    return {mechanism_id: factory(ctx, settings) for mechanism_id, factory in SERVER_FACTORIES.items()}


def create_clients() -> dict[str, ClientMechanism]:
    """Instancia la parte del celular de cada mecanismo registrado. Cubre R11."""
    return {mechanism_id: factory() for mechanism_id, factory in CLIENT_FACTORIES.items()}
