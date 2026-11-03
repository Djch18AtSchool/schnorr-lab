"""Objetos inmutables del protocolo: transcripción (t, c, s) y resultado de una verificación."""

from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from types import MappingProxyType


class Reason(StrEnum):
    """Motivos de aceptación o rechazo, en español (se muestran en consola y en la API)."""

    REGISTERED = "Registro exitoso"
    ACCESS_GRANTED = "Acceso concedido"
    INVALID_USER_ID = "Identificador de usuario inválido"
    USER_EXISTS = "El usuario ya está registrado"
    USER_NOT_FOUND = "Usuario no registrado"
    Y_IS_ONE = "y = 1 no es una clave pública válida"
    Y_NOT_IN_SUBGROUP = "y no pertenece al subgrupo de orden q"
    T_NOT_IN_SUBGROUP = "t no pertenece al subgrupo de orden q"
    INVALID_SESSION = "Sesión inválida"
    ACCOUNT_LOCKED = "Cuenta bloqueada"
    S_OUT_OF_RANGE = "s fuera de rango"
    CONGRUENCE_FAILED = "La congruencia no se cumple"


@dataclass(frozen=True)
class Transcript:
    """Transcripción de un intento de autenticación: compromiso t, reto c y respuesta s."""

    t: int
    c: int
    s: int


@dataclass(frozen=True)
class VerifyResult:
    """Resultado de registrar, pedir un reto o verificar.

    details guarda los valores intermedios de la verificación (para --verbose y la API):
    gs = g^s, yc = y^c, tyc = t·y^c, yc_inv = (y^c)^-1 y t_rec = g^s·(y^c)^-1, todos mod p.
    attempts_left es None cuando no se puede asociar el intento a un usuario registrado.
    """

    accepted: bool
    reason: Reason
    transcript: Transcript | None = None
    details: Mapping[str, int] = field(default_factory=dict)
    attempts_left: int | None = None

    def __post_init__(self) -> None:
        # Copia de solo lectura: el resultado es inmutable aunque se construya con un dict.
        object.__setattr__(self, "details", MappingProxyType(dict(self.details)))
