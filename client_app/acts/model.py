"""Actos del Escenario: guiones con actores que el cliente propone y ejecuta paso a paso (R10, R11).

Un acto (por ejemplo «Espía repite la respuesta») combina pasos de los flujos de un mecanismo
(los que hace el celular de Ana) con acciones de Eve, la atacante, en su laptop. Cada paso se
ejecuta de verdad cuando la interfaz lo pide: los mensajes viajan por HTTP al banco, que no
sabe qué acto se está representando. Este módulo no depende de ningún mecanismo.
"""

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any

from client_app.gateway import BankGateway
from mechanisms.base import Exchange, FlowContext, StepResult

ACTORS = frozenset({"ana", "eve", "banco"})
KINDS = frozenset({"compute", "exchange", "attack", "narration"})


@dataclass(frozen=True)
class TerminalLine:
    """Una línea de la terminal de la laptop de Eve."""

    kind: str                   # cmd | out | dim | ok | bad
    text: str


@dataclass(frozen=True)
class ActStepInfo:
    """Lo que se anuncia de un paso antes de ejecutarlo."""

    id: str
    actor: str                  # ana | eve | banco
    kind: str                   # compute | exchange | attack | narration
    title: str
    explanation: str
    formula: str = ""

    def __post_init__(self) -> None:
        if self.actor not in ACTORS or self.kind not in KINDS:
            raise ValueError(f"Paso mal definido: actor={self.actor!r}, kind={self.kind!r}.")


@dataclass(frozen=True)
class StepOutcome:
    """Lo que produjo un paso del acto."""

    values: Mapping[str, str] = field(default_factory=dict)
    math: tuple[str, ...] = ()
    exchanges: tuple[Exchange, ...] = ()
    terminal: tuple[TerminalLine, ...] = ()
    outcome: str = "ok"         # ok | aceptado | rechazado
    message: str = ""
    finished: bool = False      # termina su segmento (p. ej. el banco rechazó el compromiso)

    @classmethod
    def from_step(cls, result: StepResult) -> "StepOutcome":
        """Adapta el resultado de un paso de un mecanismo."""
        return cls(values=dict(result.values), math=result.math,
                   exchanges=(result.exchange,) if result.exchange else (), outcome=result.outcome,
                   message=result.message, finished=result.finished)


@dataclass
class ActContext:
    """Estado compartido por los pasos de un acto: los dispositivos y lo que cada uno sabe."""

    user_id: str
    ana_gateway: BankGateway
    eve_gateway: BankGateway
    wallet: dict[tuple[str, str], Any]           # el del celular de Ana (persiste entre actos)
    eve_wallet: dict[tuple[str, str], Any] = field(default_factory=dict)
    flows: dict[str, FlowContext] = field(default_factory=dict)   # segmento → contexto del flujo
    state: dict[str, Any] = field(default_factory=dict)            # memoria de Eve y del acto
    defects: dict[str, Any] = field(default_factory=dict)          # fallas simuladas del celular
    sniff_from: int | None = None                # desde qué mensaje escucha Eve (None: no escucha)
    correlation_id: str | None = None

    def flow_context(self, segment: str, actor: str) -> FlowContext:
        """El contexto del flujo de ese segmento (se crea al empezar el segmento)."""
        if segment not in self.flows:
            gateway, wallet = (self.ana_gateway, self.wallet) if actor == "ana" else (self.eve_gateway,
                                                                                        self.eve_wallet)
            self.flows[segment] = FlowContext(user_id=self.user_id, gateway=gateway, wallet=wallet,
                                              trace_enabled=False, state={"defects": self.defects})
        context = self.flows[segment]
        context.correlation_id = self.correlation_id
        return context

    def intercepted(self, exchange: Exchange) -> bool:
        """True si Eve escuchaba la red cuando viajó este mensaje de Ana."""
        return self.sniff_from is not None and exchange.origin == "ana"


StepRun = Callable[[ActContext], StepOutcome]


@dataclass(frozen=True)
class ActStep:
    """Un paso del guion: su anuncio, su segmento (un flujo o una acción) y lo que ejecuta."""

    info: ActStepInfo
    segment: str
    run: StepRun


@dataclass(frozen=True)
class ActDefinition:
    """Un acto del Escenario. setup: «fresh» (banco vacío) o «registered» (Ana ya tiene cuenta)."""

    id: str
    title: str
    summary: str
    mechanism: str
    setup: str
    build: Callable[[], list[ActStep]]
    defects: Mapping[str, Any] = field(default_factory=dict)
    available: bool = True

    def cast(self, steps: list[ActStep]) -> list[str]:
        actors = {step.info.actor for step in steps}
        return ["ana", "red", "banco"] + (["eve"] if "eve" in actors else [])

    def to_json(self) -> dict[str, Any]:
        steps = self.build()
        return {"id": self.id, "title": self.title, "summary": self.summary, "cast": self.cast(steps),
                "mechanism": self.mechanism, "available": self.available,
                "steps": [vars(step.info).copy() for step in steps]}
