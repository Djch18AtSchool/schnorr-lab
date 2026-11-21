"""Gráficas de la comparación de mecanismos (C5): latencia, red y base de datos robada.

Mismo estilo que benchmark/plots.py (superficie clara, ejes discretos, paleta categórica en
orden fijo). Los escenarios van en el eje y con su nombre, así la identidad nunca depende solo
del color: el color distingue la medida (inicio de sesión, registro, ...).
"""

import math
from pathlib import Path
from typing import Any

from benchmark.plots import GRID, SURFACE, TEXT, TEXT_MUTED, _pyplot, _save, _style_axes

SERIES_COLORS = ("#2a78d6", "#eb6834", "#1baf7a")          # azul, naranja, aguamarina (orden fijo)
BAR_HEIGHT = 0.26
LABEL_FONT_SIZE = 8
UNIVERSE_LOG10_YEARS = math.log10(1.38e10)
ONE_YEAR_LOG10 = 0.0
CLIP_MARGIN = 8                       # log₁₀ años de margen sobre la barra más alta no recortada
CLIPPED_THRESHOLD = 100               # por encima de 10^100 años la barra se recorta y se rotula
FIGURE_SIZE = (10, 5.2)
NETWORK_FIGURE_SIZE = (12, 5.6)
LEGEND_BELOW = {"loc": "upper center", "bbox_to_anchor": (0.5, -0.14), "ncol": 2}


STOLEN_DB_NOTES = {"totp": "\n(K robado: el 2.º factor cae al instante)"}


def _labels(rows: list[dict[str, Any]], notes: dict[str, str] | None = None) -> list[str]:
    return [row["label"] + (notes or {}).get(row["mechanism"], "") for row in rows]


def _legend(ax, below: bool = False) -> None:
    placement = LEGEND_BELOW if below else {"loc": "lower right"}
    ax.legend(frameon=False, labelcolor=TEXT, fontsize=LABEL_FONT_SIZE, **placement)


def _grouped_bars(ax, rows: list[dict[str, Any]], series: list[tuple[str, list[float]]], fmt: str) -> None:
    """Barras horizontales agrupadas por escenario, con el valor al final de cada barra."""
    ax.set_axisbelow(True)
    count = len(series)
    for index, (name, values) in enumerate(series):
        offsets = [i + (index - (count - 1) / 2) * BAR_HEIGHT for i in range(len(rows))]
        bars = ax.barh(offsets, values, height=BAR_HEIGHT, color=SERIES_COLORS[index], edgecolor=SURFACE,
                       linewidth=2, label=name)
        ax.bar_label(bars, labels=[format(v, fmt) for v in values], padding=3, fontsize=LABEL_FONT_SIZE,
                     color=TEXT)
    ax.set_yticks(range(len(rows)))
    ax.set_yticklabels(_labels(rows))
    ax.invert_yaxis()


def latency_figure(result: dict[str, Any], path: Path) -> None:
    """Mediana del registro y del inicio de sesión (con y sin descargar parámetros) por escenario. Cubre C5."""
    plt = _pyplot()
    rows = result["rows"]
    fig, ax = plt.subplots(figsize=FIGURE_SIZE, facecolor=SURFACE)
    _grouped_bars(ax, rows, [("inicio de sesión", [r["login_ms"] for r in rows]),
                             ("inicio sin descargar parámetros", [r["login_without_params_ms"] for r in rows]),
                             ("registro", [r["register_ms"] for r in rows])], ".1f")
    ax.set_xlim(0, max(max(r["login_ms"], r["register_ms"]) for r in rows) * 1.15)
    _legend(ax)
    _style_axes(ax, f"mediana de {result['reps']} repeticiones (ms; backend «{result['backend']}»)", "",
                "Latencia cliente + banco en el mismo proceso")
    _save(fig, path)
    plt.close(fig)


