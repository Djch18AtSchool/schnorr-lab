"""Contrato común de los mecanismos de autenticación del laboratorio (R11).

Un mecanismo (el ZKP de Schnorr, y en el futuro contraseña, TOTP, SRP o passkey) se compone de:
- MechanismInfo: nombre, categoría y flujos (registro, inicio de sesión, ...), cada uno con sus
  pasos explicados. La interfaz los dibuja sin saber de qué mecanismo se trata.
- ServerMechanism: la parte del banco (router HTTP y lo que guarda por usuario).
- ClientMechanism: la parte del celular (los pasos que ejecuta, en orden).
Así el resto del sistema (banco, app del cliente, interfaz, experimentos) no depende del ZKP.
"""

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any, Protocol

from fastapi import APIRouter

ACTORS = frozenset({"cliente", "red", "banco"})


@dataclass(frozen=True)
class StepInfo:
    """Un paso de un flujo: quién lo hace, qué ocurre y la fórmula que aplica."""

    id: str
    actor: str               # cliente (cálculo local) | red (mensaje al banco y respuesta) | banco
    title: str
    explanation: str
    formula: str = ""


@dataclass(frozen=True)
class FlowInfo:
    """Un proceso completo (por ejemplo «register» o «login») como secuencia de pasos."""

    id: str
    title: str
    steps: tuple[StepInfo, ...]
    available: bool = True


@dataclass(frozen=True)
class MechanismInfo:
    """Descripción de un mecanismo de autenticación y de sus flujos."""

    id: str
    name: str
    category: str
    summary: str
    flows: tuple[FlowInfo, ...]

    def flow(self, flow_id: str) -> FlowInfo:
        """El flujo con ese identificador; ValueError si no existe. Cubre R11."""
        for flow in self.flows:
            if flow.id == flow_id:
                return flow
        raise ValueError(f"El mecanismo {self.id} no tiene el flujo «{flow_id}».")

    def to_json(self) -> dict[str, Any]:
        """Representación serializable para la API y la interfaz. Cubre R11."""
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "summary": self.summary,
            "flows": [
                {"id": f.id, "title": f.title, "available": f.available,
                 "steps": [vars(step).copy() for step in f.steps]}
                for f in self.flows
            ],
        }


@dataclass(frozen=True)
class Exchange:
    """Un mensaje HTTP entre el celular y el banco, tal como viajó."""

    method: str
    path: str
    status: int
    request_body: Any
    response_body: Any
    elapsed_ms: float
    correlation_id: str | None = None

    def to_json(self) -> dict[str, Any]:
        """Representación serializable (para la pestaña «Red» de la interfaz). Cubre R11."""
        return vars(self).copy()


class Gateway(Protocol):
    """Canal del celular hacia el banco: envía un cuerpo JSON y registra el intercambio."""

    def request(self, method: str, path: str, body: dict[str, Any] | None = None,
                correlation_id: str | None = None, mechanism: str | None = None) -> Exchange: ...


@dataclass
class FlowContext:
    """Estado de un flujo en curso del lado del celular (lo comparten sus pasos)."""

    user_id: str
    gateway: Gateway
    wallet: dict[tuple[str, str], Any]       # (mecanismo, usuario) → secreto local del celular
    trace_enabled: bool = False
    state: dict[str, Any] = field(default_factory=dict)
    correlation_id: str | None = None


@dataclass(frozen=True)
class StepResult:
    """Lo que produjo un paso: valores a mostrar, mensaje HTTP (si hubo) y si el flujo terminó."""

    values: Mapping[str, str] = field(default_factory=dict)
    exchange: Exchange | None = None
    trace: tuple[str, ...] = ()
    outcome: str = "ok"                      # ok | aceptado | rechazado
    message: str = ""
    finished: bool = False


StepAction = Callable[[FlowContext], StepResult]


@dataclass(frozen=True)
class ClientStep:
    """Un paso del celular: su descripción y la acción que lo ejecuta."""

    info: StepInfo
    action: StepAction


class ServerMechanism(Protocol):
    """Parte del banco de un mecanismo."""

    info: MechanismInfo
    audited_paths: frozenset[str]

    def router(self) -> APIRouter: ...

    def stored_credentials(self) -> dict[str, dict[str, str]]: ...

    def describe(self) -> dict[str, Any]: ...

    def reset(self, settings: Mapping[str, str]) -> None: ...


class ClientMechanism(Protocol):
    """Parte del celular de un mecanismo."""

    info: MechanismInfo

    def steps(self, flow_id: str) -> list[ClientStep]: ...

    def describe_secret(self, secret: Any) -> dict[str, str]: ...


class StepError(Exception):
    """Un paso no pudo completarse (por ejemplo, el banco no responde o envió datos inválidos)."""
