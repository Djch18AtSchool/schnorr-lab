"""Protocolo de Schnorr: cliente, banco y transcripciones (R2, R3, R6, R8, R9).

Las interfaces (demo.py, api/, http_client.py) solo importan este paquete: aquí se
reexporta la selección de grupos de core.params para que no dependan de core/.
"""

from core.params import GROUP_NAMES, TOY_GROUP, GroupParams, get_group

__all__ = ["GROUP_NAMES", "TOY_GROUP", "GroupParams", "get_group"]
