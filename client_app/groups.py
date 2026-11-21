"""Grupos que se pueden elegir desde el Escenario, con su tamaño y nivel de seguridad (R7)."""

from functools import cache
from typing import Any

from core.params import GROUP_NAMES, get_group

SECURITY_BITS = {"safe-1024": 80, "rfc-2048": 112, "rfc-3072": 128, "schnorr-2048": 112, "schnorr-3072": 128,
                 "ffdhe2048": 103, "ffdhe3072": 125}
LABELS = {"toy": "p = 23 (ejemplo del escrito)", "safe-256": "primo seguro de 256 bits",
          "safe-512": "primo seguro de 512 bits", "safe-1024": "primo seguro de 1024 bits",
          "rfc-2048": "RFC 3526, 2048 bits", "rfc-3072": "RFC 3526, 3072 bits",
          "schnorr-2048": "Schnorr 2048 bits, q de 224", "schnorr-3072": "Schnorr 3072 bits, q de 256"}


@cache
def group_options() -> tuple[dict[str, Any], ...]:
    """Cada grupo disponible: id, etiqueta, bits de p y de q y bits de seguridad (si aplica). Cubre R7."""
    options = []
    for name in GROUP_NAMES:
        gp = get_group(name)
        options.append({"id": name, "label": LABELS.get(name, name), "bits": gp.bits, "q_bits": gp.q.bit_length(),
                        "security_bits": SECURITY_BITS.get(name), "name": gp.name})
    return tuple(options)

