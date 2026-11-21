"""Catálogo de actos del Escenario con el ZKP de Schnorr (R10, R11).

Cada acto es un guion: pasos de los flujos del celular de Ana (tomados del mecanismo, sin
copiarlos) y acciones de Eve. El orden es el de prioridad acordado para la exposición.
"""

from collections.abc import Callable

from client_app.acts import eve
from client_app.acts.model import ActDefinition, ActStep, ActStepInfo, StepOutcome, StepRun
from mechanisms.base import ClientMechanism, StepAction
from mechanisms.registry import create_clients

ZKP = "zkp"
FRESH, REGISTERED = "fresh", "registered"


def flow_steps(mechanism: ClientMechanism, flow_id: str, segment: str) -> list[ActStep]:
    """Los pasos de un flujo del mecanismo, ejecutados por el celular de Ana. Cubre R11."""
    steps = []
    for step in mechanism.steps(flow_id):
        kind = "compute" if step.info.actor == "cliente" else "exchange"
        info = ActStepInfo(id=f"{segment}.{step.info.id}", actor="ana", kind=kind, title=step.info.title,
                           explanation=step.info.explanation, formula=step.info.formula)
        steps.append(ActStep(info, segment, _run_flow_step(step.action, segment)))
    return steps


def _run_flow_step(action: StepAction, segment: str) -> StepRun:
    return lambda ctx: StepOutcome.from_step(action(ctx.flow_context(segment, "ana")))


def eve_step(step_id: str, title: str, explanation: str, run: StepRun, formula: str = "") -> ActStep:
    """Una acción de Eve en su laptop (es su propio segmento)."""
    return ActStep(ActStepInfo(id=f"eve.{step_id}", actor="eve", kind="attack", title=title,
                               explanation=explanation, formula=formula), f"eve.{step_id}", run)


def _zkp() -> ClientMechanism:
    return create_clients()[ZKP]


SNIFF = ("escucha", "Eve escucha la red",
         "Eve se conecta al mismo Wi-Fi del café que Ana y copia, sin modificarlo, todo lo que pasa.")


def _sniff() -> ActStep:
    return eve_step(*SNIFF, eve.sniff)


def _espia_respuesta() -> list[ActStep]:
    return [_sniff(), *flow_steps(_zkp(), "login", "ana.login"),
            eve_step("repite", "Eve reenvía la respuesta copiada",
                     "Manda al banco exactamente el mismo mensaje con s que Ana envió, con su sesión.",
                     eve.replay("/zkp/login/respond"))]


def _espia_nizk() -> list[ActStep]:
    return [_sniff(), *flow_steps(_zkp(), "login_nizk", "ana.nizk"),
            eve_step("repite", "Eve reenvía la prueba copiada",
                     "Manda la misma prueba (t, s, m) dentro de la ventana de tiempo.",
                     eve.replay("/zkp/login/nizk"))]


def _robo_base() -> list[ActStep]:
    return [eve_step("roba", "Eve roba la base de datos", "Consigue una copia de la tabla de usuarios del banco.",
                     eve.steal_database),
            eve_step("bsgs", "Eve intenta despejar x", "Busca x tal que g^x ≡ y (mod p) con paso de bebé, paso "
                     "de gigante: cuesta del orden de √q operaciones.", eve.crack, "x = log_g(y) mod q"),
            eve_step("entra", "Eve intenta entrar como Ana", "Si tiene x, responde el reto como lo haría el "
                     "celular de Ana.", eve.login_as_victim)]


def _impostor() -> list[ActStep]:
    attempts = [eve_step(f"intento{n}", f"Eve intenta suplantar a Ana ({n} de 3)",
                         "Sin x, adivina el reto c' y fabrica t = g^s·(y^c')^-1: gana solo si el banco elige c = c'.",
                         eve.impostor_attempt, "t = g^s·(y^c')^-1 mod p") for n in (1, 2, 3)]
    return [eve_step("reconoce", "Eve reúne los datos públicos", "Parámetros del grupo y la clave pública y de Ana.",
                     eve.reconnaissance),
            *attempts, *flow_steps(_zkp(), "login", "ana.login")]


def _r_repetido() -> list[ActStep]:
    return [_sniff(), *flow_steps(_zkp(), "login", "ana.login1"), *flow_steps(_zkp(), "login", "ana.login2"),
            eve_step("despeja", "Eve despeja x", "Dos respuestas con el mismo r y retos distintos: "
                     "restándolas queda x.", eve.extract_x, "x = (s₁ − s₂)·(c₁ − c₂)^-1 mod q"),
            eve_step("entra", "Eve entra como Ana", "Con x, el banco no puede distinguirla de Ana.",
                     eve.login_as_victim)]


def _define(act_id: str, title: str, summary: str, setup: str, build: Callable[[], list[ActStep]],
            **extra: object) -> ActDefinition:
    return ActDefinition(id=act_id, title=title, summary=summary, mechanism=ZKP, setup=setup, build=build, **extra)


ACTS: dict[str, ActDefinition] = {act.id: act for act in (
    _define("registro", "Registro", "Ana instala la app y crea su cuenta: el banco guarda solo y.", FRESH,
            lambda: flow_steps(_zkp(), "register", "ana.registro")),
    _define("login", "Inicio de sesión", "Ana demuestra que conoce x sin enviarla (compromiso, reto, respuesta).",
            REGISTERED, lambda: flow_steps(_zkp(), "login", "ana.login")),
    _define("nizk", "Inicio sin interacción", "Fiat-Shamir: Ana calcula el reto con SHA-256 y envía un solo "
            "mensaje.", REGISTERED, lambda: flow_steps(_zkp(), "login_nizk", "ana.nizk")),
    _define("espia_respuesta", "Espía repite la respuesta", "Eve copia el inicio de sesión de Ana y reenvía la "
            "respuesta: la sesión ya se usó.", REGISTERED, _espia_respuesta),
    _define("robo_base", "Robo de la base de datos", "Eve roba la base: solo hay claves públicas. Con p = 23 "
            "despeja x; con 2048 bits, no.", REGISTERED, _robo_base),
    _define("impostor", "Impostor", "Eve intenta entrar sin x adivinando el reto; al tercer fallo la cuenta se "
            "bloquea, también para Ana.", REGISTERED, _impostor),
    _define("espia_nizk", "Espía repite la prueba", "Eve reenvía una prueba no interactiva capturada: el banco "
            "recuerda las pruebas usadas.", REGISTERED, _espia_nizk),
    _define("r_repetido", "Celular que repite r", "Un celular defectuoso repite r en dos inicios de sesión: Eve "
            "despeja x y entra.", REGISTERED, _r_repetido, defects={"reuse_r": True}),
)}
