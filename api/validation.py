"""Cuerpos mal formados: respuesta 422 en español y registro en la auditoría (R9, R11).

Si un cliente enviara un campo que no debe viajar (por ejemplo «x»), el banco lo rechaza y,
aun así, el cuerpo queda en /audit/log marcado como no válido: la auditoría lo detectaría.
"""

from collections.abc import Callable, Iterable
from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from infra.server_context import ServerContext
from mechanisms.common import error_response

VALIDATION_ERROR_STATUS = 422          # cuerpo mal formado (Unprocessable Content)
MAX_RAW_BODY_CHARS = 2_000
RAW_BODY_KEY = "_cuerpo_no_json"
VALIDATION_MESSAGES = {
    "missing": "falta el campo",
    "extra_forbidden": "campo no permitido (solo viajan valores públicos)",
    "string_type": "debe ser una cadena (los enteros viajan como cadenas decimales)",
    "string_pattern_mismatch": "formato inválido",
    "json_invalid": "el cuerpo no es un JSON válido",
    "model_attributes_type": "el cuerpo debe ser un objeto JSON",
}


def audit_body(raw: object) -> dict[str, Any]:
    """Cuerpo recibido tal cual; si no era un objeto JSON, se guarda como texto recortado. Cubre R11."""
    if isinstance(raw, dict):
        return {str(key): value for key, value in raw.items()}
    text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else str(raw)
    return {RAW_BODY_KEY: text[:MAX_RAW_BODY_CHARS]}


def describe_error(error: dict[str, Any]) -> str:
    """Una falla de validación en español, sin repetir el valor recibido. Cubre R9."""
    field = ".".join(str(part) for part in error.get("loc", ())[1:] if isinstance(part, str)) or "cuerpo"
    return f"{field}: {VALIDATION_MESSAGES.get(error.get('type', ''), 'valor inválido')}"


def validation_handler(
    ctx: ServerContext,
    audited: Callable[[], Iterable[tuple[str, str]]],
) -> Callable[[Request, RequestValidationError], Any]:
    """Crea el manejador de 422; audited() da los pares (ruta, mecanismo) que se auditan. Cubre R9 y R11."""

    async def on_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        mechanism_by_path = dict(audited())
        path = request.url.path
        if path in mechanism_by_path:
            ctx.audit(path, audit_body(exc.body), mechanism_by_path[path], valid=False)
            ctx.events.publish("banco", "error", f"Cuerpo rechazado en {path}", mechanism_by_path[path])
        reason = "Cuerpo inválido: " + "; ".join(describe_error(error) for error in exc.errors())
        return error_response(VALIDATION_ERROR_STATUS, reason)

    return on_validation_error
