"""Parámetros públicos (p, q, g): generación, validación y carga de grupos (R1, R7).

Ejecutable como ``python -m core.params --generate 256 512 1024 schnorr-2048 schnorr-3072``
para generar una sola vez los primos seguros y los grupos de Schnorr y guardarlos en
``core/groups.json`` (el archivo se sube al repositorio). Los grupos del RFC 3526 no se generan:
se copian del RFC (``core/rfc3526.py``). Los del RFC 7919 (ffdhe2048 y ffdhe3072) tampoco: sus
primos se copiaron del apéndice A del RFC a ``core/groups.json``, con el nivel de seguridad que
el RFC les asigna. SymPy se usa aquí solo para la primalidad y para elegir
el primo q de los grupos de Schnorr; las potencias modulares usan ``mod_pow``.
"""

import argparse
import json
import os
import secrets
import time
from collections.abc import Callable
from dataclasses import dataclass, replace
from functools import partial
from pathlib import Path

import sympy

from core.modular import mod_pow
from core.rfc3526 import RFC3526_GENERATOR, modp_prime

GROUPS_FILE = Path(__file__).with_name("groups.json")
MIN_SAFE_PRIME_BITS = 5          # el primo seguro más pequeño de ese tamaño es 23 (el ejemplo)
SMALL_PRIME_LIMIT = 2000         # criba rápida antes de la prueba de primalidad completa
SMALL_PRIMES = tuple(sympy.primerange(3, SMALL_PRIME_LIMIT))
SAFE_GROUP_BITS = (256, 512, 1024)
RFC_GROUP_BITS = (2048, 3072)
FFDHE_GROUP_BITS = (2048, 3072)  # RFC 7919, apéndices A.1 y A.2
FFDHE_GROUP_NAMES = tuple(f"ffdhe-{bits}" for bits in FFDHE_GROUP_BITS)
SECURITY_BITS_KEY = "security_bits"
SCHNORR_GROUP_SIZES = {"schnorr-2048": (2048, 224), "schnorr-3072": (3072, 256)}  # NIST: 112 y 128 bits
MIN_Q_BITS = 2
MIN_COFACTOR_BITS = 2            # p necesita al menos 2 bits más que q para que exista un j par
MAX_COFACTOR_TRIES = 10_000      # candidatos j por cada q antes de probar con otro q
CACHED_GROUP_NAMES = (*(f"safe-{bits}" for bits in SAFE_GROUP_BITS), *SCHNORR_GROUP_SIZES)
GROUP_NAMES = (
    "toy",
    *(f"safe-{bits}" for bits in SAFE_GROUP_BITS),
    *(f"rfc-{bits}" for bits in RFC_GROUP_BITS),
    *FFDHE_GROUP_NAMES,
    *SCHNORR_GROUP_SIZES,
)


@dataclass(frozen=True)
class GroupParams:
    """Parámetros públicos del sistema (Tabla 1 del escrito): primo p, orden q y generador g."""

    p: int
    q: int
    g: int
    name: str            # "toy-23", "safe-512", "rfc3526-2048", "schnorr-2048", "schnorr-56-24", ...

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


