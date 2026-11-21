"""Configuración de pytest: imprime la tabla requerimiento → prueba → resultado.

Cada prueba lleva el marcador ``@pytest.mark.req("Rn")``. Al terminar la ejecución se
imprime la trazabilidad de la Tabla 7 del escrito: primero cada prueba y después un
resumen por requerimiento. Los identificadores Cn (C1–C5) son los de la comparación con
otros mecanismos de autenticación y se listan después de los Rn:
    C1  registro e inicio de sesión de contraseña, TOTP y SRP (credenciales correctas e incorrectas)
    C2  qué guarda el banco por usuario y qué viaja por la red
    C3  validación de entradas y bloqueo por intentos fallidos
    C4  repetición de mensajes capturados, reuso de códigos y verificación mutua
    C5  experimento de comparación (benchmark/compare.py) Las pruebas marcadas ``xfail`` corresponden a funcionalidades
que el escrito deja para el informe final (esqueletos).
"""

import re

import pytest

NO_REQ = "—"
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
