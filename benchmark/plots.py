"""Gráficas de la medición de latencia (R7, P3): results/latency.png y results/backends.png.

matplotlib se importa solo al graficar y con el backend no interactivo «Agg» (sin ventana).
Colores: uno por backend aritmético; estilo de línea y marcador por estructura del grupo.
"""

import statistics
from pathlib import Path

from benchmark.latency import KARATSUBA_EXPONENT, SAFE_SERIES, SCHOOLBOOK_EXPONENT

SURFACE, TEXT, TEXT_MUTED, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
BACKEND_COLORS = {"propia": "#2a78d6", "nativa": "#eb6834", "gmpy2": "#1baf7a"}
SERIES_STYLES = {"primo seguro": ("-", "o"), "schnorr": ("--", "D"), "ffdhe (RFC 7919)": ((0, (6, 2, 1, 2)), "s")}
REFERENCE_BACKEND = "propia"         # las rectas k³ y k^2.585 parten de su primer punto
BASELINE_BACKEND = "nativa"          # en backends.png los tiempos se expresan relativos a pow
MARKER_SIZE = 8
LINE_WIDTH = 2
DPI = 150
RELATIVE_HEADROOM = 1.15             # espacio sobre el punto más alto del panel relativo
RELATIVE_LABEL_ROOM = 1.6            # categorías extra a la derecha para las etiquetas directas


def _pyplot():
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    return plt


def _style_axes(ax, xlabel: str, ylabel: str, title: str) -> None:
    ax.set_facecolor(SURFACE)
    ax.set_xlabel(xlabel, color=TEXT_MUTED)
    ax.set_ylabel(ylabel, color=TEXT_MUTED)
    ax.set_title(title, color=TEXT, fontsize=11)
    ax.grid(True, which="major", color=GRID, linewidth=0.8)
    ax.tick_params(colors=TEXT_MUTED)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)


def _save(fig, path: Path) -> None:
    fig.tight_layout()
    fig.savefig(path, dpi=DPI, facecolor=SURFACE)


def _by_series_and_backend(rows: list[dict]) -> dict[tuple[str, str], list[dict]]:
    grouped: dict[tuple[str, str], list[dict]] = {}
    for row in rows:
        grouped.setdefault((row["series"], row["backend"]), []).append(row)
    return grouped


def _reference_lines(ax, rows: list[dict]) -> None:
    """Rectas ∝ k³ y ∝ k^2.585 desde el primer punto de la serie de primos seguros con «propia»."""
    base = [r for r in rows if r["series"] == SAFE_SERIES and r["backend"] == REFERENCE_BACKEND]
    if len(base) < 2:
        return
    k0, t0 = base[0]["bits_p"], base[0]["median_s"] * 1000
    bits = [r["bits_p"] for r in base]
    for exponent, style, label in ((SCHOOLBOOK_EXPONENT, ":", "∝ k³ (predicción del escrito)"),
                                   (KARATSUBA_EXPONENT, "-.", "∝ k^2.585 (Karatsuba)")):
        ax.plot(bits, [t0 * (k / k0) ** exponent for k in bits], linestyle=style, color=TEXT_MUTED,
                linewidth=1.5, label=label)


def _bits_ticks(ax, rows: list[dict]) -> None:
    """Marcas del eje x en los tamaños medidos, con las familias de cada tamaño debajo (una por línea)."""
    families: dict[int, list[str]] = {}
    for row in rows:
        names = families.setdefault(row["bits_p"], [])
        if row["family"] not in names:
            names.append(row["family"])
    ticks = sorted(families)
    ax.set_xticks(ticks)
    ax.set_xticklabels(["\n".join((str(k), *families[k])) for k in ticks])
    ax.minorticks_off()


