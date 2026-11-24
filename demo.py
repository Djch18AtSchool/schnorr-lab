"""Schnorr Lab: menú de consola para revisar el modelo paso a paso (R11).

Uso:
    python demo.py                       abre el menú
    python demo.py --option N            ejecuta una opción y sale
    python demo.py --verbose --option 1  imprime cada paso (incluye mod_pow y Euclides extendido)
    python demo.py --option 2 --group safe-512
"""

import argparse
import json
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

from attacks import bsgs, impostor, nonce_reuse, replay, simulator
from benchmark.latency import format_table
from protocol import TOY_GROUP, GroupParams, get_group, validate_params
from protocol.bank import Bank
from protocol.client import Client
from protocol.fiat_shamir import (
    DEFAULT_WINDOW_SECONDS,
    current_timestamp,
    hash_challenge,
    prove,
    verify_nizk,
)
from protocol.transcript import VerifyResult

ROOT = Path(__file__).resolve().parent
LABEL_WIDTH = 16
INDENT = " " * LABEL_WIDTH
CHECK, CROSS = "✔", "✘"
USER_ID = "cliente01"
EXAMPLE_X, EXAMPLE_R, EXAMPLE_C = 7, 5, 3      # transcripción del escrito
MAX_TRACE_BITS = 64                            # con p más grande la traza bit a bit es ilegible
MAX_PLAIN_DIGITS = 20
AVAILABLE_GROUPS = ("toy", "safe-256", "safe-512", "safe-1024")
LATENCY_RESULTS = ROOT / "results" / "latency.json"
COMPARISON_RESULTS = ROOT / "results" / "comparacion.json"
MENU = (
    ("1", "Ejemplo paso a paso con p = 23 (transcripción del escrito)"),
    ("2", "Autenticación interactiva (elegir grupo) y bloqueo por intentos"),
    ("3", "Variante no interactiva (Fiat-Shamir)"),
    ("4", "Laboratorio de ataques"),
    ("5", "Latencia según el tamaño de p"),
    ("6", "Logaritmo discreto con paso de bebé, paso de gigante (BSGS)"),
    ("7", "Ejecutar las pruebas"),
    ("8", "Comparación con contraseña, TOTP y SRP"),
    ("0", "Salir"),
)


# ------------------------------------------------------------------ utilidades de salida

def _say(label: str, text: str) -> None:
    print(f"{label:<{LABEL_WIDTH}}{text}")


def _show_trace(lines: list[str] | None) -> None:
    for line in lines or []:
        print(f"{INDENT}  · {line}")


def _new_trace(enabled: bool) -> list[str] | None:
    return [] if enabled else None


def _fmt(n: int, full: bool = False) -> str:
    """Muestra enteros grandes abreviados: primeros y últimos dígitos y su tamaño en bits."""
    text = str(n)
    if full or len(text) <= MAX_PLAIN_DIGITS:
        return text
    return f"{text[:8]}…{text[-6:]} ({n.bit_length()} bits)"


def _print_outcome(result: VerifyResult) -> None:
    print(">>> ACCESO CONCEDIDO" if result.accepted else f">>> ACCESO RECHAZADO: {result.reason}")


# ------------------------------------------------------------- opción 1: ejemplo p = 23

def _print_example_verification(gp: GroupParams, y: int, result: VerifyResult) -> None:
    tr, d = result.transcript, result.details
    if tr is None or not d:
        return
    _say("[Verificación]", f"g^s = {gp.g}^{tr.s} mod {gp.p} = {d['gs']}   |   "
                           f"t·y^c = {tr.t}·{y}^{tr.c} mod {gp.p} = {d['tyc']}")
    matches = d["t_rec"] == tr.t
    print(f"{INDENT}(y^c)^-1 = {d['yc']}^-1 = {d['yc_inv']} (Euclides extendido) → "
          f"g^s·(y^c)^-1 = {d['t_rec']} {'=' if matches else '≠'} t {CHECK if matches else CROSS}")


