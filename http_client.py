"""Cliente HTTP: inicia sesión contra la API y comprueba que x nunca viaja (R11).

Uso (con la API corriendo):  python http_client.py [--base http://127.0.0.1:8000] [--user cliente01]

Crea un Client local (x se genera y se queda en este proceso), se registra e inicia sesión.
Imprime cada petición y respuesta en JSON y al final comprueba, en lo enviado y en /audit/log:
1) que solo viajaron los campos públicos user_id, y, t, session_id y s;
2) que el valor de x no aparece en ningún cuerpo. Con q pequeño (p = 23) un número puede
   coincidir con x por azar (probabilidad ≈ 1/q): eso se informa como nota, no como fuga.
Si encuentra una fuga o el banco rechaza la prueba, termina con código 1.
"""

import argparse
import json
import secrets
from dataclasses import dataclass
from typing import Any

import httpx

from protocol import GroupParams, validate_params
from protocol.client import Client
from protocol.transcript import Reason

DEFAULT_BASE = "http://127.0.0.1:8000"
DEFAULT_USER = "cliente01"
PUBLIC_FIELD_ORDER = ("user_id", "y", "t", "session_id", "s")   # en el orden en que viajan
PUBLIC_FIELDS = frozenset(PUBLIC_FIELD_ORDER)
MIN_Q_BITS_FOR_VALUE_CHECK = 32      # con q ≥ 2^32 una coincidencia casual es despreciable
TIMEOUT_SECONDS = 30
EXIT_OK, EXIT_FAILURE, EXIT_CONNECTION = 0, 1, 2


class ApiError(Exception):
    """La API respondió algo inesperado (código, cuerpo o parámetros inválidos)."""


@dataclass(frozen=True)
class LoginReport:
    user_id: str
    x: int
    accepted: bool
    reason: str
    sent: tuple[dict[str, str], ...]
    audit_entries: int
    leaks: tuple[str, ...]
    notes: tuple[str, ...]


def _body_of(response: httpx.Response) -> object:
    try:
        return response.json()
    except ValueError:
        return response.text


def _show(title: str, payload: object, show: bool) -> None:
    if show:
        print(title)
        print(json.dumps(payload, ensure_ascii=False, indent=2))


def _post(http: httpx.Client, path: str, body: dict[str, str], show: bool) -> httpx.Response:
    _show(f"→ POST {path}", body, show)
    response = http.post(path, json=body)
    _show(f"← {response.status_code}", _body_of(response), show)
    return response


def _expect(response: httpx.Response, code: int, kind: type = dict) -> Any:
    """Cuerpo de la respuesta si el código y el tipo son los esperados; si no, ApiError."""
    body = _body_of(response)
    if response.status_code != code or not isinstance(body, kind):
        raise ApiError(f"respuesta inesperada {response.status_code} en {response.request.url.path}: {body}")
    return body


def fetch_group(http: httpx.Client, show: bool = True) -> GroupParams:
    """Lee /params y valida (p, q, g) antes de usarlos: no se confía en datos externos. Cubre R1 y R11."""
    response = http.get("/params")
    _show("← GET /params", _body_of(response), show)
    data = _expect(response, 200)
    try:
        gp = GroupParams(p=int(data["p"]), q=int(data["q"]), g=int(data["g"]), name=str(data["name"]))
    except (KeyError, TypeError, ValueError) as error:
        raise ApiError(f"/params devolvió datos mal formados: {data}") from error
    failures = validate_params(gp, require_safe_prime=not gp.name.startswith("schnorr"))
    if failures:
        raise ApiError(f"el servidor publicó parámetros inválidos: {'; '.join(failures)}")
    return gp


def _register_body(client: Client) -> dict[str, str]:
    user_id, y = client.register_payload()
    return {"user_id": user_id, "y": str(y)}


def _register(http: httpx.Client, gp: GroupParams, user_id: str, show: bool) -> tuple[Client, list[dict]]:
    """Registra al cliente; si el id ya existe en el servidor, usa uno con sufijo aleatorio."""
    client = Client(user_id, gp)
    body = _register_body(client)
    response = _post(http, "/register", body, show)
    sent = [body]
    if response.status_code == 400 and _body_of(response) == {"reason": Reason.USER_EXISTS}:
        client = Client(f"{user_id}-{secrets.token_hex(2)}", gp)
        if show:
            print(f"(«{user_id}» ya estaba registrado; se usa «{client.user_id}»)")
        body = _register_body(client)
        response = _post(http, "/register", body, show)
        sent.append(body)
    _expect(response, 201)
    return client, sent


