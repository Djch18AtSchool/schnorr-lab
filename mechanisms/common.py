"""Piezas HTTP compartidas por los mecanismos del banco (R11).

Todos los enteros del protocolo viajan como cadenas decimales («"y": "8"»), porque JavaScript
(y la página de Swagger) pierde precisión por encima de 2⁵³. Un número JSON se rechaza con 422.
"""

from typing import Annotated

from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from protocol.bank import DEFAULT_MAX_ATTEMPTS, USER_ID_PATTERN

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


class AttemptLimiter:
    """Fallos consecutivos por usuario y bloqueo al llegar al máximo, igual que el ZKP (R9).

    Es genérico: lo usan los mecanismos que no envuelven protocol.Bank (contraseña, TOTP, SRP)
    para que todos bloqueen con la misma regla y la comparación sea justa.
    """

    def __init__(self, max_attempts: int = DEFAULT_MAX_ATTEMPTS) -> None:
        if max_attempts < 1:
            raise ValueError("max_attempts debe ser al menos 1.")
        self.max_attempts = max_attempts
        self._failures: dict[str, int] = {}

    def is_locked(self, user_id: str) -> bool:
        """True si el usuario acumuló max_attempts fallos seguidos. Cubre R9."""
        return self._failures.get(user_id, 0) >= self.max_attempts

    def attempts_left(self, user_id: str) -> int:
        """Intentos que le quedan antes del bloqueo. Cubre R9."""
        return max(0, self.max_attempts - self._failures.get(user_id, 0))

    def fail(self, user_id: str) -> int:
        """Suma un fallo y devuelve los intentos restantes. Cubre R9."""
        self._failures = {**self._failures, user_id: self._failures.get(user_id, 0) + 1}
        return self.attempts_left(user_id)

    def reserve(self, user_id: str) -> bool:
        """Cuenta el intento como fallo antes de verificar; False (sin contar) si ya está bloqueado.

        Se llama bajo el lock del banco: así N peticiones en paralelo no pasan todas el control de
        bloqueo mientras se verifica (lo lento queda fuera del lock). Al acertar se llama succeed;
        si el rechazo no debe contar (un código repetido), release. Cubre C3.
        """
        if self.is_locked(user_id):
            return False
        self.fail(user_id)
        return True

    def release(self, user_id: str) -> int:
        """Devuelve un intento reservado que al final no cuenta como fallo. Cubre C3."""
        remaining = self._failures.get(user_id, 0) - 1
        others = {key: value for key, value in self._failures.items() if key != user_id}
        self._failures = {**others, user_id: remaining} if remaining > 0 else others
        return self.attempts_left(user_id)

    def succeed(self, user_id: str) -> int:
        """Un acceso correcto reinicia el contador; devuelve los intentos disponibles. Cubre R9."""
        self._failures = {key: value for key, value in self._failures.items() if key != user_id}
        return self.max_attempts


def error_response(code: int, reason: str) -> JSONResponse:
    """Respuesta de error con el motivo en español: {"reason": ...}. Cubre R9 y R11."""
    return JSONResponse(status_code=code, content={"reason": str(reason)})
