"""Esquemas de petición y respuesta del mecanismo ZKP en la API del banco (R11)."""

from pydantic import BaseModel, Field

from mechanisms.common import DecimalInt, StrictRequest, UserId

SESSION_ID_PATTERN = r"^[0-9a-f]{16}$"
TIMESTAMP_PATTERN = r"^[0-9]{1,20}$"          # m cabe en 8 bytes (hasta 2⁶⁴ − 1)


class RegisterRequest(StrictRequest):
    user_id: UserId
    y: DecimalInt = Field(examples=["8"], description="Clave pública y = g^x mod p")


class CommitRequest(StrictRequest):
    user_id: UserId
    t: DecimalInt = Field(examples=["12"], description="Compromiso t = g^r mod p")


class RespondRequest(StrictRequest):
    session_id: str = Field(pattern=SESSION_ID_PATTERN, examples=["9f2c41ab0d7e3a55"])
    s: DecimalInt = Field(examples=["4"], description="Respuesta s = (r + c·x) mod q")


class NizkRequest(StrictRequest):
    user_id: UserId
    t: DecimalInt = Field(examples=["12"], description="Compromiso t = g^r mod p")
    s: DecimalInt = Field(examples=["4"], description="Respuesta s = (r + c·x) mod q, con c = H(...)")
    m: str = Field(pattern=TIMESTAMP_PATTERN, examples=["1763650000"],
                   description="Marca de tiempo del intento, en segundos (int(time.time()))")


class DemoClientRequest(StrictRequest):
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


class DemoClientResponse(BaseModel):
    warning: str
    user_id: str
    x: str
    y: str