def latency_figure(rows: list[dict], path: Path) -> None:
    """Tiempo frente a bits de p en escala log–log: una serie por estructura y backend. Cubre R7."""
    plt = _pyplot()
    fig, ax = plt.subplots(figsize=(8.5, 5.5), facecolor=SURFACE)
    for (series, backend), series_rows in _by_series_and_backend(rows).items():
        linestyle, marker = SERIES_STYLES[series]
        ax.plot([r["bits_p"] for r in series_rows], [r["median_s"] * 1000 for r in series_rows],
                linestyle=linestyle, marker=marker, markersize=MARKER_SIZE, linewidth=LINE_WIDTH,
                color=BACKEND_COLORS[backend], label=f"{backend} · {series}")
    _reference_lines(ax, rows)
    ax.set_xscale("log", base=2)
    ax.set_yscale("log")
    _bits_ticks(ax, rows)
    _style_axes(ax, "bits de p (k)", "mediana de una autenticación (ms, escala log)",
                "Latencia de una autenticación completa según el tamaño de p")
    ax.legend(frameon=False, labelcolor=TEXT, fontsize=8, loc="upper left")
    _save(fig, path)
    plt.close(fig)


def _group_names(rows: list[dict]) -> list[str]:
    return list(dict.fromkeys(r["name"] for r in rows))


def _backends(rows: list[dict]) -> list[str]:
    return list(dict.fromkeys(r["backend"] for r in rows))


def _median_ms(rows: list[dict], name: str, backend: str) -> float | None:
    found = [r["median_s"] * 1000 for r in rows if r["name"] == name and r["backend"] == backend]
    return found[0] if found else None


def _absolute_panel(ax, rows: list[dict]) -> None:
    names, backends = _group_names(rows), _backends(rows)
    width = 0.8 / len(backends)
    for index, backend in enumerate(backends):
        positions = [i + (index - (len(backends) - 1) / 2) * width for i in range(len(names))]
        heights = [_median_ms(rows, name, backend) or 0 for name in names]
        ax.bar(positions, heights, width=width, color=BACKEND_COLORS[backend], edgecolor=SURFACE,
               linewidth=1.5, label=backend)
    ax.set_yscale("log")
    ax.set_xticks(range(len(names)))
    ax.set_xticklabels(names, rotation=30, ha="right")
    _style_axes(ax, "grupo", "mediana (ms, escala log)", "Tiempo por backend")
    ax.legend(frameon=False, labelcolor=TEXT)


def _relative_panel(ax, rows: list[dict]) -> None:
    """Puntos (sin líneas: los grupos son categorías) con el tiempo de cada backend dividido por el de pow."""
    names = [n for n in _group_names(rows) if _median_ms(rows, n, BASELINE_BACKEND)]
    top = 0.0
    for backend in _backends(rows):
        values = [(_median_ms(rows, n, backend) or 0) / _median_ms(rows, n, BASELINE_BACKEND) for n in names]
        ax.plot(range(len(names)), values, marker="o", markersize=MARKER_SIZE, linestyle="none",
                color=BACKEND_COLORS[backend])
        typical = statistics.median(values)
        ax.annotate(f"{backend}: mediana {typical:.2f}×", (len(names) - 1, values[-1]), textcoords="offset points",
                    xytext=(10, 0), va="center", fontsize=8, color=TEXT)
        top = max(top, *values)
    ax.set_ylim(0, top * RELATIVE_HEADROOM)
    ax.set_xlim(-0.5, len(names) + RELATIVE_LABEL_ROOM)
    ax.set_xticks(range(len(names)))
    ax.set_xticklabels(names, rotation=30, ha="right")
    _style_axes(ax, "grupo", f"tiempo relativo a «{BASELINE_BACKEND}» (pow = 1)",
                "Mismo flujo, distinta implementación de mod_pow")


def backends_figure(rows: list[dict], path: Path) -> None:
    """Compara los backends por tamaño: tiempo absoluto y relativo a pow nativo. Cubre R7."""
    plt = _pyplot()
    fig, (absolute_ax, relative_ax) = plt.subplots(1, 2, figsize=(12, 5), facecolor=SURFACE)
    _absolute_panel(absolute_ax, rows)
    if BASELINE_BACKEND in _backends(rows):
        _relative_panel(relative_ax, rows)
    else:
        relative_ax.set_axis_off()
    _save(fig, path)
    plt.close(fig)
