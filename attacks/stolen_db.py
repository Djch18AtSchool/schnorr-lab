"""Base de datos robada: qué obtiene un atacante con la tabla id → y del banco (R10).

Con la tabla robada el atacante solo tiene claves públicas; para entrar necesita x, es decir,
resolver el logaritmo discreto (definición 9). Se mide BSGS con q de 16 a 40 bits y se
extrapola a los tamaños reales con la hipótesis de que el tiempo crece como √q.

Decisiones del experimento:
- Grupos de Schnorr generados al vuelo con p de q_bits + 32 bits (EXTRA_P_BITS). El número de
  pasos de BSGS depende de q, no de p; con p pequeño cada multiplicación cuesta poco, así que
  la predicción es una cota inferior favorable al atacante: con p de 2048 bits cada paso cuesta más.
- Se para en 40 bits: m = 2^20 entradas en el diccionario (unos 200 MB de memoria pico); con 44
  bits serían 2^22 entradas. La memoria, no solo el tiempo, crece como √q.
- Predicción: segundos por operación (mínimos cuadrados por el origen sobre las filas medidas)
  por las operaciones esperadas 1.5·√q (m pasos de bebé y, en promedio, m/2 de gigante).
  Para validar el modelo se ajusta sin la fila más grande y se predice esa fila.
"""

import csv
import json
import math
import statistics
from pathlib import Path

from attacks import bsgs
from core.params import schnorr_group

RESULTS_DIR = Path(__file__).resolve().parent.parent / "results"
DEFAULT_BITS = (16, 20, 24, 28, 32, 36, 40)
EXTRA_P_BITS = 32                       # p de q_bits + 32 bits
PREDICTION_Q_BITS = (160, 224, 256)     # q real: DSA clásico, schnorr-2048 y schnorr-3072
AVERAGE_STEPS_FACTOR = 1.5              # m pasos de bebé + m/2 de gigante en promedio
EXPECTED_GROWTH_EXPONENT = 0.5          # log₂(tiempo) crece 0.5 por cada bit de q (√q)
SECONDS_PER_YEAR = 365.25 * 24 * 3600
UNIVERSE_AGE_YEARS = 1.38e10
MIN_ROWS_FOR_HOLDOUT = 3
CSV_FIELDS = ("q_bits", "p_bits", "x_real", "x_found", "operations", "seconds")
PLOT_MAX_Q_BITS = 260
PLOT_HEADROOM = 1e6                     # espacio sobre la predicción mayor para su etiqueta
# Paleta de las gráficas: superficie clara, tinta de texto y dos colores categóricos.
SURFACE, TEXT, TEXT_MUTED, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
MEASURED_COLOR, PREDICTION_COLOR = "#2a78d6", "#eb6834"


def _measure(q_bits: int) -> dict:
    """Genera un grupo de Schnorr, registra a una víctima, roba y y mide BSGS."""
    group = schnorr_group(q_bits + EXTRA_P_BITS, q_bits)
    result = bsgs.run(group)
    return {"q_bits": q_bits, "p_bits": group.bits, "x_real": result["x_real"],
            "x_found": result["x_found"], "operations": result["operations"], "seconds": result["seconds"]}


def fit_seconds_per_operation(rows: list[dict]) -> float:
    """Pendiente de segundos = c·operaciones por mínimos cuadrados por el origen. Cubre R10."""
    if not rows:
        raise ValueError("Se necesita al menos una fila medida para ajustar el costo por operación.")
    return sum(r["operations"] * r["seconds"] for r in rows) / sum(r["operations"] ** 2 for r in rows)


def fit_growth_exponent(rows: list[dict]) -> float:
    """Pendiente de log₂(segundos) frente a los bits de q; √q predice 0.5. Cubre R10."""
    if len(rows) < 2:
        raise ValueError("Se necesitan al menos dos tamaños de q para estimar el crecimiento.")
    fit = statistics.linear_regression([r["q_bits"] for r in rows], [math.log2(r["seconds"]) for r in rows])
    return fit.slope


def predict(q_bits: int, seconds_per_operation: float) -> dict:
    """Tiempo esperado de BSGS para q de q_bits bits, extrapolando √q (definición 9). Cubre R10.

    Operaciones esperadas 1.5·2^(q_bits/2) y memoria de 2^(q_bits/2) entradas. Es una cota
    inferior: supone el costo por operación medido con p pequeño y memoria ilimitada.
    """
    operations = AVERAGE_STEPS_FACTOR * 2 ** (q_bits / 2)
    seconds = seconds_per_operation * operations
    return {"q_bits": q_bits, "operations": operations, "memory_entries": 2 ** (q_bits / 2),
            "seconds": seconds, "years": seconds / SECONDS_PER_YEAR}


