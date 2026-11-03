"""Latencia de una autenticación completa según el tamaño k de p (R7, interrogante P3).

ESQUELETO: informe final. Hipótesis del escrito: cada potencia modular cuesta del orden de
k³ operaciones de bits (definición 8; Menezes et al., 1996), así que duplicar k multiplica el
tiempo por cerca de 2³ = 8. Como CPython multiplica enteros grandes con Karatsuba, también se
compara con k^(1 + log₂3) ≈ k^2.585, que predice una razón cercana a 6. La medición del
mod_pow propio frente a pow nativo se hace aparte, para no confundir esa diferencia con el
efecto de k. El nivel de seguridad de cada tamaño sigue la definición 10 (Barker, 2020).
"""

from pathlib import Path

from protocol import GroupParams

PENDING_MESSAGE = "Disponible en el informe final: medición de latencia"
DEFAULT_REPS = 31
RESULTS_DIR = Path(__file__).resolve().parent.parent / "results"
GROUPS_TO_MEASURE = ("safe-256", "safe-512", "safe-1024", "rfc-2048", "rfc-3072",
                     "schnorr-2048", "schnorr-3072")


def measure_auth(gp: GroupParams, reps: int = DEFAULT_REPS) -> float:
    """Mediana en segundos (time.perf_counter) de commit + challenge + respond + verify. Cubre R7."""
    raise NotImplementedError(PENDING_MESSAGE)


def measure(groups: list[str] | None = None, reps: int = DEFAULT_REPS) -> list[dict]:
    """Una fila por grupo: name, bits_p, bits_q, mediana, razón con el anterior y predicciones. Cubre R7.

    Guarda results/latency.csv.
    """
    raise NotImplementedError(PENDING_MESSAGE)


def plot(rows: list[dict]) -> None:
    """results/latency.png: tiempo frente a bits de p (primos seguros y grupos de Schnorr), ejes log. Cubre R7."""
    raise NotImplementedError(PENDING_MESSAGE)