def option_example(verbose: bool) -> None:
    """Opción 1: reproduce la transcripción del escrito con p = 23, x = 7, r = 5 y c = 3. Cubre R11."""
    gp = TOY_GROUP
    y_steps, t_steps, verify_steps = (_new_trace(verbose) for _ in range(3))
    valid = CHECK if not validate_params(gp) else CROSS
    _say("[Parámetros]", f"p = {gp.p}   q = {gp.q}   g = {gp.g}        (g^q ≡ 1 mod p {valid})")

    bank = Bank(gp)
    client = Client(USER_ID, gp, x=EXAMPLE_X, trace=y_steps)
    bank.register(*client.register_payload())
    _say("[Registro]", f"x = {EXAMPLE_X} (secreta)  →  y = {gp.g}^{EXAMPLE_X} mod {gp.p} = {client.y}"
                       "   (el banco guarda solo y)")
    _show_trace(y_steps)

    t = client.commit(r=EXAMPLE_R, trace=t_steps)
    _say("[Compromiso]", f"r = {EXAMPLE_R}  →  t = {gp.g}^{EXAMPLE_R} mod {gp.p} = {t}")
    _show_trace(t_steps)

    challenge = bank.challenge(USER_ID, t, c=EXAMPLE_C)
    if isinstance(challenge, VerifyResult):
        _print_outcome(challenge)
        return
    session_id, c = challenge
    _say("[Reto]", f"c = {c}")
    s = client.respond(c)
    _say("[Respuesta]", f"s = {EXAMPLE_R} + {c}·{EXAMPLE_X} mod {gp.q} = {s}")
    if verbose:
        _show_trace([f"{EXAMPLE_R} + {c * EXAMPLE_X} = {EXAMPLE_R + c * EXAMPLE_X} ≡ {s} (mod {gp.q})"])

    result = bank.verify(session_id, s, verify_steps)
    _print_example_verification(gp, client.y, result)
    _show_trace(verify_steps)
    _print_outcome(result)


# ------------------------------------------------- opción 2: autenticación interactiva

def _ask_group() -> str:
    if not sys.stdin.isatty():
        return "toy"
    answer = input(f"Grupo ({', '.join(AVAILABLE_GROUPS)}) [toy]: ").strip()
    return answer or "toy"


def _load_group(name: str) -> GroupParams | None:
    try:
        return get_group(name)
    except NotImplementedError as error:
        print(error)
    except ValueError as error:
        print(f"Error: {error}")
    return None


def _show_lockout(bank: Bank, client: Client) -> None:
    """Envía max_attempts respuestas alteradas y luego intenta entrar con la clave correcta. Cubre R9."""
    print()
    _say("[Bloqueo]", f"Se envían {bank.max_attempts} respuestas falsas y después se intenta con la clave correcta:")
    for attempt in range(1, bank.max_attempts + 1):
        session_id, c = bank.challenge(USER_ID, client.commit())
        forged_s = (client.respond(c) + 1) % bank.gp.q
        result = bank.verify(session_id, forged_s)
        print(f"{INDENT}Intento {attempt}: s alterado → {result.reason} (quedan {result.attempts_left})")
    final = bank.challenge(USER_ID, client.commit())
    reason = final.reason if isinstance(final, VerifyResult) else "reto entregado (no debería ocurrir)"
    print(f"{INDENT}Intento {bank.max_attempts + 1} (con la clave correcta): el banco ni siquiera "
          f"entrega un reto → {reason}")