def summarize(rows: list[dict]) -> dict:
    """Ajuste, validación con la fila más grande y predicciones para q de 160, 224 y 256 bits. Cubre R10."""
    seconds_per_operation = fit_seconds_per_operation(rows)
    summary = {
        "extra_p_bits": EXTRA_P_BITS,
        "fit": {"seconds_per_operation": seconds_per_operation,
                "growth_exponent": fit_growth_exponent(rows) if len(rows) > 1 else None,
                "expected_growth_exponent": EXPECTED_GROWTH_EXPONENT},
        "holdout": None,
        "predictions": [predict(bits, seconds_per_operation) for bits in PREDICTION_Q_BITS],
        "universe_age_years": UNIVERSE_AGE_YEARS,
    }
    if len(rows) >= MIN_ROWS_FOR_HOLDOUT:
        last = rows[-1]
        predicted = fit_seconds_per_operation(rows[:-1]) * last["operations"]
        summary["holdout"] = {"q_bits": last["q_bits"], "predicted_seconds": predicted,
                              "measured_seconds": last["seconds"],
                              "relative_error": abs(predicted - last["seconds"]) / last["seconds"]}
    return summary


def stolen_db_experiment(bits: list[int] | None = None, verbose: bool = False,
                         results_dir: Path | None = RESULTS_DIR) -> list[dict]:
    """Una fila por tamaño de q: bits de q y p, x real, x encontrada, operaciones y segundos. Cubre R10.

    Los grupos se generan al vuelo (p de q_bits + 32 bits). Guarda en results_dir bsgs.csv,
    bsgs.json (filas, ajuste y predicciones en años para q de 160, 224 y 256 bits) y la gráfica
    en escala logarítmica bsgs.png; con results_dir=None no guarda nada. Hipótesis: el tiempo
    crece como √q.
    """
    sizes = sorted(bits) if bits else list(DEFAULT_BITS)
    too_big = [size for size in sizes if size > bsgs.MAX_BSGS_Q_BITS]
    if too_big:
        raise ValueError(f"Tamaños de q demasiado grandes para medir: {too_big} (máximo {bsgs.MAX_BSGS_Q_BITS}).")
    rows = [_measure(size) for size in sizes]
    summary = summarize(rows)
    if results_dir is not None:
        save_results(rows, summary, results_dir)
    if verbose:
        _print_report(rows, summary)
    return rows


