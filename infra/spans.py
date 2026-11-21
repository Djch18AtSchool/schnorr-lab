"""Trazas de código: qué función ejecutó el servidor y qué línea decidió (R11).

Un «span» es el fragmento real del archivo fuente de una función, con sus números de línea,
listo para mostrarlo en la terminal del banco del Escenario. Se lee del código en ejecución
(inspect), así nunca se desincroniza del repositorio. La línea resaltada se elige por su
texto (no por número), para que siga siendo correcta si el archivo cambia.
"""

import inspect
from collections.abc import Callable
from functools import cache
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
TONES = frozenset({"ok", "bad"})


def _without_docstring(lines: list[str], start: int) -> list[tuple[int, str]]:
    """Numera las líneas y omite el docstring de la función (si lo tiene)."""
    numbered = [(start + offset, line.rstrip("\n")) for offset, line in enumerate(lines)]
    body = [i for i, (_, text) in enumerate(numbered) if text.strip()]
    if len(body) < 2:
        return numbered
    first = body[1]
    opening = numbered[first][1].strip()
    quote = opening[:3]
    if quote not in ('"""', "'''"):
        return numbered
    end = first
    if not (len(opening) > 3 and opening.endswith(quote)):
        end = next((i for i in range(first + 1, len(numbered)) if quote in numbered[i][1]), first)
    return numbered[:first] + numbered[end + 1:]


@cache
def _source(function: Callable[..., Any]) -> tuple[str, str, tuple[tuple[int, str], ...]]:
    target = inspect.unwrap(function)
    lines, start = inspect.getsourcelines(target)
    file = Path(inspect.getsourcefile(target) or "").resolve()
    try:
        relative = file.relative_to(ROOT).as_posix()
    except ValueError:
        relative = file.name
    return relative, target.__qualname__, tuple(_without_docstring(lines, start))


def code_span(function: Callable[..., Any], highlight: tuple[str, ...] = (), tone: str = "ok") -> dict[str, Any]:
    """Fragmento de la función con las líneas que contienen alguno de los textos resaltadas. Cubre R11.

    ValueError si un texto a resaltar no aparece en la función: así un cambio en el código que
    rompa la traza falla en las pruebas en lugar de mostrar una línea equivocada.
    """
    if tone not in TONES:
        raise ValueError(f"Tono desconocido: {tone!r}.")
    file, name, lines = _source(function)
    marked = []
    for text in highlight:
        matches = [number for number, line in lines if text in line]
        if not matches:
            raise ValueError(f"«{text}» no aparece en {name}.")
        marked.append(matches[0])
    return {"file": file, "function": name, "lines": [{"n": n, "text": t} for n, t in lines],
            "highlight": sorted(set(marked)), "tone": tone}
