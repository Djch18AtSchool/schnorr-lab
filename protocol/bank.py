"""Banco (verificador) del protocolo de Schnorr: vive en el servidor (R2, R3, R6, R9).

Estado del banco (estructuras discretas de la sección «Objetos y estructuras discretas»):
    _users:         dict[str, int]                  id → y, y nada más
    _sessions:      dict[str, tuple[str, int, int]] session_id → (id, t, c), un solo uso
    _open_sessions: dict[str, str]                  id → session_id pendiente (a lo sumo una)
    _failures:      dict[str, int]                  id → intentos fallidos consecutivos
    _used_proofs:   set[tuple[int, int]]            pares (t, s) ya usados, para Fiat-Shamir (R8)

Un intento abandonado también es un intento fallido: si el usuario pide un reto nuevo con una
sesión pendiente, esa sesión se descarta y suma un fallo. Sin esta regla, un impostor podría
abrir retos sin responderlos hasta que saliera el c que adivinó, sin acumular fallos.
"""

import re
import secrets

from core.modular import mod_inverse, mod_pow
from core.params import GroupParams, in_subgroup
from protocol.transcript import Reason, Transcript, VerifyResult

DEFAULT_MAX_ATTEMPTS = 3
SESSION_ID_BYTES = 8
USER_ID_PATTERN = r"^[A-Za-z0-9_.-]{1,64}$"
_USER_ID_REGEX = re.compile(USER_ID_PATTERN)


