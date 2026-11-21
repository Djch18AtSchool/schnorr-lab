"""Matemática de SRP-6a (Wu, 2000; RFC 2945 y RFC 5054), implementada desde cero (C1, C4).

Todas las potencias modulares usan core.modular.mod_pow, el mismo backend aritmético que el
ZKP (propia, nativa o gmpy2): así la comparación de latencia es en igualdad de condiciones.

Notación (RFC 5054, sección 2.5): N primo seguro, g generador, H el hash (SHA-256 aquí; SHA-1
en los vectores del RFC), I el usuario, P la contraseña, s la sal, | concatenación y
PAD(·) el entero en big-endian rellenado con ceros a la longitud en bytes de N.

    k  = H(N | PAD(g))                  x  = H(s | H(I | ":" | P))        v = g^x mod N
    A  = g^a mod N                      B  = (k·v + g^b) mod N            u = H(PAD(A) | PAD(B))
    S  = (B − k·g^x)^(a + u·x) mod N    (celular)
    S  = (A·v^u)^b mod N                (banco)
    K  = H(PAD(S))
    M1 = H(H(N) xor H(g) | H(I) | s | A | B | K)     (RFC 2945, sección 3)
    M2 = H(A | M1 | K)

Ambos llegan al mismo S porque B − k·g^x = g^b y A·v^u = g^(a + u·x).
"""

import hashlib
import secrets
from dataclasses import dataclass

from core.modular import mod_pow

EPHEMERAL_BITS = 256                     # RFC 5054, sección 2.5.4: a y b de al menos 256 bits
SALT_BYTES = 16
DEFAULT_HASH = "sha256"

# RFC 5054, apéndice A, «2048-bit Group» (generador 2).
RFC5054_2048_HEX = """
    AC6BDB41 324A9A9B F166DE5E 1389582F AF72B665 1987EE07 FC319294
    3DB56050 A37329CB B4A099ED 8193E075 7767A13D D52312AB 4B03310D
    CD7F48A9 DA04FD50 E8083969 EDB767B0 CF609517 9A163AB3 661A05FB
    D5FAAAE8 2918A996 2F0B93B8 55F97993 EC975EEA A80D740A DBF4FF74
    7359D041 D5C33EA7 1D281E44 6B14773B CA97B43A 23FB8016 76BD207A
    436C6481 F1D2B907 8717461A 5B9D32E6 88F87748 544523B5 24B0D57D
    5EA77A27 75D2ECFA 032CFBDB F52FB378 61602790 04E57AE6 AF874E73
    03CE5329 9CCC041C 7BC308D8 2A5698F3 A8D0C382 71AE35F8 E9DBFBB6
    94B5C803 D89F7AE4 35DE236D 525F5475 9B65E372 FCD68EF2 0FA7111F
    9E4AFF73
"""


@dataclass(frozen=True)
class SrpGroup:
    """Parámetros públicos de SRP: primo N, generador g y función de hash."""

    N: int
    g: int
    hash_name: str
    name: str

    @property
    def bits(self) -> int:
        return self.N.bit_length()

    @property
    def byte_length(self) -> int:
        return (self.bits + 7) // 8


def hex_to_int(text: str) -> int:
    """Bloque hexadecimal del RFC (con espacios y saltos de línea) → entero."""
    return int("".join(text.split()), 16)


RFC5054_2048 = SrpGroup(N=hex_to_int(RFC5054_2048_HEX), g=2, hash_name=DEFAULT_HASH, name="rfc5054-2048")


