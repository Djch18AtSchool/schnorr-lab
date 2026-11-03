"""Variante no interactiva con la transformación de Fiat-Shamir (R8). ESQUELETO: informe final.

En lugar de esperar el reto del banco, el cliente lo calcula con una función hash
(definiciones 14 y 15) y envía (t, s) en un solo mensaje:
    c = SHA-256(p ‖ g ‖ y ‖ t ‖ id ‖ m) mod q,
donde m es la fecha y hora del intento. Incluir p, g, y el identificador sigue el RFC 8235
(Hao, 2017). Contra la repetición de una prueba vieja, el banco exige |ahora − m| ≤ Δ y
guarda las pruebas usadas (id, t, s) en Bank._used_proofs.
"""

from dataclasses import dataclass

from core.params import GroupParams
from protocol.bank import Bank
from protocol.client import Client
from protocol.transcript import VerifyResult

DEFAULT_WINDOW_SECONDS = 30      # Δ: antigüedad máxima aceptada de m
TIMESTAMP_BYTES = 8
USER_ID_LENGTH_BYTES = 4
PENDING_MESSAGE = "Disponible en el informe final: variante no interactiva (Fiat-Shamir)"


@dataclass(frozen=True)
class NizkProof:
    """Prueba no interactiva: un solo mensaje con el compromiso, la respuesta y la marca de tiempo."""

    user_id: str
    t: int
    s: int
    m: int | None                # marca de tiempo en segundos (int(time.time())); None = sin protección


def hash_challenge(gp: GroupParams, y: int, t: int, user_id: str, m: int | None) -> int:
    """c = SHA-256(p ‖ g ‖ y ‖ t ‖ id ‖ m) mod q (definiciones 14 y 15). Cubre R8.

    Codificación canónica: cada entero en big-endian con longitud fija L = ⌈bits(p)/8⌉;
    id en UTF-8 precedido por su longitud en 4 bytes; m en 8 bytes; m = None se omite
    (modo sin protección, solo para el ataque de repetición).
    """
    raise NotImplementedError(PENDING_MESSAGE)


def prove(client: Client, m: int | None = None) -> NizkProof:
    """El cliente elige r, calcula t = g^r, c = hash_challenge(...) y s = r + c·x mod q. Cubre R8."""
    raise NotImplementedError(PENDING_MESSAGE)


def verify_nizk(
    bank: Bank,
    proof: NizkProof,
    now: int | None = None,
    window: int = DEFAULT_WINDOW_SECONDS,
    protect: bool = True,
) -> VerifyResult:
    """Verifica una prueba no interactiva. Cubre R8.

    Con protect=True: rechaza |now − m| > window y (id, t, s) ya usada; recalcula c con
    hash_challenge y aplica los pasos 3 a 8 de Bank.verify; si acepta, registra (id, t, s).
    Con protect=False: sin m, sin ventana y sin registro (modo vulnerable, para attacks/replay.py).
    """
    raise NotImplementedError(PENDING_MESSAGE)
