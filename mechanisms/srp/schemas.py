"""Esquemas de petición y respuesta del mecanismo SRP-6a en la API del banco (C1).

Los enteros grandes (v, A, B) viajan como cadenas decimales, como en el ZKP; la sal y las
pruebas M1 y M2 son bytes y viajan en hexadecimal.
"""

from pydantic import BaseModel, Field

from mechanisms.common import DecimalInt, StrictRequest, UserId

SALT_PATTERN = r"^[0-9a-f]{32,128}$"           # 16 a 64 bytes
PROOF_PATTERN = r"^[0-9a-f]{64}$"              # SHA-256
SESSION_ID_PATTERN = r"^[0-9a-f]{16}$"


class RegisterRequest(StrictRequest):
    user_id: UserId
    salt: str = Field(pattern=SALT_PATTERN, examples=["beb25379d1a8581eb5a727673a2441ee"])
    v: DecimalInt = Field(description="Verificador v = g^x mod N")


class StartRequest(StrictRequest):
    user_id: UserId
    A: DecimalInt = Field(description="Clave efímera pública del celular, A = g^a mod N")


class VerifyRequest(StrictRequest):
    session_id: str = Field(pattern=SESSION_ID_PATTERN, examples=["9f2c41ab0d7e3a55"])
    M1: str = Field(pattern=PROOF_PATTERN, description="Prueba del celular, en hexadecimal")


class ParamsResponse(BaseModel):
    name: str
    N: str
    g: str
    hash: str
    bits: int


class RegisterResponse(BaseModel):
    user_id: str
    stored: dict[str, str]


class StartResponse(BaseModel):
    session_id: str
    salt: str
    B: str


class VerifyResponse(BaseModel):
    accepted: bool
    reason: str
    M2: str | None
    attempts_left: int | None
