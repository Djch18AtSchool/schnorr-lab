"""Descripción del mecanismo de contraseña con Argon2id: flujos y pasos explicados (C1).

Es la línea base de la comparación: la contraseña viaja (sobre TLS, se asume) y el banco
guarda solo su hash Argon2id con sal.
"""

from mechanisms.base import FlowInfo, MechanismInfo, StepInfo

MECHANISM_ID = "password"

CHOOSE_STEP = StepInfo(
    id="password",
    actor="cliente",
    title="Elegir la contraseña",
    explanation=("La persona inventa una contraseña y la recuerda. En el laboratorio el celular "
                 "genera una al azar y la guarda en su wallet, como si la persona la memorizara."),
    formula="contraseña ∈ Σ^n,  n ≥ 8",
)

RECALL_STEP = StepInfo(
    id="password",
    actor="cliente",
    title="Escribir la contraseña",
    explanation=("La persona escribe la contraseña que recuerda. Es el único secreto: quien la "
                 "conozca (por phishing, por mirar o por un robo) puede entrar."),
    formula="contraseña",
)

REGISTER_FLOW = FlowInfo(
    id="register",
    title="Crear cuenta",
    steps=(
        CHOOSE_STEP,
        StepInfo(
            id="register",
            actor="red",
            title="Enviar la contraseña al banco",
            explanation=("La contraseña viaja completa (protegida solo por TLS). El banco elige una sal "
                         "aleatoria, calcula Argon2id con 19 MiB de memoria y 2 iteraciones y guarda "
                         "solo el resultado: nunca la contraseña."),
            formula="h = Argon2id(contraseña, sal; m = 19 MiB, t = 2, p = 1)",
        ),
    ),
)

LOGIN_FLOW = FlowInfo(
    id="login",
    title="Iniciar sesión",
    steps=(
        RECALL_STEP,
        StepInfo(
            id="login",
            actor="red",
            title="Enviar la contraseña y verificar",
            explanation=("El banco recalcula Argon2id con la sal guardada y compara en tiempo constante. "
                         "Tres fallos seguidos bloquean la cuenta. Si alguien captura este mensaje, "
                         "puede repetirlo: la contraseña sirve siempre."),
            formula="Argon2id(contraseña, sal) = h ?",
        ),
    ),
)

INFO = MechanismInfo(
    id=MECHANISM_ID,
    name="Contraseña con hash Argon2id",
    category="Algo que sabe",
    summary=("La persona envía su contraseña; el banco guarda solo el hash Argon2id con sal. "
             "Es la línea base: el secreto viaja en cada inicio de sesión."),
    flows=(REGISTER_FLOW, LOGIN_FLOW),
)