def save_results(rows: list[dict], summary: dict, results_dir: Path) -> None:
    """Escribe bsgs.csv, bsgs.json y bsgs.png en results_dir. Cubre R10."""
    results_dir.mkdir(parents=True, exist_ok=True)
    with (results_dir / "bsgs.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    payload = {"rows": rows, **summary}
    (results_dir / "bsgs.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                                           encoding="utf-8")
    plot(rows, summary, results_dir / "bsgs.png")


def plot(rows: list[dict], summary: dict, path: Path) -> None:
    """Dos paneles con eje y logarítmico: medición con referencia ∝ √q y extrapolación en años. Cubre R10."""
    import matplotlib

    matplotlib.use("Agg")  # sin ventana: solo se guarda el PNG
    import matplotlib.pyplot as plt

    seconds_per_operation = summary["fit"]["seconds_per_operation"]
    fig, (measured_ax, extrapolated_ax) = plt.subplots(1, 2, figsize=(11, 4.5), facecolor=SURFACE)
    _plot_measured(measured_ax, rows, seconds_per_operation)
    _plot_extrapolation(extrapolated_ax, rows, summary)
    fig.suptitle("Base de datos robada: costo de recuperar x a partir de y con BSGS", color=TEXT)
    fig.tight_layout()
    fig.savefig(path, dpi=150, facecolor=SURFACE)
    plt.close(fig)


def _model_seconds(q_bits: list[float], seconds_per_operation: float) -> list[float]:
    return [seconds_per_operation * AVERAGE_STEPS_FACTOR * 2 ** (bits / 2) for bits in q_bits]


def _style_axes(ax, xlabel: str, ylabel: str, title: str) -> None:
    ax.set_facecolor(SURFACE)
    ax.set_yscale("log")
    ax.set_xlabel(xlabel, color=TEXT_MUTED)
    ax.set_ylabel(ylabel, color=TEXT_MUTED)
    ax.set_title(title, color=TEXT, fontsize=11)
    ax.grid(True, which="major", color=GRID, linewidth=0.8)
    ax.tick_params(colors=TEXT_MUTED)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)


def _plot_measured(ax, rows: list[dict], seconds_per_operation: float) -> None:
    bits = [r["q_bits"] for r in rows]
    ax.plot(bits, _model_seconds(bits, seconds_per_operation), color=TEXT_MUTED, linestyle="--",
            linewidth=2, label="referencia ∝ √q (ajuste)")
    ax.plot(bits, [r["seconds"] for r in rows], "o", color=MEASURED_COLOR, markersize=8, label="medido")
    ax.set_xticks(bits)
    _style_axes(ax, "bits de q", "tiempo de BSGS (s, escala log)", "Medición con q pequeño")
    ax.legend(frameon=False, labelcolor=TEXT)


def _plot_extrapolation(ax, rows: list[dict], summary: dict) -> None:
    seconds_per_operation = summary["fit"]["seconds_per_operation"]
    curve_bits = list(range(min(r["q_bits"] for r in rows), PLOT_MAX_Q_BITS + 1, 4))
    curve_years = [s / SECONDS_PER_YEAR for s in _model_seconds(curve_bits, seconds_per_operation)]
    ax.plot(curve_bits, curve_years, color=TEXT_MUTED, linestyle="--", linewidth=2, label="extrapolación ∝ √q")
    ax.plot([r["q_bits"] for r in rows], [r["seconds"] / SECONDS_PER_YEAR for r in rows], "o",
            color=MEASURED_COLOR, markersize=8, label="medido")
    predictions = summary["predictions"]
    ax.plot([p["q_bits"] for p in predictions], [p["years"] for p in predictions], "D",
            color=PREDICTION_COLOR, markersize=8, label="predicción")
    for p in predictions:
        ax.annotate(f"q de {p['q_bits']} bits: ≈ {p['years']:.1e} años", (p["q_bits"], p["years"]),
                    textcoords="offset points", xytext=(-10, 6), ha="right", va="bottom", fontsize=8, color=TEXT)
    ax.axhline(UNIVERSE_AGE_YEARS, color=TEXT_MUTED, linestyle=":", linewidth=1.5)
    ax.annotate(f"edad del universo ≈ {UNIVERSE_AGE_YEARS:.2e} años", (curve_bits[0], UNIVERSE_AGE_YEARS),
                textcoords="offset points", xytext=(0, -6), va="top", fontsize=8, color=TEXT_MUTED)
    _style_axes(ax, "bits de q", "tiempo de BSGS (años, escala log)", "Extrapolación a tamaños reales")
    ax.set_ylim(top=max(p["years"] for p in predictions) * PLOT_HEADROOM)
    ax.legend(frameon=False, labelcolor=TEXT, loc="lower right")


def run(bits: list[int] | None = None, verbose: bool = False) -> list[dict]:
    """Punto de entrada del menú (opción 4): ejecuta stolen_db_experiment y guarda results/. Cubre R10."""
    return stolen_db_experiment(bits, verbose, results_dir=RESULTS_DIR)


def _print_report(rows: list[dict], summary: dict) -> None:
    print("[Base de datos robada] El atacante solo tiene y; recupera x con BSGS en grupos pequeños:")
    print(f"    {'bits de q':>9} {'bits de p':>9} {'operaciones':>12} {'segundos':>10}  ¿x correcta?")
    for r in rows:
        ok = "sí" if r["x_found"] == r["x_real"] else "no"
        print(f"    {r['q_bits']:>9} {r['p_bits']:>9} {r['operations']:>12,} {r['seconds']:>10.4f}  {ok}")
    fit = summary["fit"]
    print(f"    Costo por operación ≈ {fit['seconds_per_operation']:.2e} s.")
    if fit["growth_exponent"] is not None:
        print(f"    Crecimiento medido: log₂(tiempo) sube {fit['growth_exponent']:.2f} por bit de q "
              f"(√q predice {EXPECTED_GROWTH_EXPONENT:.2f}).")
    if summary["holdout"]:
        h = summary["holdout"]
        print(f"    Validación: sin la fila de {h['q_bits']} bits se predicen {h['predicted_seconds']:.3f} s; "
              f"se midieron {h['measured_seconds']:.3f} s (error {h['relative_error']:.0%}).")
    for p in summary["predictions"]:
        print(f"    q de {p['q_bits']} bits: unas {p['operations']:.1e} operaciones ≈ {p['years']:.1e} años "
              f"(edad del universo: {UNIVERSE_AGE_YEARS:.1e} años).")


def years_text(log10_operations: float, seconds_per_operation: float) -> str:
    """Años de cómputo en notación científica, calculados con logaritmos para no desbordar el float. Cubre R10.

    Con q de 2047 bits hacen falta ≈ 2^1023 operaciones: en punto flotante el producto daría «inf».
    """
    exponent = log10_operations + math.log10(seconds_per_operation) - math.log10(SECONDS_PER_YEAR)
    power = math.floor(exponent)
    mantissa = round(10 ** (exponent - power), 1)
    if mantissa >= 10:
        mantissa, power = mantissa / 10, power + 1
    return f"{mantissa:.1f}·10^{power}"


def measured_seconds_per_operation(results_dir: Path = RESULTS_DIR) -> float | None:
    """Segundos por operación de BSGS medidos en el experimento (results/bsgs.json), si existe. Cubre R10."""
    try:
        data = json.loads((results_dir / "bsgs.json").read_text(encoding="utf-8"))
        return float(data["fit"]["seconds_per_operation"])
    except (OSError, ValueError, KeyError, TypeError):
        return None
