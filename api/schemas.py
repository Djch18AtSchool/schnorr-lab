"""Esquemas de petición y respuesta de la API (R11).

Todos los enteros del protocolo viajan como cadenas decimales («"y": "8"»), porque JavaScript
(y la página de Swagger) pierde precisión por encima de 2⁵³. Un número JSON se rechaza con 422.
"""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from protocol.bank import USER_ID_PATTERN

MAX_INT_DIGITS = 1000                      # un primo de 3072 bits tiene unos 925 dígitos
INT_PATTERN = rf"^-?[0-9]{{1,{MAX_INT_DIGITS}}}$"
SESSION_ID_PATTERN = r"^[0-9a-f]{16}$"

DecimalInt = Annotated[str, Field(pattern=INT_PATTERN, description="Entero en base 10, como cadena")]
UserId = Annotated[str, Field(pattern=USER_ID_PATTERN, description="Identificador del cliente",
                              examples=["cliente01"])]


class _Request(BaseModel):
    model_config = ConfigDict(extra="forbid")  # un campo inesperado (por ejemplo «x») se rechaza


class RegisterRequest(_Request):
    user_id: UserId
    y: DecimalInt = Field(examples=["8"], description="Clave pública y = g^x mod p")


class CommitRequest(_Request):
    user_id: UserId
    t: DecimalInt = Field(examples=["12"], description="Compromiso t = g^r mod p")


class RespondRequest(_Request):
    session_id: str = Field(pattern=SESSION_ID_PATTERN, examples=["9f2c41ab0d7e3a55"])
    s: DecimalInt = Field(examples=["4"], description="Respuesta s = (r + c·x) mod q")


class DemoClientRequest(_Request):
    user_id: UserId
    x: DecimalInt | None = Field(default=None, examples=["7"],
                                 description="Opcional: fija x (por ejemplo 7, como en el escrito)")


class ParamsResponse(BaseModel):
    name: str
    p: str
    q: str
    g: str
    bits: int


class RegisterResponse(BaseModel):
    user_id: str
    stored: dict[str, str]


class CommitResponse(BaseModel):
    session_id: str
    c: str


class VerifyResponse(BaseModel):
    accepted: bool
    reason: str
    transcript: dict[str, str] | None
    details: dict[str, str]
    attempts_left: int | None


class ErrorResponse(BaseModel):
    reason: str


class AuditEntry(BaseModel):
    endpoint: str
    body: dict[str, str]


class DemoClientResponse(BaseModel):
    warning: str
    user_id: str
    x: str
    y: str
