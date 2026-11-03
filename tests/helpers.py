"""Funciones auxiliares compartidas por las pruebas."""

from dataclasses import fields, is_dataclass

from core.params import GroupParams
from protocol.bank import Bank
from protocol.client import Client
from protocol.transcript import VerifyResult

USER_ID = "cliente01"


def registrar(gp: GroupParams, x: int | None = None, user_id: str = USER_ID) -> tuple[Bank, Client]:
    """Crea un banco y un cliente y registra al cliente (solo viaja y)."""
    bank = Bank(gp)
    client = Client(user_id, gp, x=x)
    result = bank.register(*client.register_payload())
    assert result.accepted, result.reason
    return bank, client


def login(bank: Bank, client: Client, r: int | None = None, c: int | None = None) -> VerifyResult:
    """Inicio de sesión honesto completo: compromiso, reto, respuesta y verificación."""
    challenge = bank.challenge(client.user_id, client.commit(r=r), c=c)
    assert not isinstance(challenge, VerifyResult), challenge.reason
    session_id, c_value = challenge
    return bank.verify(session_id, client.respond(c_value))


def all_ints(obj: object) -> list[int]:
    """Recorre recursivamente un objeto y devuelve todos los enteros que contiene."""
    if isinstance(obj, bool):
        return []
    if isinstance(obj, int):
        return [obj]
    if isinstance(obj, dict):
        return [n for key, value in obj.items() for n in all_ints(key) + all_ints(value)]
    if isinstance(obj, (list, tuple, set, frozenset)):
        return [n for item in obj for n in all_ints(item)]
    if is_dataclass(obj):
        return [n for f in fields(obj) for n in all_ints(getattr(obj, f.name))]
    if hasattr(obj, "__dict__"):
        return all_ints(vars(obj))
    return []
