"""Variante no interactiva con la transformación de Fiat-Shamir (R8).

En lugar de esperar el reto del banco, el cliente lo calcula con una función hash
(definiciones 14 y 15) y envía (t, s) en un solo mensaje:
    c = SHA-256(p ‖ g ‖ y ‖ t ‖ id ‖ m) mod q,
donde m es la fecha y hora del intento. Incluir p, g, y el identificador sigue el RFC 8235
(Hao, 2017). Contra la repetición de una prueba vieja, el banco exige |ahora − m| ≤ Δ y
guarda los pares (t, s) ya usados en Bank._used_proofs. Como c depende del identificador,
el par (t, s) basta para reconocer una prueba repetida.

Dos advertencias propias del grupo de ejemplo (p = 23, q = 11):
- Solo hay q·(q − 1) = 110 pares (t, s) posibles, así que un cliente honesto puede repetir por
  azar un par ya usado tras pocos inicios de sesión; con q grande eso no ocurre.
- Aquí el bloqueo no frena a un impostor: puede probar t al azar sin conectarse hasta que el
  hash coincida con el reto que adivinó (probabilidad 1/q por intento). La seguridad de la
  variante no interactiva depende de que q sea grande (definición 16).
"""

import hashlib
import time
from dataclasses import dataclass

from core.params import GroupParams
from protocol.bank import Bank
from protocol.client import Client
from protocol.transcript import Reason, VerifyResult

DEFAULT_WINDOW_SECONDS = 30      # Δ: antigüedad máxima aceptada de m
TIMESTAMP_BYTES = 8
USER_ID_LENGTH_BYTES = 4
BITS_PER_BYTE = 8
BYTE_ORDER = "big"
MAX_TIMESTAMP = 2 ** (BITS_PER_BYTE * TIMESTAMP_BYTES) - 1
MAX_USER_ID_BYTES = 2 ** (BITS_PER_BYTE * USER_ID_LENGTH_BYTES) - 1


@dataclass(frozen=True)
class NizkProof:
    """Prueba no interactiva: un solo mensaje con el compromiso, la respuesta y la marca de tiempo."""

    user_id: str
    t: int
    s: int
    m: int | None                # marca de tiempo en segundos (int(time.time())); None = sin protección


def current_timestamp() -> int:
    """Marca de tiempo m en segundos enteros (variable m de la Tabla 1). Cubre R8."""
    return int(time.time())


def encode_challenge_input(gp: GroupParams, y: int, t: int, user_id: str, m: int | None) -> bytes:
    """Bytes de p ‖ g ‖ y ‖ t ‖ id ‖ m que entran a la función hash (definición 15). Cubre R8.

    Codificación canónica: cada entero en big-endian con longitud fija L = ⌈bits(p)/8⌉;
    id en UTF-8 precedido por su longitud en 4 bytes; m en 8 bytes; m = None se omite.
    Las longitudes fijas y el prefijo del id hacen que dos entradas distintas nunca den los
    mismos bytes. Rechaza con ValueError y o t fuera de [1, p − 1], m fuera de [0, 2⁶⁴ − 1]
    o un id demasiado largo.
    """
    for name, value in (("y", y), ("t", t)):
        if not 1 <= value <= gp.p - 1:
            raise ValueError(f"{name} debe cumplir 1 ≤ {name} ≤ p − 1.")
    if m is not None and not 0 <= m <= MAX_TIMESTAMP:
        raise ValueError("m debe cumplir 0 ≤ m < 2⁶⁴.")
    raw_id = user_id.encode("utf-8")
    if len(raw_id) > MAX_USER_ID_BYTES:
        raise ValueError("El identificador es demasiado largo para codificarlo.")
    length = (gp.bits + BITS_PER_BYTE - 1) // BITS_PER_BYTE
    parts = [value.to_bytes(length, BYTE_ORDER) for value in (gp.p, gp.g, y, t)]
    parts += [len(raw_id).to_bytes(USER_ID_LENGTH_BYTES, BYTE_ORDER), raw_id]
    if m is not None:
        parts.append(m.to_bytes(TIMESTAMP_BYTES, BYTE_ORDER))
    return b"".join(parts)