def find_secret_leaks(x: int, gp: GroupParams, bodies: list[dict]) -> tuple[list[str], list[str]]:
    """Devuelve (fugas, notas): campos no públicos o el valor de x dentro de algún cuerpo. Cubre R11."""
    secret = str(x)
    conclusive = gp.q.bit_length() >= MIN_Q_BITS_FOR_VALUE_CHECK
    leaks: list[str] = []
    notes: list[str] = []
    for body in bodies:
        for key, value in body.items():
            if key not in PUBLIC_FIELDS:
                leaks.append(f"campo no público «{key}» en {body}")
            elif str(value) == secret and conclusive:
                leaks.append(f"el valor de x aparece en el campo «{key}»")
            elif str(value) == secret:
                notes.append(f"«{key}» = {value} coincide numéricamente con x; con q = {gp.q} ocurre "
                             f"con probabilidad ≈ 1/q y es el valor público {key}, no x")
    return leaks, notes


def _login(http: httpx.Client, client: Client, show: bool) -> tuple[list[dict], dict]:
    """Compromiso, reto y respuesta. Devuelve los cuerpos enviados y la decisión del banco."""
    commit_body = {"user_id": client.user_id, "t": str(client.commit())}
    commit = _expect(_post(http, "/login/commit", commit_body, show), 200)
    try:
        respond_body = {"session_id": str(commit["session_id"]), "s": str(client.respond(int(commit["c"])))}
    except (KeyError, TypeError, ValueError) as error:
        raise ApiError(f"el banco envió un reto inválido: {commit}") from error
    verdict = _expect(_post(http, "/login/respond", respond_body, show), 200)
    return [commit_body, respond_body], verdict


def _own_audit_bodies(http: httpx.Client, sent: list[dict]) -> list[dict]:
    """Entradas de /audit/log de este cliente (mismos user_id o session_id que lo enviado)."""
    entries = _expect(http.get("/audit/log"), 200, list)
    ids = {(key, body[key]) for body in sent for key in ("user_id", "session_id") if key in body}
    bodies = [entry.get("body") for entry in entries if isinstance(entry, dict)]
    return [body for body in bodies
            if isinstance(body, dict) and any(body.get(key) == value for key, value in ids)]


def login_over_http(http: httpx.Client, user_id: str = DEFAULT_USER, show: bool = True) -> LoginReport:
    """Registro e inicio de sesión completos por HTTP, y comprobación de que x no viajó. Cubre R11."""
    gp = fetch_group(http, show)
    client, register_bodies = _register(http, gp, user_id, show)
    login_bodies, verdict = _login(http, client, show)
    sent = [*register_bodies, *login_bodies]

    audit = _own_audit_bodies(http, sent)
    unseen = [body for body in audit if body not in sent]   # lo enviado ya se revisa una vez
    leaks, notes = find_secret_leaks(client.x, gp, [*sent, *unseen])
    if any(body not in audit for body in sent):
        leaks.append("/audit/log no contiene todos los cuerpos enviados: la auditoría no es confiable")
    return LoginReport(client.user_id, client.x, verdict.get("accepted") is True, str(verdict.get("reason")),
                       tuple(sent), len(audit), tuple(leaks), tuple(notes))


def print_verdict(report: LoginReport) -> None:
    """Resumen final: fugas encontradas (si las hay), notas y decisión del banco. Cubre R11."""
    print("\n=== Comprobación: ¿viajó x? ===")
    print(f"x local (solo existe en este proceso): {report.x}")
    print(f"Cuerpos enviados: {len(report.sent)}; entradas propias en /audit/log: {report.audit_entries}")
    for leak in report.leaks:
        print(f"✘ FUGA: {leak}")
    if not report.leaks:
        print(f"✔ Solo viajaron campos públicos: {', '.join(PUBLIC_FIELD_ORDER)}")
    if not report.leaks and not report.notes:
        print("✔ El valor de x no aparece en ningún cuerpo enviado ni en /audit/log")
    elif not report.leaks:
        print("✔ Ningún campo transporta x; las coincidencias numéricas de abajo son valores públicos")
    for note in report.notes:
        print(f"  Nota: {note}")
    print(">>> ACCESO CONCEDIDO" if report.accepted else f">>> ACCESO RECHAZADO: {report.reason}")


def main(argv: list[str] | None = None) -> int:
    """Punto de entrada de la línea de comandos. Cubre R11."""
    parser = argparse.ArgumentParser(description="Inicia sesión por HTTP mostrando lo que viaja.")
    parser.add_argument("--base", default=DEFAULT_BASE, help=f"URL de la API (por defecto {DEFAULT_BASE})")
    parser.add_argument("--user", default=DEFAULT_USER, help=f"identificador del cliente (por defecto {DEFAULT_USER})")
    args = parser.parse_args(argv)
    try:
        with httpx.Client(base_url=args.base, timeout=TIMEOUT_SECONDS) as http:
            report = login_over_http(http, args.user)
    except httpx.HTTPError as error:
        print(f"No se pudo conectar con {args.base} ({error}). ¿Está corriendo «uvicorn api.app:app»?")
        return EXIT_CONNECTION
    except ApiError as error:
        print(f"Error: {error}")
        return EXIT_FAILURE
    print_verdict(report)
    return EXIT_OK if report.accepted and not report.leaks else EXIT_FAILURE


if __name__ == "__main__":
    raise SystemExit(main())
