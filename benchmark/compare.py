"""Comparación del ZKP con otros mecanismos de autenticación en igualdad de condiciones (C5).

Mecanismos: contraseña con Argon2id, contraseña + TOTP, SRP-6a (2048 bits) y el ZKP de Schnorr
(interactivo con rfc-2048 y schnorr-2048, y Fiat-Shamir con schnorr-2048). Mismo proceso, misma
pila HTTP (banco real en memoria), mismo backend aritmético (mod_pow) y mismo nivel de seguridad
donde aplica: los tres de 2048 bits ofrecen unos 112 bits.

Qué se mide por escenario:
- latencia (mediana de reps repeticiones, time.perf_counter) de un registro y de un inicio de
  sesión completos, cliente + banco; también sin el paso de descargar y validar parámetros;
- idas y vueltas y bytes de los cuerpos JSON enviados y recibidos;
- qué guarda el banco por usuario y si algún secreto del celular aparece en la red;
- base robada (costo fuera de línea) y repetición de mensajes capturados (compare_attacks).

Uso: ``python -m benchmark.compare`` guarda results/comparacion.{json,csv} y tres gráficas
(comparacion_latencia.png, comparacion_red.png, comparacion_base_robada.png).
"""

import argparse
import csv
import json
import platform
import statistics
import time
from pathlib import Path
from typing import Any

from benchmark import compare_attacks
from benchmark.compare_harness import (
    SCENARIOS,
    SCENARIOS_BY_KEY,
    FlowRun,
    Lab,
    Scenario,
    create_lab,
    run_flow,
    secret_values,
)
from core.modular import ARITHMETIC_BACKENDS, DEFAULT_BACKEND, use_backend

DEFAULT_REPS = 31                     # igual que benchmark.latency
WARMUP_RUNS = 1
LOGIN_USER = "cliente01"
RESULTS_DIR = Path(__file__).resolve().parent.parent / "results"
CSV_FIELDS = ("key", "label", "mechanism", "group", "security_bits", "register_ms", "login_ms",
              "login_without_params_ms", "login_round_trips", "login_posts", "login_sent_bytes",
              "login_received_bytes", "register_round_trips", "register_sent_bytes", "register_received_bytes",
              "stored_fields", "stored_bytes", "secret_travels_login", "secret_travels_register",
              "replay_accepted", "offline_dictionary_log10_years", "offline_random8_log10_years")
NOTES = (
    "Latencia: cliente + banco en el mismo proceso, a través de la API real (FastAPI en memoria).",
    "login_without_params_ms excluye descargar y validar los parámetros públicos (cacheable).",
    "Los bytes recibidos del ZKP incluyen los valores intermedios que la interfaz muestra (details).",
    ("Base robada: un núcleo de este equipo; un atacante con GPU es mucho más rápido contra SRP que "
     "contra Argon2id (que es costoso en memoria a propósito)."),
    ("ZKP: BSGS es una cota del ataque genérico; con rfc-2048 el mejor ataque real es la criba del cuerpo "
     "de números (≈ 2^112 operaciones según NIST), no BSGS."),
)


def _median_ms(values: list[float]) -> float:
    return statistics.median(values) * 1000


def _network(run: FlowRun) -> dict[str, int]:
    records = run.records
    return {"round_trips": len(records), "posts": sum(r.method == "POST" for r in records),
            "sent_bytes": sum(r.sent_bytes for r in records),
            "received_bytes": sum(r.received_bytes for r in records),
            "paths": [f"{r.method} {r.path}" for r in records]}


def _secret_travels(run: FlowRun, secrets: dict[str, str]) -> dict[str, bool]:
    """Por secreto: ¿aparece en algún cuerpo enviado o recibido durante el flujo?"""
    wire = " ".join(json.dumps(body, ensure_ascii=False) for r in run.records
                    for body in (r.request_body, r.response_body))
    return {name: value in wire for name, value in secrets.items()}


def _measure_registration(lab: Lab, reps: int) -> tuple[float, FlowRun]:
    for index in range(WARMUP_RUNS):
        run_flow(lab, "register", f"calentamiento{index}")
    runs = [run_flow(lab, "register", f"r{index}") for index in range(reps)]
    return _median_ms([run.total_s for run in runs]), runs[-1]