def option_interactive(verbose: bool, group_name: str | None = None) -> None:
    """Opción 2: autenticación con x, r y c aleatorios en el grupo elegido. Cubre R3, R7, R9 y R11."""
    gp = _load_group(group_name or _ask_group())
    if gp is None:
        return
    full = verbose
    trace_enabled = verbose and gp.bits <= MAX_TRACE_BITS
    commit_steps, verify_steps = _new_trace(trace_enabled), _new_trace(trace_enabled)
    _say("[Parámetros]", f"{gp.name}: p de {gp.bits} bits, q de {gp.q.bit_length()} bits, "
                         f"g = {gp.g}   (válido {CHECK})")
    if verbose:
        _show_trace([f"p = {gp.p}", f"q = {gp.q}"])

    bank, client = Bank(gp), Client(USER_ID, gp)
    bank.register(*client.register_payload())
    _say("[Registro]", f"x = {_fmt(client.x, full)} (secreta, no sale del cliente)  →  "
                       f"y = {_fmt(client.y, full)}")
    t = client.commit(trace=commit_steps)
    _say("[Compromiso]", f"r al azar con secrets  →  t = g^r mod p = {_fmt(t, full)}")
    _show_trace(commit_steps)
    session_id, c = bank.challenge(USER_ID, t)
    _say("[Reto]", f"c = {_fmt(c, full)} (elegido por el banco con secrets)")
    s = client.respond(c)
    _say("[Respuesta]", f"s = r + c·x mod q = {_fmt(s, full)}")

    result = bank.verify(session_id, s, verify_steps)
    d = result.details
    _say("[Verificación]", f"g^s = {_fmt(d['gs'], full)}   |   t·y^c = {_fmt(d['tyc'], full)}   "
                           f"{CHECK if result.accepted else CROSS}")
    _show_trace(verify_steps)
    _print_outcome(result)
    _show_lockout(bank, client)


# ---------------------------------------------------------------- resto de opciones

def option_latency(_verbose: bool) -> None:
    """Opción 5: latencia medida según los bits de p y su comparación con k³ y k^2.585. Cubre R7.

    Muestra los resultados ya generados (results/latency.json); para volver a medir se ejecuta
    python -m benchmark.latency (tarda menos de un minuto).
    """
    if not LATENCY_RESULTS.is_file():
        print(f"Todavía no hay mediciones: ejecute «python -m benchmark.latency» ({LATENCY_RESULTS.name}).")
        return
    data = json.loads(LATENCY_RESULTS.read_text(encoding="utf-8"))
    print(f"Latencia de una autenticación completa (mediana de {data['rows'][0]['reps']} repeticiones, "
          f"Python {data['python']}). Razón = tiempo / tiempo del tamaño anterior.")
    for line in format_table(data["rows"]):
        print(line)
    print("Predicción del escrito al duplicar k: k³ → 8; Karatsuba (k^2.585) daría ≈ 6, pero CPython "
          "multiplica con el método escolar hasta unos 2100 bits (4200 en los cuadrados): la razón queda "
          "bajo 8 por costos que crecen más despacio que k³. "
          "Gráficas en results/latency.png y results/backends.png.")


def option_bsgs(verbose: bool, group_name: str | None = None) -> None:
    """Opción 6: el atacante roba y y recupera x con paso de bebé, paso de gigante. Cubre R10."""
    gp = TOY_GROUP if group_name is None else _load_group(group_name)
    if gp is None:
        return
    try:
        bsgs.run(gp, verbose=True)
    except ValueError as error:
        print(error)


def option_fiat_shamir(verbose: bool, group_name: str | None = None) -> None:
    """Opción 3: inicio de sesión no interactivo (Fiat-Shamir) y qué pasa al repetir la prueba. Cubre R8 y R11."""
    gp = TOY_GROUP if group_name is None else _load_group(group_name)
    if gp is None:
        return
    bank, client = Bank(gp), Client(USER_ID, gp, x=EXAMPLE_X if gp == TOY_GROUP else None)
    bank.register(*client.register_payload())
    now = current_timestamp()
    proof = prove(client, m=now)
    c = hash_challenge(gp, client.y, proof.t, USER_ID, now)
    _say("[Parámetros]", f"{gp.name}: p de {gp.bits} bits   y = {_fmt(client.y, verbose)}")
    _say("[Compromiso]", f"t = g^r mod p = {_fmt(proof.t, verbose)}   m = {now} (hora del intento)")
    _say("[Reto local]", f"c = H(p ‖ g ‖ y ‖ t ‖ id ‖ m) mod q = {_fmt(c, verbose)}   (sin esperar al banco)")
    _say("[Respuesta]", f"s = (r + c·x) mod q = {_fmt(proof.s, verbose)}   → se envía (id, t, s, m)")
    result = verify_nizk(bank, proof, now=now)
    _say("[Verificación]", f"el banco recalcula c y comprueba g^s ≡ t·y^c (mod p) → {result.reason}")
    _say("[Repetición]", f"la misma prueba otra vez → {verify_nizk(bank, proof, now=now + 1).reason}")
    age = DEFAULT_WINDOW_SECONDS + 1
    stale = verify_nizk(bank, prove(client, m=now - age), now=now)
    _say("[m vieja]", f"prueba con m de hace {age} s → {stale.reason}")
    _print_outcome(result)


