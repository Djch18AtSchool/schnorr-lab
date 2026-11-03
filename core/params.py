"""Parámetros públicos (p, q, g): generación, validación y carga de grupos (R1, R7).

Ejecutable como ``python -m core.params --generate 256 512 1024`` para generar una sola vez
los primos seguros y guardarlos en ``core/groups.json`` (el archivo se sube al repositorio).
SymPy se usa aquí solo para la primalidad; las potencias modulares usan ``mod_pow``.
"""

import argparse
import json
import os
import secrets
import time
from dataclasses import dataclass
from pathlib import Path

import sympy

from core.modular import mod_pow

GROUPS_FILE = Path(__file__).with_name("groups.json")
MIN_SAFE_PRIME_BITS = 5          # el primo seguro más pequeño de ese tamaño es 23 (el ejemplo)
SMALL_PRIME_LIMIT = 2000         # criba rápida antes de la prueba de primalidad completa
SMALL_PRIMES = tuple(sympy.primerange(3, SMALL_PRIME_LIMIT))
SAFE_GROUP_BITS = (256, 512, 1024)
RFC_GROUP_BITS = (2048, 3072)
SCHNORR_GROUP_SIZES = {"schnorr-2048": (2048, 224), "schnorr-3072": (3072, 256)}
GROUP_NAMES = (
    "toy",
    *(f"safe-{bits}" for bits in SAFE_GROUP_BITS),
    *(f"rfc-{bits}" for bits in RFC_GROUP_BITS),
    *SCHNORR_GROUP_SIZES,
)
PENDING_MESSAGE = "Disponible en el informe final"


@dataclass(frozen=True)
class GroupParams:
    """Parámetros públicos del sistema (Tabla 1 del escrito): primo p, orden q y generador g."""

    p: int
    q: int
    g: int
    name: str            # "toy-23", "safe-512", "rfc3526-2048", "schnorr-2048-224", ...

    @property
    def bits(self) -> int:
        """k = número de bits de p (variable k de la Tabla 1)."""
        return self.p.bit_length()

    @property
    def is_safe_prime(self) -> bool:
        """True si p = 2q + 1 (primo seguro, definición 2)."""
        return self.p == 2 * self.q + 1


TOY_GROUP = GroupParams(p=23, q=11, g=4, name="toy-23")


def validate_params(gp: GroupParams, require_safe_prime: bool = True) -> list[str]:
    """Devuelve la lista de fallas (vacía = válido). Cubre R1 (definiciones 2 y 7).

    Comprueba: p y q primos, que q divide a p − 1, que p = 2q + 1 (si require_safe_prime),
    que 1 < g < p y que g^q ≡ 1 (mod p). Como q es primo y g ≠ 1, esto implica que g tiene
    orden exactamente q. Los grupos de Schnorr del informe final (q mucho menor que p)
    se validan con require_safe_prime=False.
    """
    failures: list[str] = []
    if not sympy.isprime(gp.p):
        failures.append("p no es primo")
    if not sympy.isprime(gp.q):
        failures.append("q no es primo")
    if gp.q < 1 or (gp.p - 1) % gp.q != 0:
        failures.append("q no divide a p − 1")
    if require_safe_prime and not gp.is_safe_prime:
        failures.append("p ≠ 2q + 1: p no es un primo seguro")
    if not 1 < gp.g < gp.p:
        failures.append("g debe cumplir 1 < g < p")
    elif gp.q < 0 or mod_pow(gp.g, gp.q, gp.p) != 1:
        failures.append("g^q no es congruente con 1 (mod p)")
    return failures


def in_subgroup(u: int, gp: GroupParams) -> bool:
    """True si 1 <= u < p y u^q ≡ 1 (mod p): u pertenece al subgrupo generado por g (definición 7).

    Se usa para validar y y t antes de verificar. Cubre R1 y R9.
    """
    return 1 <= u < gp.p and mod_pow(u, gp.q, gp.p) == 1


def generator_for(p: int, q: int) -> int:
    """Primer h = 2, 3, ... con g = h^((p − 1)/q) mod p distinto de 1 (definición 7). Cubre R1.

    g pertenece al subgrupo de orden q y, como q es primo y g ≠ 1, su orden es exactamente q.
    Con un primo seguro, (p − 1)/q = 2 y g = h², como indica la metodología del escrito:
    para p = 23, h = 2 produce g = 4.
    """
    if q < 2 or (p - 1) % q != 0:
        raise ValueError(f"q = {q} debe ser al menos 2 y dividir a p − 1 = {p - 1}.")
    cofactor = (p - 1) // q
    for h in range(2, p - 1):
        candidate = mod_pow(h, cofactor, p)
        if candidate != 1:
            return candidate
    raise ValueError(f"No existe un generador de orden {q} módulo {p}.")


def _has_small_factor(n: int) -> bool:
    return any(n % prime == 0 and n != prime for prime in SMALL_PRIMES)