def _measure_login(lab: Lab, reps: int) -> tuple[float, float, FlowRun, FlowRun]:
    register = run_flow(lab, "register", LOGIN_USER)
    for _ in range(WARMUP_RUNS):
        run_flow(lab, lab.scenario.login_flow, LOGIN_USER)
    runs = [run_flow(lab, lab.scenario.login_flow, LOGIN_USER) for _ in range(reps)]
    return (_median_ms([run.total_s for run in runs]), _median_ms([run.without_params_s for run in runs]),
            runs[-1], register)


def measure_scenario(scenario: Scenario, reps: int = DEFAULT_REPS) -> dict[str, Any]:
    """Latencia, red, lo que guarda el banco y si viaja algún secreto, para un escenario. Cubre C5."""
    if reps < 1:
        raise ValueError(f"reps debe ser al menos 1 (se recibió {reps}).")
    lab = create_lab(scenario)
    register_ms, _ = _measure_registration(lab, reps)
    login_ms, without_params_ms, login, register = _measure_login(lab, reps)
    secrets = secret_values(lab, LOGIN_USER)
    stored = lab.server.stored_credentials()[LOGIN_USER]
    return {"key": scenario.key, "label": scenario.label, "mechanism": scenario.mechanism,
            "group": scenario.group or "", "security_bits": scenario.security_bits, "reps": reps,
            "register_ms": register_ms, "login_ms": login_ms, "login_without_params_ms": without_params_ms,
            "login_network": _network(login), "register_network": _network(register),
            "stored": {"fields": sorted(stored), "bytes": len(json.dumps(stored))},
            "secrets_on_wire": {"login": _secret_travels(login, secrets),
                                "register": _secret_travels(register, secrets)}}


def _offline_cost(scenario: Scenario, stolen: dict[str, Any], backend: str) -> tuple[float | None, float | None]:
    """(log₁₀ años con el diccionario de 10^6, log₁₀ años con 8 caracteres al azar o BSGS en el ZKP)."""
    if scenario.mechanism == "zkp":
        return None, stolen["zkp"]["groups"][scenario.group]["bsgs_log10_years"]
    source = stolen["srp"][backend] if scenario.mechanism == "srp" else stolen[scenario.mechanism]
    return source["dictionary_log10_years"], source["random8_log10_years"]


def csv_row(row: dict[str, Any]) -> dict[str, Any]:
    """Una fila plana para results/comparacion.csv. Cubre C5."""
    login, register = row["login_network"], row["register_network"]
    return {**{key: row[key] for key in ("key", "label", "mechanism", "group", "security_bits", "register_ms",
                                         "login_ms", "login_without_params_ms")},
            "login_round_trips": login["round_trips"], "login_posts": login["posts"],
            "login_sent_bytes": login["sent_bytes"], "login_received_bytes": login["received_bytes"],
            "register_round_trips": register["round_trips"], "register_sent_bytes": register["sent_bytes"],
            "register_received_bytes": register["received_bytes"],
            "stored_fields": " ".join(row["stored"]["fields"]), "stored_bytes": row["stored"]["bytes"],
            "secret_travels_login": any(row["secrets_on_wire"]["login"].values()),
            "secret_travels_register": any(row["secrets_on_wire"]["register"].values()),
            "replay_accepted": row["replay"]["accepted"],
            "offline_dictionary_log10_years": row["offline_dictionary_log10_years"],
            "offline_random8_log10_years": row["offline_random8_log10_years"]}


