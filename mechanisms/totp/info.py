"""Descripción del mecanismo contraseña + TOTP: flujos y pasos explicados (C1).

Dos factores: algo que sabe (la contraseña, verificada con Argon2id) y algo que tiene (la app
autenticadora con el secreto compartido K). El banco guarda el hash y K.
"""

from mechanisms.base import FlowInfo, MechanismInfo, StepInfo
from mechanisms.password.info import CHOOSE_STEP, RECALL_STEP

MECHANISM_ID = "totp"
TOTP_FORMULA = "código = Truncar(HMAC-SHA1(K, ⌊t/30⌋)) mod 10^6"

REGISTER_FLOW = FlowInfo(
    id="register",
    title="Crear cuenta y enrolar el autenticador",
    steps=(
        CHOOSE_STEP,
        StepInfo(
            id="enroll",
            actor="red",
            title="Enviar la contraseña y recibir el secreto compartido",
            explanation=("El banco guarda el hash Argon2id de la contraseña, elige un secreto K de 160 bits "
                         "y lo devuelve como URI otpauth:// (el código QR que se escanea). K viaja una vez "
                         "y queda en el banco y en el celular: ambos pueden calcular los códigos."),
            formula="K ← 160 bits al azar;  h = Argon2id(contraseña, sal)",
        ),
        StepInfo(
            id="authenticator",
            actor="cliente",
            title="La app autenticadora guarda K y calcula el primer código",
            explanation=("Con el reloj del celular calcula el paso de tiempo T y el código de 6 dígitos "
                         "(RFC 6238). Cambia cada 30 segundos."),
            formula=TOTP_FORMULA,
        ),
        StepInfo(
            id="confirm",
            actor="red",
            title="Confirmar el enrolamiento con el primer código",
            explanation=("El banco calcula el mismo código con su copia de K. Si coincide (aceptando un "
                         "paso antes o después), activa el segundo factor y recuerda ese paso como usado."),
            formula="código = TOTP(K, T + δ),  δ ∈ {−1, 0, 1}",
        ),
    ),
)

LOGIN_FLOW = FlowInfo(
    id="login",
    title="Iniciar sesión (contraseña + código)",
    steps=(
        RECALL_STEP,
        StepInfo(
            id="code",
            actor="cliente",
            title="Leer el código de la app autenticadora",
            explanation=("La app calcula el código del paso de tiempo actual con K. El código solo sirve "
                         "unos segundos y una sola vez."),
            formula=TOTP_FORMULA,
        ),
        StepInfo(
            id="login",
            actor="red",
            title="Enviar contraseña y código y verificar",
            explanation=("El banco verifica la contraseña con Argon2id y el código con K, en la ventana ±1. "
                         "Rechaza un código de un paso ya usado (repetición) y bloquea al tercer fallo."),
            formula="Argon2id(contraseña, sal) = h   y   código = TOTP(K, T + δ) con T + δ > último usado",
        ),
    ),
)

INFO = MechanismInfo(
    id=MECHANISM_ID,
    name="Contraseña + código TOTP (RFC 6238)",
    category="Algo que sabe + algo que tiene",
    summary=("La contraseña viaja como en el mecanismo de contraseña y además un código de 6 dígitos "
             "que cambia cada 30 s. El banco guarda el hash y el secreto compartido K."),
    flows=(REGISTER_FLOW, LOGIN_FLOW),
)