def to_bytes(n: int) -> bytes:
    """Entero no negativo → big-endian con la mínima cantidad de bytes."""
    return n.to_bytes(max(1, (n.bit_length() + 7) // 8), "big")


def pad(group: SrpGroup, n: int) -> bytes:
    """PAD(n): big-endian de la longitud en bytes de N (RFC 5054, sección 2.1)."""
    return n.to_bytes(group.byte_length, "big")


def digest(group: SrpGroup, *parts: bytes) -> bytes:
    """H(parte₁ | parte₂ | ...) con el hash del grupo."""
    h = hashlib.new(group.hash_name)
    for part in parts:
        h.update(part)
    return h.digest()


def hash_int(group: SrpGroup, *parts: bytes) -> int:
    """H(...) interpretado como entero big-endian."""
    return int.from_bytes(digest(group, *parts), "big")


def multiplier(group: SrpGroup) -> int:
    """k = H(N | PAD(g)) (SRP-6a). Cubre C1."""
    return hash_int(group, to_bytes(group.N), pad(group, group.g))


def private_key(group: SrpGroup, salt: bytes, user_id: str, password: str) -> int:
    """x = H(s | H(I | ":" | P)); x se deriva de la contraseña y nunca sale del celular. Cubre C1."""
    inner = digest(group, f"{user_id}:{password}".encode())
    return hash_int(group, salt, inner)


def verifier(group: SrpGroup, x: int) -> int:
    """v = g^x mod N: lo único que guarda el banco además de la sal. Cubre C1 y C2."""
    return mod_pow(group.g, x, group.N)


def new_salt() -> bytes:
    """Sal aleatoria de 16 bytes. Cubre C1."""
    return secrets.token_bytes(SALT_BYTES)


def new_ephemeral() -> int:
    """Secreto efímero a o b de 256 bits, nuevo en cada inicio de sesión. Cubre C1 y C4."""
    return 1 + secrets.randbelow((1 << EPHEMERAL_BITS) - 1)


def client_public(group: SrpGroup, a: int) -> int:
    """A = g^a mod N. Cubre C1."""
    return mod_pow(group.g, a, group.N)


def server_public(group: SrpGroup, v: int, b: int) -> int:
    """B = (k·v + g^b) mod N. Cubre C1."""
    return (multiplier(group) * v + mod_pow(group.g, b, group.N)) % group.N


def scrambler(group: SrpGroup, A: int, B: int) -> int:
    """u = H(PAD(A) | PAD(B)). Cubre C1."""
    return hash_int(group, pad(group, A), pad(group, B))


def is_valid_public(group: SrpGroup, value: int) -> bool:
    """False si value ≡ 0 (mod N): con A o B así, S sería predecible y se aborta. Cubre C3."""
    return value % group.N != 0


def client_premaster(group: SrpGroup, B: int, x: int, a: int, u: int) -> int:
    """S = (B − k·g^x)^(a + u·x) mod N (celular). Cubre C1."""
    base = (B - multiplier(group) * mod_pow(group.g, x, group.N)) % group.N
    return mod_pow(base, a + u * x, group.N)


def server_premaster(group: SrpGroup, A: int, v: int, u: int, b: int) -> int:
    """S = (A·v^u)^b mod N (banco). Cubre C1."""
    return mod_pow(A * mod_pow(v, u, group.N) % group.N, b, group.N)


def session_key(group: SrpGroup, S: int) -> bytes:
    """K = H(PAD(S)). Cubre C1."""
    return digest(group, pad(group, S))


def client_proof(group: SrpGroup, user_id: str, salt: bytes, A: int, B: int, K: bytes) -> bytes:
    """M1 = H(H(N) xor H(g) | H(I) | s | A | B | K): el celular prueba que conoce K. Cubre C1 y C4."""
    hn, hg = digest(group, to_bytes(group.N)), digest(group, to_bytes(group.g))
    xored = bytes(n ^ g for n, g in zip(hn, hg, strict=True))
    return digest(group, xored, digest(group, user_id.encode()), salt, to_bytes(A), to_bytes(B), K)


def server_proof(group: SrpGroup, A: int, M1: bytes, K: bytes) -> bytes:
    """M2 = H(A | M1 | K): el banco prueba que conoce v (verificación mutua). Cubre C4."""
    return digest(group, to_bytes(A), M1, K)
