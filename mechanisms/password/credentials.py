"""Contraseñas: generación en el celular y hash Argon2id en el banco (C1, C2).

Parámetros de Argon2id: la configuración mínima que recomienda OWASP (Password Storage Cheat
Sheet): m = 19 MiB, t = 2 iteraciones, p = 1 hilo, con sal aleatoria de 16 bytes y hash de
32 bytes. El banco guarda la cadena codificada ($argon2id$v=19$m=...,t=...,p=...$sal$hash),
que incluye los parámetros y la sal: con ella se puede verificar, pero no recuperar la contraseña
salvo probando candidatas una por una (el costo que mide benchmark/compare.py).

Lo usan el mecanismo de contraseña y el de TOTP (su primer factor es la misma contraseña).
"""

import secrets
from functools import cache

from argon2 import PasswordHasher, Type
from argon2.exceptions import VerificationError

ARGON2_TIME_COST = 2                 # iteraciones (OWASP: t = 2 con 19 MiB)
ARGON2_MEMORY_KIB = 19 * 1024        # 19 MiB
ARGON2_PARALLELISM = 1
ARGON2_HASH_LEN = 32
ARGON2_SALT_LEN = 16
MIN_PASSWORD_LENGTH = 8              # NIST SP 800-63B y OWASP
MAX_PASSWORD_LENGTH = 128            # acota el trabajo del banco por petición
GENERATED_PASSWORD_BYTES = 12        # token_urlsafe(12) → 16 caracteres
DUMMY_PASSWORD = "contraseña-de-relleno"

HASHER = PasswordHasher(time_cost=ARGON2_TIME_COST, memory_cost=ARGON2_MEMORY_KIB,
                        parallelism=ARGON2_PARALLELISM, hash_len=ARGON2_HASH_LEN,
                        salt_len=ARGON2_SALT_LEN, type=Type.ID)


def generate_password() -> str:
    """Contraseña aleatoria de 16 caracteres (en la vida real la escribe la persona). Cubre C1."""
    return secrets.token_urlsafe(GENERATED_PASSWORD_BYTES)


def hash_password(password: str) -> str:
    """Hash Argon2id con sal aleatoria nueva, en el formato codificado estándar. Cubre C2."""
    return HASHER.hash(password)


def verify_password(stored_hash: str, password: str) -> bool:
    """True si la contraseña produce el hash guardado (comparación en tiempo constante). Cubre C1.

    Un hash guardado corrupto lanza argon2.exceptions.InvalidHashError: es un error del banco,
    no una contraseña equivocada, y no se oculta.
    """
    try:
        return HASHER.verify(stored_hash, password)
    except VerificationError:
        return False


@cache
def dummy_hash() -> str:
    """Hash de relleno: se verifica contra él cuando el usuario no existe, para que el tiempo de
    respuesta no delate qué usuarios están registrados. Cubre C3."""
    return hash_password(DUMMY_PASSWORD)


def argon2_parameters() -> dict[str, str]:
    """Parámetros de Argon2id en uso, para la interfaz y el experimento. Cubre C2."""
    return {"algoritmo": "Argon2id", "memoria_kib": str(ARGON2_MEMORY_KIB),
            "iteraciones": str(ARGON2_TIME_COST), "paralelismo": str(ARGON2_PARALLELISM),
            "bytes_de_sal": str(ARGON2_SALT_LEN), "bytes_de_hash": str(ARGON2_HASH_LEN)}