def run(scenarios: list[str] | None = None, reps: int = DEFAULT_REPS, guesses: int = compare_attacks.DEFAULT_GUESSES,
        backend: str = DEFAULT_BACKEND, results_dir: Path | None = RESULTS_DIR) -> dict[str, Any]:
    """Mide cada escenario, la base robada y la repetición; guarda JSON y CSV si hay results_dir. Cubre C5."""
    chosen = [SCENARIOS_BY_KEY[key] for key in scenarios] if scenarios else list(SCENARIOS)
    with use_backend(backend):
        stolen = compare_attacks.stolen_database(guesses)
        rows = []
        for scenario in chosen:
            dictionary, random8 = _offline_cost(scenario, stolen, backend)
            rows.append({**measure_scenario(scenario, reps), "replay": compare_attacks.replay_experiment(scenario),
                         "offline_dictionary_log10_years": dictionary, "offline_random8_log10_years": random8})
    result = {"python": platform.python_version(), "platform": platform.platform(), "backend": backend,
              "reps": reps, "notes": list(NOTES), "rows": rows, "stolen_database": stolen,
              "qualitative": compare_attacks.QUALITATIVE}
    if results_dir is not None:
        save(result, results_dir)
    return result


def save(result: dict[str, Any], results_dir: Path) -> None:
    """Escribe comparacion.json (todo) y comparacion.csv (una fila por escenario). Cubre C5."""
    results_dir.mkdir(parents=True, exist_ok=True)
    (results_dir / "comparacion.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n",
                                                  encoding="utf-8")
    with (results_dir / "comparacion.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(csv_row(row) for row in result["rows"])


def plot(result: dict[str, Any], results_dir: Path = RESULTS_DIR) -> list[Path]:
    """Las tres gráficas de la comparación en results/. Cubre C5."""
    from benchmark import compare_plots  # importa matplotlib solo al graficar

    return compare_plots.all_figures(result, results_dir)


def _yes(value: bool) -> str:
    return "sí" if value else "no"


def _years(log10_years: float | None) -> str:
    return "—" if log10_years is None else f"10^{log10_years:.1f}"


def format_table(result: dict[str, Any]) -> list[str]:
    """Tabla de texto: latencia, red, secreto en la red, repetición y base robada. Cubre C5."""
    header = (f"{'escenario':<31} {'registro':>9} {'sesión':>8} {'s/params':>8} {'viajes':>6} "
              f"{'bytes ↑/↓':>11} {'¿secreto?':>9} {'¿replay?':>8} {'dicc. 10^6':>10} {'8 car./BSGS':>11}")
    lines = [header, "-" * len(header)]
    for row in result["rows"]:
        net = row["login_network"]
        lines.append(
            f"{row['label']:<31} {row['register_ms']:>7.1f}ms {row['login_ms']:>6.1f}ms "
            f"{row['login_without_params_ms']:>6.1f}ms {net['round_trips']:>6} "
            f"{net['sent_bytes']:>5}/{net['received_bytes']:<5} "
            f"{_yes(any(row['secrets_on_wire']['login'].values())):>9} {_yes(row['replay']['accepted']):>8} "
            f"{_years(row['offline_dictionary_log10_years']):>10} {_years(row['offline_random8_log10_years']):>11}")
    lines.append("Años de la base robada en un núcleo de este equipo; ver results/comparacion.json.")
    return lines


def main(argv: list[str] | None = None) -> int:
    """CLI: mide, guarda results/comparacion.{json,csv} y las gráficas e imprime la tabla. Cubre C5."""
    parser = argparse.ArgumentParser(description="Comparación del ZKP con contraseña, TOTP y SRP (C5).")
    parser.add_argument("--reps", type=int, default=DEFAULT_REPS, help="repeticiones por escenario")
    parser.add_argument("--guesses", type=int, default=compare_attacks.DEFAULT_GUESSES,
                        help="candidatas medidas en el ataque fuera de línea")
    parser.add_argument("--scenarios", nargs="+", choices=list(SCENARIOS_BY_KEY), help="escenarios a medir")
    parser.add_argument("--backend", choices=ARITHMETIC_BACKENDS, default=DEFAULT_BACKEND,
                        help="backend de mod_pow para todos los mecanismos")
    args = parser.parse_args(argv)
    start = time.perf_counter()
    result = run(args.scenarios, args.reps, args.guesses, args.backend, RESULTS_DIR)
    plot(result, RESULTS_DIR)
    print("\n".join(format_table(result)))
    print(f"\nTiempo total: {time.perf_counter() - start:.1f} s. Resultados en {RESULTS_DIR.name}/.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
