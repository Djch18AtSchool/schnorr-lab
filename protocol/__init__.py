"""Protocolo de Schnorr: cliente, banco y transcripciones (R2, R3, R6, R8, R9).

Las interfaces (demo.py, api/, http_client.py) y los experimentos (benchmark/) solo importan
este paquete: aquí se reexporta la selección y validación de grupos de core.params y la
selección del backend aritmético de core.modular, para que no dependan de core/.
"""

from core.modular import ARITHMETIC_BACKENDS, get_backend, use_backend
from core.params import GROUP_NAMES, TOY_GROUP, GroupParams, get_group, validate_params

__all__ = [
    "ARITHMETIC_BACKENDS",
    "GROUP_NAMES",
    "TOY_GROUP",
    "GroupParams",
    "get_backend",
    "get_group",
    "use_backend",
    "validate_params",
]
