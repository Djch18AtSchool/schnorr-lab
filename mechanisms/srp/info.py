"""Descripción del mecanismo SRP-6a: flujos y pasos explicados (C1).

SRP es un PAKE (acuerdo de clave autenticado con contraseña): la persona usa una contraseña,
pero esta nunca viaja; el banco guarda un verificador v = g^x y, al final, ambos se demuestran
mutuamente que conocen la misma clave de sesión K.
"""

from mechanisms.base import FlowInfo, MechanismInfo, StepInfo

MECHANISM_ID = "srp"

PARAMS_STEP = StepInfo(
    id="params",
    actor="red",
    title="Descargar los parámetros públicos",
    explanation=("El celular pide N, g y el hash al banco y solo acepta el grupo de 2048 bits del "
                 "RFC 5054 con SHA-256: un banco falso no puede imponer un grupo débil."),
    formula="N primo seguro de 2048 bits,  g = 2,  H = SHA-256",
)

REGISTER_FLOW = FlowInfo(
    id="register",
    title="Crear cuenta",
    steps=(
        PARAMS_STEP,
        StepInfo(
            id="verifier",
            actor="cliente",
            title="Elegir la contraseña y calcular el verificador",
            explanation=("La persona elige la contraseña; el celular sortea una sal s y deriva x de la "
                         "contraseña con un hash. El verificador v es una potencia de g: el banco no "
                         "puede invertirla, pero un ladrón de la base puede probar contraseñas."),
            formula="x = H(s | H(I | \":\" | P)),   v = g^x mod N",
        ),
        StepInfo(
            id="register",
            actor="red",
            title="Enviar la sal y v al banco",
            explanation="El banco guarda solo (s, v). La contraseña y x no salen del celular.",
            formula="1 < v < N",
        ),
    ),
)

LOGIN_FLOW = FlowInfo(
    id="login",
    title="Iniciar sesión",
    steps=(
        PARAMS_STEP,
        StepInfo(
            id="ephemeral",
            actor="cliente",
            title="Clave efímera del celular",
            explanation="El celular sortea a (256 bits, nuevo en cada sesión) y calcula A.",
            formula="A = g^a mod N",
        ),
        StepInfo(
            id="start",
            actor="red",
            title="Enviar A y recibir la sal y B",
            explanation=("El banco aborta si A ≡ 0 (mod N), sortea b y responde con la sal y B, que "
                         "mezcla su secreto b con el verificador v."),
            formula="A mod N ≠ 0,   B = (k·v + g^b) mod N,   k = H(N | PAD(g))",
        ),
        StepInfo(
            id="session_key",
            actor="cliente",
            title="Calcular la clave de sesión y la prueba M1",
            explanation=("El celular aborta si B ≡ 0 (mod N) o u = 0, rederiva x de la contraseña y "
                         "calcula S. Ambos lados llegan al mismo S sin enviarlo."),
            formula="u = H(PAD(A) | PAD(B)),  S = (B − k·g^x)^(a + u·x) mod N,  K = H(S),  "
                    "M1 = H(H(N) ⊕ H(g) | H(I) | s | A | B | K)",
        ),
        StepInfo(
            id="verify",
            actor="red",
            title="Enviar M1 y recibir M2",
            explanation=("El banco calcula S con v y b, verifica M1 (si no coincide suma un fallo; al "
                         "tercero bloquea) y responde con M2, su propia prueba de que conoce v."),
            formula="S = (A·v^u)^b mod N,   M1 = M1' ?,   M2 = H(A | M1 | K)",
        ),
        StepInfo(
            id="server_proof",
            actor="cliente",
            title="Verificar al banco (autenticación mutua)",
            explanation=("El celular recalcula M2. Si no coincide, el servidor no conoce v: es un banco "
                         "falso y la sesión se descarta aunque haya dicho «aceptado»."),
            formula="M2 = H(A | M1 | K) ?",
        ),
    ),
)

INFO = MechanismInfo(
    id=MECHANISM_ID,
    name="SRP-6a (RFC 5054)",
    category="Algo que sabe, sin que viaje (PAKE)",
    summary=("La persona usa una contraseña, pero solo viajan A, B, M1 y M2. El banco guarda la sal y "
             "el verificador v = g^x, y ambos lados se autentican mutuamente."),
    flows=(REGISTER_FLOW, LOGIN_FLOW),
)