def _even_cofactor_range(p_bits: int, q: int) -> tuple[int, int]:
    """Menor y mayor j par con 2^(p_bits − 1) ≤ j·q + 1 < 2^p_bits (p de exactamente p_bits bits)."""
    low = -(-((1 << (p_bits - 1)) - 1) // q)      # techo de (2^(p_bits − 1) − 1)/q
    high = ((1 << p_bits) - 2) // q
    low += low % 2
    high -= high % 2
    if low > high:
        raise ValueError(f"No hay un j par que dé un p de {p_bits} bits con q = {q}.")
    return low, high


def _prime_with_cofactor(q: int, p_bits: int) -> int | None:
    """Prueba j pares al azar (con secrets) hasta que p = j·q + 1 sea primo; None si no hay suerte."""
    low, high = _even_cofactor_range(p_bits, q)
    even_count = (high - low) // 2 + 1
    for _ in range(MAX_COFACTOR_TRIES):
        j = low + 2 * secrets.randbelow(even_count)
        p = j * q + 1
        if not _has_small_factor(p) and sympy.isprime(p):
            return p
    return None


def schnorr_group(p_bits: int, q_bits: int) -> GroupParams:
    """Grupo de Schnorr: q primo de q_bits bits y p = j·q + 1 primo de p_bits bits (definición 7). Cubre R7.

    Como indica el spec, q se elige con sympy.randprime en [2^(q_bits − 1), 2^q_bits); p, q y g
    son públicos, así que no hace falta secrets para q. Después se prueban j pares al azar (con
    secrets) hasta que p = j·q + 1 tenga exactamente p_bits bits y sea primo; j par garantiza
    que p sea impar. Si tras MAX_COFACTOR_TRIES candidatos no aparece un primo, se cambia q.
    g = generator_for(p, q) tiene orden q, aunque q sea mucho menor que p: así las potencias
    usan exponentes de q_bits bits y la autenticación es más rápida con el mismo nivel de
    seguridad (definición 10). Tarda segundos incluso para 2048/224.
    """
    if q_bits < MIN_Q_BITS or p_bits < q_bits + MIN_COFACTOR_BITS:
        raise ValueError(f"Se requiere q de al menos {MIN_Q_BITS} bits y p con al menos "
                         f"{MIN_COFACTOR_BITS} bits más que q (se pidió p de {p_bits} y q de {q_bits}).")
    while True:
        q = sympy.randprime(1 << (q_bits - 1), 1 << q_bits)
        p = _prime_with_cofactor(q, p_bits)
        if p is not None:
            return GroupParams(p=p, q=q, g=generator_for(p, q), name=f"schnorr-{p_bits}-{q_bits}")


def load_rfc_group(bits: int) -> GroupParams:
    """Grupos MODP de RFC 3526 (Kivinen y Kojo, 2003): 2048 bits (grupo 14) y 3072 (grupo 15). Cubre R7.

    p se copia del texto del RFC (secciones 3 y 4, en core/rfc3526.py), g = 2 y q = (p − 1)/2.
    Son primos seguros (definición 2) y NIST les asigna 112 y 128 bits de seguridad
    (definición 10). Otro tamaño lanza ValueError.
    """
    p = modp_prime(bits)
    return GroupParams(p=p, q=(p - 1) // 2, g=RFC3526_GENERATOR, name=f"rfc3526-{bits}")


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


def _cached_group(name: str, build: Callable[[], GroupParams], cache_path: Path) -> GroupParams:
    """Lee el grupo de core/groups.json; si falta, lo genera con build y lo guarda con ese nombre."""
    cache = _load_cache(cache_path)
    if name in cache:
        return _group_from_entry(name, cache[name])
    group = replace(build(), name=name)
    entry = {"p": str(group.p), "q": str(group.q), "g": str(group.g)}
    _save_cache(cache_path, {**cache, name: entry})
    return group


def load_ffdhe_group(name: str, cache_path: Path = GROUPS_FILE) -> GroupParams:
    """Grupos ffdhe2048 y ffdhe3072 del RFC 7919 (Gillmor, 2016), leídos de core/groups.json. Cubre R7.

    p se copió del apéndice A del RFC (p = 2^k − 2^(k − 64) + (⌊2^(k − 130)·e⌋ + X)·2^64 − 1),
    g = 2 y q = (p − 1)/2: son primos seguros (definición 2). No se generan nunca: si faltan en
    el archivo, ValueError.
    """
    cache = _load_cache(cache_path)
    if name not in FFDHE_GROUP_NAMES or name not in cache:
        raise ValueError(f"El grupo {name} del RFC 7919 no está en {cache_path.name}: se copia del RFC, "
                         "no se genera.")
    return _group_from_entry(name, cache[name])


def declared_security_bits(name: str, cache_path: Path = GROUPS_FILE) -> int | None:
    """Nivel de seguridad declarado por la fuente del grupo en core/groups.json, si lo hay. Cubre R7.

    El RFC 7919 estima 103 bits para ffdhe2048 y 125 para ffdhe3072 (definición 10); los demás
    grupos no declaran uno y se clasifican con la tabla de NIST (None).
    """
    entry = _load_cache(cache_path).get(name)
    if not isinstance(entry, dict) or SECURITY_BITS_KEY not in entry:
        return None
    return int(entry[SECURITY_BITS_KEY])


def _build_group(name: str, cache_path: Path) -> GroupParams:
    if name == "toy":
        return TOY_GROUP
    kind, bits_text = name.split("-")
    if kind == "rfc":
        return load_rfc_group(int(bits_text))
    if kind == "ffdhe":
        return load_ffdhe_group(name, cache_path)
    if kind == "safe":
        return _cached_group(name, partial(safe_prime_group, int(bits_text)), cache_path)
    return _cached_group(name, partial(schnorr_group, *SCHNORR_GROUP_SIZES[name]), cache_path)


def get_group(name: str, cache_path: Path = GROUPS_FILE) -> GroupParams:
    """Punto de entrada único para obtener (p, q, g). Cubre R1 y R7.

    Nombres: "toy", "safe-256", "safe-512", "safe-1024", "rfc-2048", "rfc-3072",
    "ffdhe-2048", "ffdhe-3072", "schnorr-2048" (q de 224 bits) y "schnorr-3072" (q de 256 bits).
    Los primos seguros y los grupos de Schnorr se leen de core/groups.json; si faltan, se generan
    y se guardan. Los grupos rfc se copian del RFC 3526 y los ffdhe del RFC 7919. El grupo siempre pasa por
    validate_params (los de Schnorr con require_safe_prime=False); si hay fallas, lanza
    ValueError con la lista.
    """
    if name not in GROUP_NAMES:
        raise ValueError(f"Grupo desconocido «{name}». Opciones: {', '.join(GROUP_NAMES)}.")
    group = _build_group(name, cache_path)
    failures = validate_params(group, require_safe_prime=not name.startswith("schnorr-"))
    if failures:
        raise ValueError(f"El grupo {name} no es válido: {'; '.join(failures)}.")
    return group


def _cache_name(choice: str) -> str:
    """«256» → «safe-256»; los nombres completos (safe-512, schnorr-2048, ...) se dejan igual."""
    return f"safe-{choice}" if choice.isdigit() else choice


def main(argv: list[str] | None = None) -> int:
    """Genera (o confirma) los grupos pedidos y los guarda en core/groups.json. Cubre R1 y R7.

    Acepta tamaños de primos seguros (256 512 1024) y nombres de grupos cacheados
    (safe-256, ..., schnorr-2048, schnorr-3072).
    """
    choices = (*(str(bits) for bits in SAFE_GROUP_BITS), *CACHED_GROUP_NAMES)
    parser = argparse.ArgumentParser(description="Genera primos seguros y grupos de Schnorr en core/groups.json.")
    parser.add_argument("--generate", nargs="+", choices=choices, required=True, metavar="GRUPO",
                        help=f"opciones: {' '.join(choices)}")
    args = parser.parse_args(argv)
    for choice in args.generate:
        start = time.perf_counter()
        group = get_group(_cache_name(choice))
        elapsed = time.perf_counter() - start
        print(f"{group.name}: p de {group.bits} bits, q de {group.q.bit_length()} bits ({elapsed:.1f} s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
