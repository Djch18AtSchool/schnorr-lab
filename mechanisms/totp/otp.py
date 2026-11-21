"""Códigos TOTP del RFC 6238 (sobre HOTP del RFC 4226), con pyotp (C1, C4).

TOTP = HOTP(K, T) con T = ⌊t / 30⌋ y HOTP = Truncar(HMAC-SHA1(K, T)) mod 10^6.
El banco acepta el paso actual y uno antes o después (ventana ±1, por relojes desfasados) y
recuerda el último paso aceptado de cada usuario: un código ya usado no vuelve a servir.
"""

import hmac

import pyotp

DIGITS = 6
PERIOD_SECONDS = 30
VALID_WINDOW = 1                    # pasos de tolerancia a cada lado
SECRET_BASE32_LENGTH = 32           # 32 caracteres base32 = 160 bits (RFC 4226, sección 4)
ISSUER = "Schnorr Lab"
CODE_PATTERN = rf"^[0-9]{{{DIGITS}}}$"
SECRET_PATTERN = rf"^[A-Z2-7]{{{SECRET_BASE32_LENGTH}}}$"


def new_secret() -> str:
    """Secreto compartido K aleatorio (base32, 160 bits). Cubre C1."""
    return pyotp.random_base32(SECRET_BASE32_LENGTH)


def _totp(secret: str) -> pyotp.TOTP:
    return pyotp.TOTP(secret, digits=DIGITS, interval=PERIOD_SECONDS)


def time_step(now: float) -> int:
    """Paso de tiempo T = ⌊t / 30⌋. Cubre C1."""
    return int(now) // PERIOD_SECONDS


def code_at(secret: str, now: float) -> str:
    """Código de 6 dígitos que muestra la app autenticadora en el instante now. Cubre C1."""
    return _totp(secret).generate_otp(time_step(now))


def provisioning_uri(secret: str, user_id: str) -> str:
    """URI otpauth:// que se muestra como código QR al enrolar. Cubre C1."""
    return _totp(secret).provisioning_uri(name=user_id, issuer_name=ISSUER)


def matching_step(secret: str, code: str, now: float, window: int = VALID_WINDOW) -> int | None:
    """El paso T dentro de la ventana ±window cuyo código coincide (comparación en tiempo constante),
    o None si ninguno coincide. Cubre C1 y C4."""
    totp, current = _totp(secret), time_step(now)
    for step in range(current - window, current + window + 1):
        if step >= 0 and hmac.compare_digest(totp.generate_otp(step), code):
            return step
    return None
