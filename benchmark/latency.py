"""Latencia de una autenticación completa según el tamaño k de p (R7, interrogante P3).

Hipótesis del escrito: cada potencia modular cuesta del orden de k³ operaciones de bits
(definición 8; Menezes et al., 1996), así que duplicar k multiplica el tiempo por cerca de
2³ = 8. Como referencia también se compara con Karatsuba, k^(1 + log₂3) ≈ k^2.585, que
predice una razón cercana a 6; pero CPython 3.12 multiplica con el método escolar hasta 70
dígitos de 30 bits (unos 2100 bits) y, en los cuadrados, hasta 140 dígitos (unos 4200 bits),
así que en este rango una razón menor que 8 viene de costos que crecen más despacio que k³,
no de Karatsuba. El nivel de seguridad de cada tamaño sigue la definición 10 (Barker, 2020).

Diseño de la medición:
- Una autenticación = commit + challenge (que valida t con t^q) + respond + verify (g^s, y^c e
  inverso de y^c con Euclides extendido), con un cliente ya registrado. Se hace una
  autenticación de calentamiento y se informa la mediana de reps repeticiones (time.perf_counter).
- Backends de mod_pow (core.modular): «propia» (la del protocolo), «nativa» (pow) y «gmpy2».
  Se miden con los mismos grupos y el mismo flujo, para que el factor constante de cada
  implementación no se confunda con el efecto de k. mod_inverse es siempre el propio.
- Razón medida: contra el tamaño anterior de la misma estructura y el mismo backend. Los grupos
  RFC 3526 también son primos seguros, así que safe-256 → safe-512 → safe-1024 → rfc-2048 →
  rfc-3072 forman una serie (incluye la duplicación 1024 → 2048 del escrito); los de Schnorr, otra.
  Los grupos ffdhe del RFC 7919 (también primos seguros, g = 2) forman una serie aparte para no
  romper la anterior: ffdhe-2048 → ffdhe-3072. Su nivel de seguridad es el que declara el RFC
  (103 y 125 bits), no el de la tabla de NIST.
- En los grupos de Schnorr el exponente tiene los bits de q (224 o 256), no k: el costo es del
  orden de (bits de q)·k², por eso son más rápidos con la misma seguridad.

Uso: ``python -m benchmark.latency`` mide todo, guarda results/latency.csv, latency.json,
latency.png y backends.png e imprime la tabla. Con 31 repeticiones tarda alrededor de un minuto.
"""

import argparse
import csv
import json
import math
import platform
import statistics
import time
import warnings
from pathlib import Path

from core.params import declared_security_bits
from protocol import ARITHMETIC_BACKENDS, GroupParams, get_group, use_backend
from protocol.bank import Bank
from protocol.client import Client
from protocol.transcript import VerifyResult

DEFAULT_REPS = 31
WARMUP_AUTHS = 1
USER_ID = "cliente01"
RESULTS_DIR = Path(__file__).resolve().parent.parent / "results"
GROUPS_TO_MEASURE = ("safe-256", "safe-512", "safe-1024", "rfc-2048", "rfc-3072",
                     "ffdhe-2048", "ffdhe-3072", "schnorr-2048", "schnorr-3072")
DEFAULT_BACKENDS = ARITHMETIC_BACKENDS
SCHOOLBOOK_EXPONENT = 3                       # predicción del escrito: k³
KARATSUBA_EXPONENT = 1 + math.log2(3)         # ≈ 2.585
NIST_SECURITY_BITS = {1024: 80, 2048: 112, 3072: 128}   # definición 10 (Barker, 2020)
BELOW_MIN_SECURITY = "<80"
SAFE_SERIES, SCHNORR_SERIES, FFDHE_SERIES = "primo seguro", "schnorr", "ffdhe (RFC 7919)"
SERIES_ORDER = (SAFE_SERIES, FFDHE_SERIES, SCHNORR_SERIES)
FFDHE_FAMILY = "ffdhe"
CSV_FIELDS = ("name", "family", "series", "bits_p", "bits_q", "security_bits", "backend", "reps",
              "median_s", "previous", "ratio", "pred_k3", "pred_karatsuba", "err_k3", "err_karatsuba")


def _authenticate(bank: Bank, client: Client) -> None:
    """Un inicio de sesión honesto completo; si el banco lo rechaza, la medición no vale."""
    challenge = bank.challenge(client.user_id, client.commit())
    if isinstance(challenge, VerifyResult):
        raise RuntimeError(f"El banco rechazó el compromiso: {challenge.reason}")
    session_id, c = challenge
    result = bank.verify(session_id, client.respond(c))
    if not result.accepted:
        raise RuntimeError(f"La autenticación honesta fue rechazada: {result.reason}")


