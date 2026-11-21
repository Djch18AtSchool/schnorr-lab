"""Esquemas de petición y respuesta del mecanismo de contraseña en la API del banco (C1)."""

from typing import Annotated

from pydantic import BaseModel, Field

from mechanisms.common import StrictRequest, UserId
from mechanisms.password.credentials import MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH

Password = Annotated[str, Field(min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH,
                                examples=["correcto-caballo-bateria"],
                                description="Contraseña en claro (viaja protegida solo por TLS)")]


class CredentialsRequest(StrictRequest):
    user_id: UserId
    password: Password


class RegisterResponse(BaseModel):
    user_id: str
    stored: dict[str, str]


class LoginResponse(BaseModel):
    accepted: bool
    reason: str
    attempts_left: int | None