def hash_challenge(gp: GroupParams, y: int, t: int, user_id: str, m: int | None) -> int:
    """c = SHA-256(p ‖ g ‖ y ‖ t ‖ id ‖ m) mod q (definiciones 14 y 15). Cubre R8.

    Codificación canónica: cada entero en big-endian con longitud fija L = ⌈bits(p)/8⌉;
    id en UTF-8 precedido por su longitud en 4 bytes; m en 8 bytes; m = None se omite
    (modo sin protección, solo para el ataque de repetición). La salida de SHA-256 se
    interpreta como un entero big-endian y se reduce módulo q. Rechaza con ValueError las
    entradas fuera de rango (ver encode_challenge_input).
    """
    digest = hashlib.sha256(encode_challenge_input(gp, y, t, user_id, m)).digest()
    return int.from_bytes(digest, BYTE_ORDER) % gp.q


def prove(client: Client, m: int | None = None) -> NizkProof:
    """El cliente elige r, calcula t = g^r, c = hash_challenge(...) y s = r + c·x mod q. Cubre R8.

    Usa solo la API pública del cliente (commit y respond), así que x nunca sale de él y r
    se borra al responder (definiciones 13 y 14). El cliente honesto pasa
    m = current_timestamp(); m = None produce una prueba sin marca de tiempo, que solo acepta
    el banco en modo vulnerable (protect=False).
    """
    t = client.commit()
    c = hash_challenge(client.gp, client.y, t, client.user_id, m)
    return NizkProof(user_id=client.user_id, t=t, s=client.respond(c), m=m)


def verify_nizk(
    bank: Bank,
    proof: NizkProof,
    now: int | None = None,
    window: int = DEFAULT_WINDOW_SECONDS,
    protect: bool = True,
) -> VerifyResult:
    """Verifica una prueba no interactiva. Cubre R8.

    Con protect=True: rechaza |now − m| > window y un par (t, s) ya usado; recalcula c con
    hash_challenge y aplica los pasos 3 a 8 de Bank.verify; si acepta, registra (t, s).
    Con protect=False: sin m, sin ventana y sin registro (modo vulnerable, para attacks/replay.py).

    Los rechazos por frescura (falta m, m fuera de la ventana, prueba ya usada) se revisan
    primero y no cuentan como fallo, igual que una sesión ya usada en Bank.verify: así quien
    reenvía una prueba capturada no puede bloquear a la víctima. El resto de las decisiones
    (usuario, bloqueo, t en el subgrupo, rango de s, congruencias y conteo de fallos) las toma
    Bank.verify_proof (definiciones 13 a 15). now = None usa la hora actual.
    """
    if window < 0:
        raise ValueError("La ventana Δ no puede ser negativa.")
    if protect:
        stale = _freshness_problem(bank, proof, current_timestamp() if now is None else now, window)
        if stale is not None:
            return VerifyResult(False, stale)
    m = proof.m if protect else None

    def challenge_for(y: int) -> int:
        return hash_challenge(bank.gp, y, proof.t, proof.user_id, m)

    result = bank.verify_proof(proof.user_id, proof.t, proof.s, challenge_for)
    if protect and result.accepted:
        bank.record_proof(proof.t, proof.s)
    return result


def _freshness_problem(bank: Bank, proof: NizkProof, now: int, window: int) -> Reason | None:
    """Motivo de rechazo por falta de frescura, o None si m está en la ventana y (t, s) es nuevo."""
    if proof.m is None:
        return Reason.MISSING_TIMESTAMP
    if not 0 <= proof.m <= MAX_TIMESTAMP or abs(now - proof.m) > window:
        return Reason.TIMESTAMP_OUT_OF_WINDOW
    if bank.is_proof_used(proof.t, proof.s):
        return Reason.PROOF_ALREADY_USED
    return None
