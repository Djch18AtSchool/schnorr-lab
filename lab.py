"""Arranca el laboratorio completo: el banco y la app del celular, como dos procesos separados (R11).

Uso:  python lab.py [--group toy] [--bank-port 8000] [--client-port 8001] [--open]

Después abra http://127.0.0.1:8001 (la app del celular y el laboratorio). El banco queda en
http://127.0.0.1:8000 y su documentación interactiva en http://127.0.0.1:8000/docs.
Ctrl+C detiene ambos procesos.
"""

import argparse
import os
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

import httpx

HOST = "127.0.0.1"
READY_TIMEOUT_SECONDS = 30
POLL_SECONDS = 0.2
EXIT_OK, EXIT_FAILURE = 0, 1


def _start(app: str, port: int, env: dict[str, str]) -> subprocess.Popen:
    command = [sys.executable, "-m", "uvicorn", app, "--host", HOST, "--port", str(port), "--log-level", "warning"]
    return subprocess.Popen(command, env={**os.environ, **env})


def _wait_ready(url: str, process: subprocess.Popen) -> bool:
    deadline = time.monotonic() + READY_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if process.poll() is not None:
            return False
        try:
            if httpx.get(url, timeout=2).status_code < 500:
                return True
        except httpx.HTTPError:
            pass
        time.sleep(POLL_SECONDS)
    return False


def _stop(processes: list[subprocess.Popen]) -> None:
    for process in processes:
        process.terminate()
    for process in processes:
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()


def main(argv: list[str] | None = None) -> int:
    """Levanta banco y celular, espera a que respondan y los mantiene hasta Ctrl+C. Cubre R11."""
    parser = argparse.ArgumentParser(description="Laboratorio Schnorr: banco + app del celular.")
    parser.add_argument("--group", default="toy", help="grupo del ZKP al arrancar (toy, safe-512, rfc-2048, ...)")
    parser.add_argument("--bank-port", type=int, default=8000)
    parser.add_argument("--client-port", type=int, default=8001)
    parser.add_argument("--open", action="store_true", help="abrir el navegador al terminar de arrancar")
    args = parser.parse_args(argv)

    bank_url = f"http://{HOST}:{args.bank_port}"
    client_url = f"http://{HOST}:{args.client_port}"
    origins = f"{client_url},http://localhost:{args.client_port}"
    bank = _start("api.app:app", args.bank_port, {"SCHNORR_GROUP": args.group, "BANK_CORS_ORIGINS": origins})
    client = _start("client_app.app:app", args.client_port, {"BANK_URL": bank_url})
    processes = [bank, client]
    if not (_wait_ready(f"{bank_url}/mechanisms", bank) and _wait_ready(f"{client_url}/api/config", client)):
        print("No se pudo arrancar el laboratorio (¿los puertos ya están en uso?).")
        _stop(processes)
        return EXIT_FAILURE
    compiled = (Path(__file__).resolve().parent / "web" / "dist" / "escenario.html").is_file()
    print(f"Escenario (proyectar):  {client_url}/", flush=True)
    print(f"Consola del banco:      {bank_url}/consola/" + ("" if compiled else "  (falta compilar la web)"), flush=True)
    print(f"Swagger del banco:      {bank_url}/docs", flush=True)
    print(f"Interfaz clásica:       {client_url}/clasico", flush=True)
    if not compiled:
        print("Para la interfaz nueva:  cd web && npm ci && npm run build", flush=True)
    print("Ctrl+C para detener.", flush=True)
    if args.open:
        webbrowser.open(client_url)
    try:
        while all(process.poll() is None for process in processes):
            time.sleep(POLL_SECONDS)
    except KeyboardInterrupt:
        print("\nDeteniendo el laboratorio…")
    finally:
        _stop(processes)
    return EXIT_OK


if __name__ == "__main__":
    raise SystemExit(main())
