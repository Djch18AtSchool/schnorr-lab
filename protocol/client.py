"""Cliente (probador) del protocolo de Schnorr: vive en el celular del usuario (R2, R3).

La clave secreta x se queda en este objeto. Lo único que sale del cliente son enteros
públicos: y al registrarse, t en el compromiso y s en la respuesta.
"""

import secrets

from core.modular import mod_pow
from core.params import GroupParams


def random_exponent(q: int) -> int:
    """Entero aleatorio en [1, q − 1] con secrets (para x y r, Tabla 1). Cubre R3."""
    return 1 + secrets.randbelow(q - 1)


class Client:
    """Probador: demuestra que conoce x tal que y ≡ g^x (mod p) sin enviar x (definiciones 11 y 13)."""

    def __init__(
        self,
        user_id: str,
        gp: GroupParams,
        x: int | None = None,
        trace: list[str] | None = None,
    ) -> None:
        """x al azar en [1, q − 1] con secrets si no se da (solo el ejemplo didáctico fija x = 7).

        Si trace no es None, agrega los pasos de mod_pow usados para calcular y = g^x mod p.
        """
        if x is not None and not 1 <= x <= gp.q - 1:
            raise ValueError("x debe cumplir 1 ≤ x ≤ q − 1.")
        self._user_id = user_id
        self._gp = gp
        self._x = random_exponent(gp.q) if x is None else x
        self._y = mod_pow(gp.g, self._x, gp.p, trace)
        self._r: int | None = None

    @property
    def user_id(self) -> str:
        return self._user_id

    @property
    def gp(self) -> GroupParams:
        return self._gp

    @property
    def x(self) -> int:
        """Clave secreta. Solo para la demostración local y las pruebas: nunca se envía."""
        return self._x

    @property
    def y(self) -> int:
        """Clave pública y = g^x mod p, calculada con mod_pow (definición 11)."""
        return self._y

    def register_payload(self) -> tuple[str, int]:
        """(user_id, y): lo único que sale del cliente al registrarse. Cubre R2."""
        return self._user_id, self._y

    def commit(self, r: int | None = None, trace: list[str] | None = None) -> int:
        """Elige r nuevo y devuelve el compromiso t = g^r mod p. Cubre R3.

        r se toma con secrets en [1, q − 1]; solo el ejemplo didáctico lo fija (r = 5).
        Si ya había un compromiso pendiente lo descarta.
        """
        if r is not None and not 1 <= r <= self._gp.q - 1:
            raise ValueError("r debe cumplir 1 ≤ r ≤ q − 1.")
        self._r = random_exponent(self._gp.q) if r is None else r
        return mod_pow(self._gp.g, self._r, self._gp.p, trace)

    def respond(self, c: int) -> int:
        """Respuesta s = (r + c·x) mod q. Borra r después de usarlo (un solo uso).

        Un segundo respond sin commit lanza RuntimeError: así el cliente honesto nunca
        reutiliza r, que permitiría despejar x (ver attacks/nonce_reuse.py).
        """
        if self._r is None:
            raise RuntimeError("No hay compromiso pendiente: llame a commit antes de respond.")
        if not 0 <= c <= self._gp.q - 1:
            raise ValueError("El reto debe cumplir 0 ≤ c ≤ q − 1.")
        s = (self._r + c * self._x) % self._gp.q
        self._r = None
        return s
