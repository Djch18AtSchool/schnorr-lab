"""Registro de mecanismos de autenticación disponibles en el laboratorio (R11).

Es el único lugar que hay que tocar para agregar un mecanismo: el banco monta su router y
la app del celular expone sus flujos automáticamente.
"""

from collections.abc import Callable, Mapping

from infra.server_context import ServerContext
from mechanisms.base import ClientMechanism, MechanismInfo, ServerMechanism
from mechanisms.zkp import client as zkp_client
from mechanisms.zkp import server as zkp_server
from mechanisms.zkp.info import INFO as ZKP_INFO

ServerFactory = Callable[[ServerContext, Mapping[str, str]], ServerMechanism]
ClientFactory = Callable[[], ClientMechanism]

SERVER_FACTORIES: dict[str, ServerFactory] = {ZKP_INFO.id: zkp_server.create_server}
CLIENT_FACTORIES: dict[str, ClientFactory] = {ZKP_INFO.id: zkp_client.create_client}
INFOS: dict[str, MechanismInfo] = {ZKP_INFO.id: ZKP_INFO}


def create_servers(ctx: ServerContext, settings: Mapping[str, str]) -> dict[str, ServerMechanism]:
    """Instancia la parte del banco de cada mecanismo registrado. Cubre R11."""
    return {mechanism_id: factory(ctx, settings) for mechanism_id, factory in SERVER_FACTORIES.items()}


def create_clients() -> dict[str, ClientMechanism]:
    """Instancia la parte del celular de cada mecanismo registrado. Cubre R11."""
    return {mechanism_id: factory() for mechanism_id, factory in CLIENT_FACTORIES.items()}