def option_attacks(_verbose: bool) -> None:
    """Opción 4: ejecuta los ataques funcionales con p = 23 e informa los pendientes. Cubre R10 y R11."""
    for attack in (nonce_reuse, simulator, impostor, replay, bsgs):
        attack.run(verbose=True)
        print()


def option_tests(_verbose: bool) -> None:
    """Opción 7: ejecuta pytest (sin las pruebas lentas) e imprime la trazabilidad. Cubre R11."""
    completed = subprocess.run([sys.executable, "-m", "pytest", "-m", "not slow"], cwd=ROOT, check=False)
    print(f"pytest terminó con código {completed.returncode}.")


def option_comparison(_verbose: bool) -> None:
    """Opción 8: resultados de la comparación con contraseña, TOTP y SRP. Cubre C5.

    Muestra results/comparacion.json; para volver a medir se ejecuta python -m benchmark.compare.
    """
    if not COMPARISON_RESULTS.is_file():
        print(f"Todavía no hay mediciones: ejecute «python -m benchmark.compare» ({COMPARISON_RESULTS.name}).")
        return
    from benchmark.compare import (
        format_table as comparison_table,  # importa el banco solo si se pide
    )

    data = json.loads(COMPARISON_RESULTS.read_text(encoding="utf-8"))
    print(f"Comparación en igualdad de condiciones (mediana de {data['reps']} repeticiones, "
          f"backend «{data['backend']}», Python {data['python']}).")
    for line in comparison_table(data):
        print(line)
    print("Gráficas en results/comparacion_latencia.png, comparacion_red.png y comparacion_base_robada.png.")


OPTIONS: dict[str, Callable[[bool], None]] = {
    "1": option_example,
    "4": option_attacks,
    "5": option_latency,
    "7": option_tests,
    "8": option_comparison,
}


def run_option(option: str, verbose: bool, group: str | None) -> bool:
    """Ejecuta una opción; devuelve False si la opción no existe. Cubre R11."""
    if option == "2":
        option_interactive(verbose, group)
        return True
    if option == "3":
        option_fiat_shamir(verbose, group)
        return True
    if option == "6":
        option_bsgs(verbose, group)
        return True
    handler = OPTIONS.get(option)
    if handler is None:
        return False
    handler(verbose)
    return True


def _menu_loop(verbose: bool, group: str | None) -> None:
    while True:
        print("\n=== Schnorr Lab ===")
        for key, label in MENU:
            print(f"  {key}. {label}")
        try:
            choice = input("Opción: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if choice == "0":
            return
        if not run_option(choice, verbose, group):
            print("Opción no válida.")


def main(argv: list[str] | None = None) -> int:
    """Punto de entrada: menú interactivo o una sola opción con --option. Cubre R11."""
    parser = argparse.ArgumentParser(description="Schnorr Lab: autenticación sin contraseñas con Schnorr.")
    parser.add_argument("--option", choices=[key for key, _ in MENU], help="ejecuta una opción y sale")
    parser.add_argument("--verbose", action="store_true", help="imprime cada paso con sus números")
    parser.add_argument("--group", help=f"grupo para la opción 2: {', '.join(AVAILABLE_GROUPS)}")
    args = parser.parse_args(argv)
    if args.option is None:
        _menu_loop(args.verbose, args.group)
    elif args.option != "0":
        run_option(args.option, args.verbose, args.group)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
