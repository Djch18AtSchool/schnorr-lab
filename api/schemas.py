"""Esquemas comunes de la API del banco (los de cada mecanismo viven en mechanisms/*/schemas.py)."""

from typing import Any

from pydantic import BaseModel, Field

from mechanisms.common import StrictRequest


class AuditEntryOut(BaseModel):
    endpoint: str
    mechanism: str | None
    valid: bool = Field(description="False si el cuerpo se rechazó por mal formado (422)")
    body: dict[str, Any] = Field(description="Cuerpo tal como llegó al banco")


class EventOut(BaseModel):
    id: int
    timestamp: float
    source: str
    kind: str
    title: str
    mechanism: str | None
    correlation_id: str | None
    data: dict[str, Any]
    request_id: int | None = None


class ResetRequest(StrictRequest):
    group: str | None = Field(default=None, examples=["safe-512"],
                              description="Grupo para el ZKP (toy, safe-256, safe-512, safe-1024, rfc-2048, ...)")