def network_figure(result: dict[str, Any], path: Path) -> None:
    """Idas y vueltas y bytes de los cuerpos JSON de un inicio de sesión. Cubre C5."""
    plt = _pyplot()
    rows = result["rows"]
    fig, (trips_ax, bytes_ax) = plt.subplots(1, 2, figsize=NETWORK_FIGURE_SIZE, facecolor=SURFACE,
                                             gridspec_kw={"width_ratios": [1, 1.6]})
    trips = trips_ax.barh(range(len(rows)), [r["login_network"]["round_trips"] for r in rows],
                          color=SERIES_COLORS[0], edgecolor=SURFACE, linewidth=2, height=0.6)
    trips_ax.bar_label(trips, padding=3, fontsize=LABEL_FONT_SIZE, color=TEXT)
    trips_ax.set_yticks(range(len(rows)))
    trips_ax.set_yticklabels(_labels(rows))
    trips_ax.invert_yaxis()
    trips_ax.set_axisbelow(True)
    _style_axes(trips_ax, "idas y vueltas (incluye GET de parámetros)", "", "Mensajes por inicio de sesión")
    _grouped_bars(bytes_ax, rows, [("enviados", [r["login_network"]["sent_bytes"] for r in rows]),
                                   ("recibidos", [r["login_network"]["received_bytes"] for r in rows])], "d")
    bytes_ax.set_xscale("log")
    _legend(bytes_ax, below=True)
    bytes_ax.set_yticklabels([])
    _style_axes(bytes_ax, "bytes de los cuerpos JSON (escala log)", "", "Bytes por inicio de sesión")
    _save(fig, path)
    plt.close(fig)


def _unique_by_secret(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Un escenario por lo que se roba (el ZKP interactivo y el no interactivo guardan lo mismo)."""
    seen, unique = set(), []
    for row in rows:
        key = (row["mechanism"], row["group"])
        if key not in seen:
            seen.add(key)
            unique.append(row)
    return unique


def _clip(values: list[float | None], limit: float) -> list[float]:
    return [min(v, limit) if v is not None else 0.0 for v in values]


def _stolen_limit(values: list[float | None]) -> float:
    shown = [v for v in values if v is not None and v < CLIPPED_THRESHOLD]
    return max(shown, default=0.0) + CLIP_MARGIN


def stolen_db_figure(result: dict[str, Any], path: Path) -> None:
    """log₁₀ de los años para romper lo robado: diccionario de 10^6 y 8 caracteres al azar (o BSGS). Cubre C5."""
    plt = _pyplot()
    rows = _unique_by_secret(result["rows"])
    dictionary = [r["offline_dictionary_log10_years"] for r in rows]
    random8 = [r["offline_random8_log10_years"] for r in rows]
    limit = _stolen_limit(dictionary + random8)
    fig, ax = plt.subplots(figsize=NETWORK_FIGURE_SIZE, facecolor=SURFACE)
    offsets = [(i - BAR_HEIGHT / 2, i + BAR_HEIGHT / 2) for i in range(len(rows))]
    for index, (name, values) in enumerate((("diccionario de 10^6 contraseñas comunes", dictionary),
                                            ("8 caracteres al azar (ZKP: BSGS sobre y)", random8))):
        positions = [pair[index] for pair in offsets]
        ax.barh(positions, _clip(values, limit), height=BAR_HEIGHT, color=SERIES_COLORS[index], edgecolor=SURFACE,
                linewidth=2, label=name)
        for position, value in zip(positions, values, strict=True):
            text = "no aplica" if value is None else f"10^{value:.1f} años" + (" →" if value > limit else "")
            end = 0.0 if value is None else min(value, limit)
            ax.text(end, position, f"  {text}  ", va="center", ha="right" if end < 0 else "left",
                    fontsize=LABEL_FONT_SIZE, color=TEXT)
    for x, label in ((ONE_YEAR_LOG10, "1 año"), (UNIVERSE_LOG10_YEARS, "edad del universo")):
        ax.axvline(x, color=TEXT_MUTED, linestyle=":", linewidth=1.2)
        ax.text(x, len(rows) - 0.45, f" {label}", fontsize=LABEL_FONT_SIZE, color=TEXT_MUTED, va="bottom")
    ax.axvline(0, color=GRID, linewidth=0.8)
    ax.set_yticks(range(len(rows)))
    ax.set_yticklabels(_labels(rows, STOLEN_DB_NOTES))
    ax.invert_yaxis()
    ax.set_xlim(min(v for v in dictionary + random8 if v is not None) - 6, limit + CLIP_MARGIN)
    ax.set_axisbelow(True)
    _legend(ax, below=True)
    _style_axes(ax, "log₁₀(años) en un núcleo de este equipo", "",
                "Base de datos robada: costo del ataque fuera de línea")
    _save(fig, path)
    plt.close(fig)


FIGURES = {"comparacion_latencia.png": latency_figure, "comparacion_red.png": network_figure,
           "comparacion_base_robada.png": stolen_db_figure}


def all_figures(result: dict[str, Any], results_dir: Path) -> list[Path]:
    """Genera las tres gráficas en results_dir y devuelve sus rutas. Cubre C5."""
    results_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for name, figure in FIGURES.items():
        figure(result, results_dir / name)
        paths.append(results_dir / name)
    return paths
