"""Piezas HTTP compartidas por los mecanismos del banco (R11).

Todos los enteros del protocolo viajan como cadenas decimales («"y": "8"»), porque JavaScript
(y la página de Swagger) pierde precisión por encima de 2⁵³. Un número JSON se rechaza con 422.
"""

from typing import Annotated

from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from protocol.bank import USER_ID_PATTERN

MAX_INT_DIGITS = 1000                      # un primo de 3072 bits tiene unos 925 dígitos
INT_PATTERN = rf"^-?[0-9]{{1,{MAX_INT_DIGITS}}}$"

DecimalInt = Annotated[str, Field(pattern=INT_PATTERN, description="Entero en base 10, como cadena")]
UserId = Annotated[str, Field(pattern=USER_ID_PATTERN, description="Identificador del cliente",
                              examples=["cliente01"])]


class StrictRequest(BaseModel):
    """Cuerpo de petición que rechaza campos inesperados (por ejemplo, un «x» que no debe viajar)."""

    model_config = ConfigDict(extra="forbid")


class ErrorResponse(BaseModel):
    reason: str


def error_response(code: int, reason: str) -> JSONResponse:
    """Respuesta de error con el motivo en español: {"reason": ...}. Cubre R9 y R11."""
    return JSONResponse(status_code=code, content={"reason": str(reason)})
