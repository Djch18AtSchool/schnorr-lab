# Evidencia de ejecución · segundo avance

Salidas capturadas el 3 de noviembre de 2026 a partir de un clon limpio del repositorio (commit `076054d`), con Python 3.12.13 y las dependencias instaladas con `pip install -e ".[dev]"`. Sirven para el informe sin tener que volver a ejecutar nada. Los números aleatorios (x, r, c) cambian en cada ejecución.

| Archivo | Comando | Qué muestra | Requerimientos |
| --- | --- | --- | --- |
| [01_demo_opcion1.txt](01_demo_opcion1.txt) | `python demo.py --option 1` | La transcripción del escrito con p = 23, idéntica carácter por carácter | R4, R5, R6, R11 |
| [02_demo_opcion1_verbose.txt](02_demo_opcion1_verbose.txt) | `python demo.py --verbose --option 1` | Cada bit de la exponenciación rápida y el despeje de Euclides extendido | R4, R5, R11 |
| [03_demo_opcion2_safe512.txt](03_demo_opcion2_safe512.txt) | `python demo.py --option 2 --group safe-512` | Autenticación con p de 512 bits y bloqueo al tercer fallo | R3, R7, R9 |
| [04_demo_opcion4_ataques.txt](04_demo_opcion4_ataques.txt) | `python demo.py --option 4` | Reutilización de r (x = 7), simulador (110 ternas) e impostor (≈ 9.09 %) | R10 |
| [05_pytest.txt](05_pytest.txt) | `python -m pytest` | Tabla de trazabilidad requerimiento → prueba → resultado | R1–R11 |
| [06_http_client_toy.txt](06_http_client_toy.txt) | `python http_client.py` con la API en p = 23 | Cada mensaje HTTP y la comprobación de que x no viajó | R2, R11 |
| [07_http_client_safe512.txt](07_http_client_safe512.txt) | `python http_client.py` con `SCHNORR_GROUP=safe-512` | Lo mismo con p de 512 bits, donde la comprobación por valor es concluyente | R7, R11 |
| [08_api_ejemplo_del_escrito.txt](08_api_ejemplo_del_escrito.txt) | Recorrido por HTTP equivalente a Swagger | El ejemplo del escrito (x = 7, t = 12) por la API, `/bank/users` y `/audit/log` | R2, R6, R9, R11 |

En `08` se envía a propósito un cuerpo con un campo `x`. El banco lo rechaza con 422 y la auditoría lo registra con `valid: false`, lo que demuestra que `/audit/log` también detectaría un cliente que intentara enviar su clave secreta.
