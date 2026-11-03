"""Base de datos robada: qué obtiene un atacante con la tabla id → y del banco (R10).

ESQUELETO: informe final. Con la tabla robada el atacante solo tiene claves públicas; para
entrar necesita x, es decir, resolver el logaritmo discreto (definición 9). Se mide el tiempo
de BSGS con q de 16 a 40 bits y se extrapola a los tamaños reales.
"""

from pathlib import Path

PENDING_MESSAGE = "Disponible en el informe final: base de datos robada"
RESULTS_DIR = Path(__file__).resolve().parent.parent / "results"
DEFAULT_BITS = (16, 20, 24, 28, 32, 36, 40)


def run(bits: list[int] | None = None, verbose: bool = False) -> list[dict]:
    """Una fila por tamaño de q: bits, x real, x encontrada, operaciones y segundos. Cubre R10.

    Los grupos se generan al vuelo; guarda results/bsgs.csv y la gráfica en escala
    logarítmica results/bsgs.png. Hipótesis: el tiempo crece como √q.
    """
    raise NotImplementedError(PENDING_MESSAGE)
