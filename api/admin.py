"""Acciones de soporte del banco sobre una cuenta: desbloquear y dar de baja (R9, R11).

Son las que haría un operador de un banco real (por ejemplo, desbloquear a una clienta tras un
ataque). El Escenario las usa para preparar cada acto sin reiniciar el banco, y la Consola las
muestra como cualquier otra petición, con el dispositivo «soporte del banco».
"""

from typing import Any

from fastapi import APIRouter, HTTPException, Request, status

router = APIRouter(prefix="/admin", tags=["soporte"])
ACTIONS = {"unlock": "desbloquear", "remove": "dar de baja"}


def _apply(request: Request, mechanism: str, user_id: str, action: str) -> dict[str, Any]:
    server = request.app.state.bank.servers.get(mechanism)
    if server is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Mecanismo desconocido: «{mechanism}».")
    operation = getattr(server, action, None)
    if not callable(operation):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"El mecanismo {mechanism} no permite {ACTIONS[action]}.")
    if not operation(user_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No existe la cuenta «{user_id}» en {mechanism}.")
    return {"mechanism": mechanism, "user_id": user_id, "action": action}


@router.post("/accounts/{mechanism}/{user_id}/unlock", summary="Desbloquear una cuenta")
def unlock(request: Request, mechanism: str, user_id: str) -> dict[str, Any]:
    """Borra los intentos fallidos: la cuenta vuelve a recibir retos. Cubre R9."""
    return _apply(request, mechanism, user_id, "unlock")


@router.delete("/accounts/{mechanism}/{user_id}", summary="Dar de baja una cuenta")
def remove(request: Request, mechanism: str, user_id: str) -> dict[str, Any]:
    """Elimina lo que el banco guarda de la cuenta (con el ZKP, su y). Cubre R2."""
    return _apply(request, mechanism, user_id, "remove")