def measure_auth(gp: GroupParams, reps: int = DEFAULT_REPS) -> float:
    """Mediana en segundos (time.perf_counter) de commit + challenge + respond + verify. Cubre R7.

    El cliente se registra antes de medir y se hace una autenticación de calentamiento.
    Usa el backend aritmético activo (use_backend); por defecto, la implementación propia.
    """
    if reps < 1:
        raise ValueError(f"reps debe ser al menos 1 (se recibió {reps}).")
    bank, client = Bank(gp), Client(USER_ID, gp)
    bank.register(*client.register_payload())
    for _ in range(WARMUP_AUTHS):
        _authenticate(bank, client)
    times = []
    for _ in range(reps):
        start = time.perf_counter()
        _authenticate(bank, client)
        times.append(time.perf_counter() - start)
    return statistics.median(times)


def security_bits(bits_p: int, bits_q: int | None = None) -> int | str:
    """Nivel de seguridad en bits (definición 10): 1024 → 80, 2048 → 112, 3072 → 128; menos → «<80». Cubre R7.

    Si se da bits_q, se limita además a ⌊bits_q / 2⌋, el costo √q de BSGS o Pollard rho en el
    subgrupo (q de 224 bits → 112, q de 256 bits → 128, como en los grupos de Schnorr).
    """
    levels = [level for size, level in NIST_SECURITY_BITS.items() if bits_p >= size]
    if not levels:
        return BELOW_MIN_SECURITY
    return min(max(levels), bits_q // 2) if bits_q is not None else max(levels)


def family_of(name: str) -> str:
    """Familia del grupo según su nombre: toy, safe, rfc o schnorr. Cubre R7."""
    return name.split("-")[0]


def series_of(name: str, gp: GroupParams) -> str:
    """Serie de la comparación: ffdhe (RFC 7919), primo seguro o schnorr. Cubre R7."""
    if family_of(name) == FFDHE_FAMILY:
        return FFDHE_SERIES
    return SAFE_SERIES if gp.is_safe_prime else SCHNORR_SERIES


def _security(name: str, gp: GroupParams) -> int | str:
    """El nivel que declara la fuente del grupo (RFC 7919) o, si no hay, el de la definición 10."""
    declared = declared_security_bits(name)
    return declared if declared is not None else security_bits(gp.bits, gp.q.bit_length())


def _relative_error(measured: float, predicted: float) -> float:
    return abs(measured - predicted) / predicted


def _comparison(row: dict, previous: dict | None) -> dict:
    """Razón con el tamaño anterior de la misma serie y backend, predicciones k³ y k^2.585 y errores."""
    if previous is None:
        return dict.fromkeys(("previous", "ratio", "pred_k3", "pred_karatsuba", "err_k3", "err_karatsuba"))
    k_ratio = row["bits_p"] / previous["bits_p"]
    ratio = row["median_s"] / previous["median_s"]
    pred_k3, pred_karatsuba = k_ratio**SCHOOLBOOK_EXPONENT, k_ratio**KARATSUBA_EXPONENT
    return {"previous": previous["name"], "ratio": ratio, "pred_k3": pred_k3, "pred_karatsuba": pred_karatsuba,
            "err_k3": _relative_error(ratio, pred_k3), "err_karatsuba": _relative_error(ratio, pred_karatsuba)}


def add_predictions(rows: list[dict]) -> list[dict]:
    """Ordena por serie y tamaño y agrega razón, predicciones y error relativo a cada fila. Cubre R7."""
    ordered = sorted(rows, key=lambda r: (SERIES_ORDER.index(r["series"]), r["bits_p"]))
    last_seen: dict[tuple[str, str], dict] = {}
    result = []
    for row in ordered:
        key = (row["series"], row["backend"])
        result.append({**row, **_comparison(row, last_seen.get(key))})
        last_seen[key] = row
    return result


def _usable_backends(backends: tuple[str, ...] | list[str]) -> list[str]:
    """Descarta, con un aviso, los backends que no se pueden usar (por ejemplo, gmpy2 sin instalar)."""
    usable = []
    for backend in backends:
        try:
            with use_backend(backend):
                usable.append(backend)
        except ValueError as error:
            warnings.warn(f"Se omite el backend «{backend}»: {error}", stacklevel=3)
    return usable


def _measure_group(name: str, backends: list[str], reps: int) -> list[dict]:
    gp = get_group(name)
    base = {"name": name, "family": family_of(name), "series": series_of(name, gp), "bits_p": gp.bits,
            "bits_q": gp.q.bit_length(), "security_bits": _security(name, gp)}
    rows = []
    for backend in backends:
        with use_backend(backend):
            rows.append({**base, "backend": backend, "reps": reps, "median_s": measure_auth(gp, reps)})
    return rows


def measure(groups: list[str] | None = None, reps: int = DEFAULT_REPS,
            backends: tuple[str, ...] | list[str] = DEFAULT_BACKENDS,
            results_dir: Path | None = RESULTS_DIR) -> list[dict]:
    """Una fila por (grupo, backend): name, family, bits_p, bits_q, security_bits, backend, mediana,
    razón con el tamaño anterior y predicciones k³ y k^2.585 con su error relativo. Cubre R7.

    Por defecto mide safe-256, safe-512, safe-1024, rfc-2048, rfc-3072, ffdhe-2048, ffdhe-3072,
    schnorr-2048 y schnorr-3072 con los tres backends. Guarda results/latency.csv y results/latency.json
    (con results_dir=None no guarda nada).
    """
    usable = _usable_backends(backends)
    measured = [row for name in (groups or GROUPS_TO_MEASURE) for row in _measure_group(name, usable, reps)]
    rows = add_predictions(measured)
    if results_dir is not None:
        save(rows, results_dir)
    return rows


def save(rows: list[dict], results_dir: Path) -> None:
    """Escribe latency.csv y latency.json (filas y metadatos de la medición). Cubre R7."""
    results_dir.mkdir(parents=True, exist_ok=True)
    with (results_dir / "latency.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    metadata = {"python": platform.python_version(), "platform": platform.platform(),
                "karatsuba_exponent": KARATSUBA_EXPONENT, "rows": rows}
    (results_dir / "latency.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
                                              encoding="utf-8")


def plot(rows: list[dict], results_dir: Path = RESULTS_DIR) -> None:
    """results/latency.png (tiempo frente a bits de p, log–log, una serie por estructura y backend)
    y results/backends.png (los tres backends por tamaño). Cubre R7.
    """
    from benchmark import plots  # importa matplotlib solo al graficar

    results_dir.mkdir(parents=True, exist_ok=True)
    plots.latency_figure(rows, results_dir / "latency.png")
    plots.backends_figure(rows, results_dir / "backends.png")


def _fmt(value: float | None, pattern: str) -> str:
    return "—" if value is None else format(value, pattern)


def format_table(rows: list[dict]) -> list[str]:
    """Tabla de texto con la mediana en ms, la razón medida y las predicciones k³ y k^2.585. Cubre R7."""
    header = (f"{'grupo':<13} {'p':>5} {'q':>5} {'seg.':>4} {'backend':<7} {'mediana ms':>11} "
              f"{'razón':>6} {'k³':>6} {'err':>5} {'k^2.585':>8} {'err':>5}")
    lines = [header, "-" * len(header)]
    for r in rows:
        lines.append(f"{r['name']:<13} {r['bits_p']:>5} {r['bits_q']:>5} {r['security_bits']!s:>4} "
                     f"{r['backend']:<7} {r['median_s'] * 1000:>11.3f} {_fmt(r['ratio'], '.2f'):>6} "
                     f"{_fmt(r['pred_k3'], '.2f'):>6} {_fmt(r['err_k3'], '.0%'):>5} "
                     f"{_fmt(r['pred_karatsuba'], '.2f'):>8} {_fmt(r['err_karatsuba'], '.0%'):>5}")
    return lines


def main(argv: list[str] | None = None) -> int:
    """CLI: mide, guarda results/latency.{csv,json,png} y backends.png e imprime la tabla. Cubre R7."""
    parser = argparse.ArgumentParser(description="Latencia de una autenticación según el tamaño de p (R7, P3).")
    parser.add_argument("--reps", type=int, default=DEFAULT_REPS, help="repeticiones por grupo y backend")
    parser.add_argument("--groups", nargs="+", choices=GROUPS_TO_MEASURE, help="grupos a medir")
    parser.add_argument("--backends", nargs="+", choices=ARITHMETIC_BACKENDS, default=list(DEFAULT_BACKENDS))
    args = parser.parse_args(argv)
    start = time.perf_counter()
    rows = measure(args.groups, args.reps, args.backends, results_dir=RESULTS_DIR)
    plot(rows, RESULTS_DIR)
    print("\n".join(format_table(rows)))
    print(f"\nTiempo total: {time.perf_counter() - start:.1f} s. Resultados en {RESULTS_DIR.name}/.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