class Bank:
    """Verificador: guarda solo claves públicas y acepta si g^s ≡ t·y^c (mod p) (definición 13)."""

    def __init__(self, gp: GroupParams, max_attempts: int = DEFAULT_MAX_ATTEMPTS) -> None:
        if max_attempts < 1:
            raise ValueError("max_attempts debe ser al menos 1.")
        self._gp = gp
        self._max_attempts = max_attempts
        self._users: dict[str, int] = {}
        self._sessions: dict[str, tuple[str, int, int]] = {}
        self._open_sessions: dict[str, str] = {}
        self._failures: dict[str, int] = {}
        self._used_proofs: set[tuple[int, int]] = set()  # lo usará protocol/fiat_shamir.py

    @property
    def gp(self) -> GroupParams:
        return self._gp

    @property
    def max_attempts(self) -> int:
        return self._max_attempts

    @property
    def users(self) -> dict[str, int]:
        """Copia del registro id → y: muestra que el banco no guarda nada más. Cubre R2."""
        return dict(self._users)

    def is_locked(self, user_id: str) -> bool:
        """True si el usuario acumuló max_attempts fallos (nodo «Bloquear» de la Figura 1). Cubre R9."""
        return self._failures.get(user_id, 0) >= self._max_attempts

    def attempts_left(self, user_id: str) -> int:
        """Intentos que le quedan al usuario antes del bloqueo. Cubre R9."""
        return max(0, self._max_attempts - self._failures.get(user_id, 0))

    def register(self, user_id: str, y: int) -> VerifyResult:
        """Rechaza id inválido o repetido, y = 1 o y fuera del subgrupo. Guarda solo y. Cubre R2 y R9."""
        if not isinstance(user_id, str) or not _USER_ID_REGEX.fullmatch(user_id):
            return VerifyResult(False, Reason.INVALID_USER_ID)
        if user_id in self._users:
            return VerifyResult(False, Reason.USER_EXISTS)
        if y == 1:
            return VerifyResult(False, Reason.Y_IS_ONE)
        if not in_subgroup(y, self._gp):
            return VerifyResult(False, Reason.Y_NOT_IN_SUBGROUP)
        self._users[user_id] = y
        return VerifyResult(True, Reason.REGISTERED, attempts_left=self._max_attempts)

    def challenge(self, user_id: str, t: int, c: int | None = None) -> tuple[str, int] | VerifyResult:
        """Recibe el compromiso t y devuelve (session_id, c). Cubre R3 y R9.

        Rechaza usuario inexistente. Si el usuario tenía una sesión pendiente, la descarta y
        suma un fallo (intento abandonado). Rechaza usuario bloqueado. Si t no está en el
        subgrupo, suma un fallo y devuelve un VerifyResult rechazado. Si todo va bien, elige
        c con secrets.randbelow(q) (o usa el dado, solo para el ejemplo didáctico) y crea una
        sesión de un solo uso.
        """
        if user_id not in self._users:
            return VerifyResult(False, Reason.USER_NOT_FOUND)
        self._abandon_pending_session(user_id)
        if self.is_locked(user_id):
            return VerifyResult(False, Reason.ACCOUNT_LOCKED, attempts_left=0)
        if not in_subgroup(t, self._gp):
            return self._fail(user_id, Reason.T_NOT_IN_SUBGROUP)
        if c is not None and not 0 <= c <= self._gp.q - 1:
            raise ValueError("El reto fijo debe cumplir 0 ≤ c ≤ q − 1.")
        c_value = secrets.randbelow(self._gp.q) if c is None else c
        session_id = secrets.token_hex(SESSION_ID_BYTES)
        self._sessions[session_id] = (user_id, t, c_value)
        self._open_sessions[user_id] = session_id
        return session_id, c_value

    def verify(self, session_id: str, s: int, trace: list[str] | None = None) -> VerifyResult:
        """Consume la sesión y decide (rombo «¿Prueba válida?» de la Figura 1). Cubre R6 y R9.

        Orden: 1) sesión inexistente o usada → «Sesión inválida» (no cuenta fallo);
        2) usuario bloqueado → «Cuenta bloqueada»; 3) 0 ≤ s ≤ q − 1 o fallo «s fuera de rango»;
        4) g^s y t·y^c con mod_pow; 5) (y^c)^-1 con Euclides extendido y t_rec = g^s·(y^c)^-1;
        6) acepta solo si g^s = t·y^c y t_rec = t, y reinicia los fallos; 7) si no, fallo
        «La congruencia no se cumple»; 8) al llegar a max_attempts fallos, la cuenta se bloquea.
        """
        session = self._sessions.pop(session_id, None)
        if session is None:
            return VerifyResult(False, Reason.INVALID_SESSION)
        user_id, t, c = session
        self._open_sessions.pop(user_id, None)
        if self.is_locked(user_id):
            return VerifyResult(False, Reason.ACCOUNT_LOCKED, attempts_left=0)
        transcript = Transcript(t=t, c=c, s=s)
        if not 0 <= s <= self._gp.q - 1:
            return self._fail(user_id, Reason.S_OUT_OF_RANGE, transcript)
        details = self._verification_details(self._users[user_id], t, c, s, trace)
        if details["gs"] == details["tyc"] and details["t_rec"] == t:
            self._failures[user_id] = 0
            return VerifyResult(True, Reason.ACCESS_GRANTED, transcript, details, self._max_attempts)
        return self._fail(user_id, Reason.CONGRUENCE_FAILED, transcript, details)

    def _verification_details(
        self, y: int, t: int, c: int, s: int, trace: list[str] | None
    ) -> dict[str, int]:
        """Calcula g^s, y^c, t·y^c, (y^c)^-1 y g^s·(y^c)^-1 módulo p (pasos 4 y 5)."""
        p, g = self._gp.p, self._gp.g
        gs_steps, yc_steps, inverse_steps = ([], [], []) if trace is not None else (None, None, None)
        gs = mod_pow(g, s, p, gs_steps)
        yc = mod_pow(y, c, p, yc_steps)
        yc_inv = mod_inverse(yc, p, inverse_steps)
        if trace is not None:
            trace.extend([f"g^s = {g}^{s} mod {p}:", *_indent(gs_steps or [])])
            trace.extend([f"y^c = {y}^{c} mod {p}:", *_indent(yc_steps or [])])
            trace.extend([f"(y^c)^-1 = {yc}^-1 mod {p} (Euclides extendido):", *_indent(inverse_steps or [])])
        return {"gs": gs, "yc": yc, "tyc": t * yc % p, "yc_inv": yc_inv, "t_rec": gs * yc_inv % p}

    def _fail(
        self,
        user_id: str,
        reason: Reason,
        transcript: Transcript | None = None,
        details: dict[str, int] | None = None,
    ) -> VerifyResult:
        """Suma un fallo al usuario y devuelve el rechazo; al llegar a max_attempts queda bloqueado (R9)."""
        self._count_failure(user_id)
        return VerifyResult(False, reason, transcript, details or {}, self.attempts_left(user_id))

    def _count_failure(self, user_id: str) -> None:
        self._failures[user_id] = self._failures.get(user_id, 0) + 1

    def _abandon_pending_session(self, user_id: str) -> None:
        """Descarta la sesión pendiente del usuario, si la hay, y la cuenta como intento fallido."""
        session_id = self._open_sessions.pop(user_id, None)
        if session_id is not None and self._sessions.pop(session_id, None) is not None:
            self._count_failure(user_id)


def _indent(lines: list[str]) -> list[str]:
    return [f"    {line}" for line in lines]
