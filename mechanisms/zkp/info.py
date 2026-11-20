"""Descripción del mecanismo ZKP de Schnorr: flujos y pasos explicados (R11).

Los textos son los que la interfaz muestra al recorrer cada paso; siguen el modelo del
escrito (definiciones 11 a 14, Tabla 1 y Figura 1).
"""

from mechanisms.base import FlowInfo, MechanismInfo, StepInfo

MECHANISM_ID = "zkp"

PARAMS_STEP = StepInfo(
    id="params",
    actor="red",
    title="Descargar los parámetros públicos",
    explanation=("El celular pide p, q y g al banco y los valida antes de usarlos: p y q primos, "
                 "p = 2q + 1 (primo seguro) y g de orden q. No confía en datos externos."),
    formula="g^q ≡ 1 (mod p)",
)

REGISTER_FLOW = FlowInfo(
    id="register",
    title="Crear cuenta",
    steps=(
        PARAMS_STEP,
        StepInfo(
            id="keygen",
            actor="cliente",
            title="Generar el par de claves",
            explanation=("El celular elige la clave secreta x al azar con secrets, en [1, q − 1], y "
                         "calcula la clave pública y con exponenciación rápida. x nunca sale del celular."),
            formula="y = g^x mod p",
        ),
        StepInfo(
            id="register",
            actor="red",
            title="Enviar solo y al banco",
            explanation=("El banco comprueba que y ≠ 1 pertenezca al subgrupo de orden q y guarda el "
                         "par (id, y). Es lo único que conserva: si le roban la base, no hay contraseñas."),
            formula="y^q ≡ 1 (mod p)",
        ),
    ),
)

LOGIN_FLOW = FlowInfo(
    id="login",
    title="Iniciar sesión (interactivo)",
    steps=(
        PARAMS_STEP,
        StepInfo(
            id="commit",
            actor="cliente",
            title="Compromiso",
            explanation=("El celular elige un r nuevo al azar y calcula t. r se usa una sola vez: si "
                         "se repitiera con dos retos distintos, x se podría despejar."),
            formula="t = g^r mod p",
        ),
        StepInfo(
            id="challenge",
            actor="red",
            title="Enviar t y recibir el reto c",
            explanation=("El banco valida que t esté en el subgrupo, elige c al azar y abre una sesión "
                         "de un solo uso. Como c llega después de t, el celular no puede hacer trampa."),
            formula="c ∈ [0, q − 1]",
        ),
        StepInfo(
            id="respond",
            actor="cliente",
            title="Respuesta",
            explanation=("El celular combina r, c y x en s. Como r es aleatorio y de un solo uso, "
                         "s no revela nada sobre x."),
            formula="s = (r + c·x) mod q",
        ),
        StepInfo(
            id="verify",
            actor="red",
            title="Enviar s y verificar",
            explanation=("El banco comprueba la congruencia y, con el inverso modular calculado por "
                         "Euclides extendido, recupera t. Si ambas coinciden, concede el acceso."),
            formula="g^s ≡ t·y^c (mod p)   y   t ≡ g^s·(y^c)^-1 (mod p)",
        ),
    ),
)

NIZK_FLOW = FlowInfo(
    id="login_nizk",
    title="Iniciar sesión (no interactivo, Fiat-Shamir)",
    steps=(
        PARAMS_STEP,
        StepInfo(
            id="prove",
            actor="cliente",
            title="Calcular la prueba sin esperar al banco",
            explanation=("En lugar de recibir c, el celular lo calcula con SHA-256 sobre los datos "
                         "públicos, el identificador y la hora m del intento (RFC 8235)."),
            formula="c = H(p ‖ g ‖ y ‖ t ‖ id ‖ m) mod q,   s = (r + c·x) mod q",
        ),
        StepInfo(
            id="send_proof",
            actor="red",
            title="Enviar la prueba en un solo mensaje",
            explanation=("El banco recalcula c, rechaza pruebas repetidas o con m fuera de la ventana "
                         "permitida y verifica la misma congruencia que en el modo interactivo."),
            formula="g^s ≡ t·y^c (mod p)",
        ),
    ),
)

INFO = MechanismInfo(
    id=MECHANISM_ID,
    name="Prueba de conocimiento cero (Schnorr)",
    category="Autenticador criptográfico",
    summary=("El celular demuestra que conoce x tal que y ≡ g^x (mod p) sin enviarlo. "
             "El banco guarda solo la clave pública y."),
    flows=(REGISTER_FLOW, LOGIN_FLOW, NIZK_FLOW),
)