def safe_prime_group(bits: int) -> GroupParams:
    """Busca q primo de bits − 1 bits tal que p = 2q + 1 sea primo (definición 2). Cubre R1.

    Los candidatos se toman con secrets; antes de la prueba de primalidad de SymPy se descartan
    los que tienen factores primos pequeños. Tarda segundos hasta 1024 bits, por eso los grupos
    del repositorio se guardan en core/groups.json.
    """
    if bits < MIN_SAFE_PRIME_BITS:
        raise ValueError(f"El primo seguro debe tener al menos {MIN_SAFE_PRIME_BITS} bits.")
    top_bit = 1 << (bits - 2)
    while True:
        q = secrets.randbits(bits - 1) | top_bit | 1
        p = 2 * q + 1
        if _has_small_factor(q) or _has_small_factor(p):
            continue
        if sympy.isprime(q) and sympy.isprime(p):
            return GroupParams(p=p, q=q, g=generator_for(p, q), name=f"safe-{bits}")


def schnorr_group(p_bits: int, q_bits: int) -> GroupParams:
    """Grupo de Schnorr: q primo de q_bits bits y p = j·q + 1 primo de p_bits bits. Cubre R7.

    Plan (informe final): q con sympy.randprime; luego j par al azar hasta que p tenga
    exactamente p_bits bits y sea primo; g = generator_for(p, q).
    """
    raise NotImplementedError(f"{PENDING_MESSAGE}: grupos de Schnorr ({p_bits}/{q_bits} bits).")


def load_rfc_group(bits: int) -> GroupParams:
    """Grupos MODP de RFC 3526 (Kivinen y Kojo, 2003): 2048 bits (grupo 14) y 3072 (grupo 15). Cubre R7.

    Plan (informe final): copiar los hexadecimales del texto del RFC, con g = 2 y q = (p − 1)/2;
    una prueba verifica el tamaño, la primalidad de p y q y que 2^q ≡ 1 (mod p).
    """
    raise NotImplementedError(f"{PENDING_MESSAGE}: grupo MODP de {bits} bits del RFC 3526.")


def _load_cache(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"{path.name} no es un JSON válido: {error}") from error
    if not isinstance(data, dict):
        raise ValueError(f"{path.name} debe contener un objeto JSON.")
    return data


def _group_from_entry(name: str, entry: object) -> GroupParams:
    try:
        p, q, g = (int(entry[key]) for key in ("p", "q", "g"))  # type: ignore[index]
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError(f"Entrada inválida para {name} en groups.json: {error}") from error
    return GroupParams(p=p, q=q, g=g, name=name)


def _save_cache(path: Path, data: dict) -> None:
    """Escritura atómica: primero a un archivo temporal y luego se reemplaza."""
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def _cached_safe_group(bits: int, cache_path: Path) -> GroupParams:
    name = f"safe-{bits}"
    cache = _load_cache(cache_path)
    if name in cache:
        return _group_from_entry(name, cache[name])
    group = safe_prime_group(bits)
    entry = {"p": str(group.p), "q": str(group.q), "g": str(group.g)}
    _save_cache(cache_path, {**cache, name: entry})
    return group


def _build_group(name: str, cache_path: Path) -> GroupParams:
    if name == "toy":
        return TOY_GROUP
    kind, bits_text = name.split("-")
    if kind == "safe":
        return _cached_safe_group(int(bits_text), cache_path)
    if kind == "rfc":
        return load_rfc_group(int(bits_text))
    return schnorr_group(*SCHNORR_GROUP_SIZES[name])


def get_group(name: str, cache_path: Path = GROUPS_FILE) -> GroupParams:
    """Punto de entrada único para obtener (p, q, g). Cubre R1 y R7.

    Nombres: "toy", "safe-256", "safe-512", "safe-1024" (funcionales en este avance) y
    "rfc-2048", "rfc-3072", "schnorr-2048", "schnorr-3072" (informe final).
    Los primos seguros se leen de core/groups.json; si faltan, se generan y se guardan.
    El grupo siempre pasa por validate_params; si hay fallas, lanza ValueError con la lista.
    """
    if name not in GROUP_NAMES:
        raise ValueError(f"Grupo desconocido «{name}». Opciones: {', '.join(GROUP_NAMES)}.")
    group = _build_group(name, cache_path)
    failures = validate_params(group, require_safe_prime=not name.startswith("schnorr-"))
    if failures:
        raise ValueError(f"El grupo {name} no es válido: {'; '.join(failures)}.")
    return group


def main(argv: list[str] | None = None) -> int:
    """Genera (o confirma) los primos seguros pedidos y los guarda en core/groups.json. Cubre R1 y R7."""
    parser = argparse.ArgumentParser(description="Genera primos seguros y los guarda en core/groups.json.")
    parser.add_argument("--generate", nargs="+", type=int, choices=SAFE_GROUP_BITS, required=True)
    args = parser.parse_args(argv)
    for bits in args.generate:
        start = time.perf_counter()
        group = get_group(f"safe-{bits}")
        elapsed = time.perf_counter() - start
        print(f"{group.name}: p de {group.bits} bits, q de {group.q.bit_length()} bits ({elapsed:.1f} s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
