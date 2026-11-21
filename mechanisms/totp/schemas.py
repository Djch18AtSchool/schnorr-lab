"""Esquemas de petición y respuesta del mecanismo contraseña + TOTP en la API del banco (C1)."""

from typing import Annotated

from pydantic import BaseModel, Field

from mechanisms.common import StrictRequest, UserId
from mechanisms.password.schemas import CredentialsRequest, LoginResponse, Password
from mechanisms.totp.otp import CODE_PATTERN

Code = Annotated[str, Field(pattern=CODE_PATTERN, examples=["492039"],
                            description="Código TOTP de 6 dígitos de la app autenticadora")]

__all__ = ["ConfirmRequest", "CredentialsRequest", "EnrollResponse", "LoginRequest", "LoginResponse"]


class ConfirmRequest(StrictRequest):
    user_id: UserId
    code: Code


class LoginRequest(StrictRequest):
    user_id: UserId
    password: Password
    code: Code


class EnrollResponse(BaseModel):
    user_id: str
    secret: str = Field(description="Secreto compartido K en base32 (lo que contiene el QR)")
    otpauth_uri: str
    digits: int
    period: int
    stored: dict[str, str]
