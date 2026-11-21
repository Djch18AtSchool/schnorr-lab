"""Configuración de pytest: imprime la tabla requerimiento → prueba → resultado.

Cada prueba lleva el marcador ``@pytest.mark.req("Rn")``. Al terminar la ejecución se
imprime la trazabilidad de la Tabla 7 del escrito: primero cada prueba y después un
resumen por requerimiento. Los identificadores Cn (C1–C5) son los de la comparación con
otros mecanismos de autenticación y se listan después de los Rn:
    C1  registro e inicio de sesión de contraseña, TOTP y SRP (credenciales correctas e incorrectas)
    C2  qué guarda el banco por usuario y qué viaja por la red
    C3  validación de entradas y bloqueo por intentos fallidos
    C4  repetición de mensajes capturados, reuso de códigos y verificación mutua
    C5  experimento de comparación (benchmark/compare.py)
Al terminar una ejecución completa se guarda results/tests.json, que muestra la Consola del banco.
"""

import json
import re
import time
from pathlib import Path

import pytest

NO_REQ = "—"
REPORT_PATH = Path(__file__).resolve().parent.parent / "results" / "tests.json"
MIN_FULL_RUN = 250              # solo una ejecución completa reemplaza el reporte de la Consola
REQUIREMENTS = {
    "R1": "Generar y validar los parámetros públicos (p, q, g)",
    "R2": "Registrar al cliente guardando solo su clave pública y",
    "R3": "Generar r y c nuevos en cada inicio de sesión",
    "R4": "Potencia modular rápida",
    "R5": "Inverso modular con el algoritmo extendido de Euclides",
    "R6": "Verificar la congruencia g^s ≡ t·y^c (mod p)",
    "R7": "Cambiar el tamaño en bits de p y comparar la velocidad",
    "R8": "Variante no interactiva (Fiat-Shamir) con marca de tiempo",
    "R9": "Validar entradas y bloquear tras tres intentos fallidos",
    "R10": "Laboratorio de ataques controlados",
    "R11": "Interfaz de revisión: paso a paso, API y laboratorio en vivo",
    "C1": "Comparación: registro e inicio de sesión de contraseña, TOTP y SRP",
    "C2": "Comparación: qué guarda el banco y qué viaja por la red",
    "C3": "Comparación: validación de entradas y bloqueo por intentos",
    "C4": "Comparación: repetición, reuso de códigos y verificación mutua",
    "C5": "Comparación: experimento de medición",
}
_files: dict[str, str] = {}
_started = time.time()
_REQ_PATTERN = re.compile(r"^([RC])(\d+)$")
_PREFIX_ORDER = {"R": 0, "C": 1}           # primero los del escrito, luego los de la comparación
_rows: list[tuple[str, str, str]] = []


def _outcome_label(report: pytest.TestReport) -> str:
    """Traduce el resultado de pytest, distinguiendo los esqueletos (xfail)."""
    if hasattr(report, "wasxfail"):
        return "xpassed" if report.passed else "xfailed"
    if report.when == "setup" and report.failed:
        return "error"
    return report.outcome


def _sort_key(row: tuple[str, str, str]) -> tuple[int, int, str]:
    """Ordena R1, ..., R11 y después C1, ..., C5, numéricamente (no alfabéticamente)."""
    match = _REQ_PATTERN.match(row[0])
    if not match:
        return (len(_PREFIX_ORDER), 0, row[1])
    return (_PREFIX_ORDER[match.group(1)], int(match.group(2)), row[1])


@pytest.hookimpl(wrapper=True)
def pytest_runtest_makereport(item: pytest.Item, call: pytest.CallInfo):
    report = yield
    report.req_ids = tuple(arg for marker in item.iter_markers(name="req") for arg in marker.args)
    return report


def pytest_runtest_logreport(report: pytest.TestReport) -> None:
    is_call = report.when == "call"
    is_setup_problem = report.when == "setup" and not report.passed
    if not (is_call or is_setup_problem):
        return
    test_name = report.nodeid.split("::")[-1]
    _files[test_name] = report.nodeid.split("::")[0]
    for req in getattr(report, "req_ids", ()) or (NO_REQ,):
        _rows.append((req, test_name, _outcome_label(report)))


def _summary_line(req: str, results: list[str]) -> str:
    passed = results.count("passed")
    pending = results.count("xfailed")
    others = len(results) - passed - pending
    if passed == others == 0:
        return f"{req:<4} {pending} pendiente(s) para el informe final"
    text = f"{req:<4} {passed}/{len(results) - pending} aprobadas"
    if pending:
        text += f", {pending} pendiente(s) para el informe final"
    if others:
        text += f", {others} con problemas"
    return text


def pytest_terminal_summary(terminalreporter) -> None:
    if not _rows:
        return
    ordered = sorted(_rows, key=_sort_key)
    terminalreporter.section("Trazabilidad: requerimiento → prueba → resultado")
    for req, name, result in ordered:
        terminalreporter.write_line(f"{req:<4} {name:<62} {result}")

    terminalreporter.section("Resumen por requerimiento (Tabla 7 del escrito)")
    by_req: dict[str, list[str]] = {}
    for req, _, result in ordered:
        by_req.setdefault(req, []).append(result)
    for req, results in by_req.items():
        terminalreporter.write_line(_summary_line(req, results))


def _report_outcome(result: str) -> str:
    return result if result in ("passed", "failed", "skipped") else "failed"


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    """Guarda results/tests.json (lo muestra la Consola del banco) tras una ejecución completa."""
    if session.testscollected < MIN_FULL_RUN or not _rows:
        return
    by_req: dict[str, list[dict[str, str]]] = {}
    for req, name, result in sorted(_rows, key=_sort_key):
        by_req.setdefault(req, []).append({"name": name, "file": _files.get(name, ""),
                                           "outcome": _report_outcome(result)})
    unique = {(name, result) for _, name, result in _rows}
    outcomes = [_report_outcome(result) for _, result in unique]
    report = {"generated_at": time.time(), "duration_s": round(time.time() - _started, 2),
              "total": len(unique), "passed": outcomes.count("passed"), "failed": outcomes.count("failed"),
              "skipped": outcomes.count("skipped"),
              "requirements": [{"id": req, "title": REQUIREMENTS.get(req, "Sin requerimiento"), "tests": tests}
                               for req, tests in by_req.items()]}
    REPORT_PATH.parent.mkdir(exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
