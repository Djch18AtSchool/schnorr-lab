"""Pruebas del backend aritmético intercambiable de mod_pow (R4, R7).

El protocolo usa la implementación propia; «nativa» y «gmpy2» solo sirven para que el
experimento de latencia compare implementaciones en igualdad de condiciones.
"""

import secrets
import sys

import pytest

from core import modular
from core.modular import ARITHMETIC_BACKENDS, BACKEND_ENV_VAR, get_backend, mod_pow, use_backend

RANDOM_CASES = 200
OPERAND_BITS = 512


@pytest.fixture
def _sin_cache_de_gmpy2():
    """Vacía la importación perezosa de gmpy2 antes y después de simular que no está instalado."""
    modular._gmpy2_powmod.cache_clear()
    yield
    modular._gmpy2_powmod.cache_clear()


@pytest.mark.req("R4")
@pytest.mark.parametrize("backend", ARITHMETIC_BACKENDS)
def test_cada_backend_coincide_con_pow_en_casos_aleatorios(backend):
    if backend == "gmpy2":
        pytest.importorskip("gmpy2")
    with use_backend(backend):
        assert get_backend() == backend
        assert mod_pow(4, 7, 23) == 8
        for _ in range(RANDOM_CASES):
            base, exp = secrets.randbits(OPERAND_BITS), secrets.randbits(OPERAND_BITS)
            mod = 2 + secrets.randbits(OPERAND_BITS)
            result = mod_pow(base, exp, mod)
            assert type(result) is int  # gmpy2 devuelve mpz: se convierte a int
            assert result == pow(base, exp, mod), (backend, base, exp, mod)


@pytest.mark.req("R4")
@pytest.mark.parametrize("backend", ["nativa", "gmpy2"])
def test_con_traza_siempre_usa_la_implementacion_propia(backend):
    if backend == "gmpy2":
        pytest.importorskip("gmpy2")
    trace: list[str] = []
    with use_backend(backend):
        assert mod_pow(4, 7, 23, trace) == 8
    assert len(trace) == 3  # un paso por bit de 7 = 111₂


@pytest.mark.req("R4")
@pytest.mark.parametrize("backend", ARITHMETIC_BACKENDS)
def test_la_validacion_no_depende_del_backend(backend):
    if backend == "gmpy2":
        pytest.importorskip("gmpy2")
    with use_backend(backend), pytest.raises(ValueError):
        mod_pow(4, -1, 23)


@pytest.mark.req("R7")
def test_el_backend_por_defecto_es_el_propio(monkeypatch):
    monkeypatch.delenv(BACKEND_ENV_VAR, raising=False)
    assert get_backend() == "propia"


@pytest.mark.req("R7")
def test_la_variable_de_entorno_elige_el_backend(monkeypatch):
    monkeypatch.setenv(BACKEND_ENV_VAR, "nativa")
    assert get_backend() == "nativa"
    monkeypatch.setenv(BACKEND_ENV_VAR, "inexistente")
    with pytest.raises(ValueError, match=BACKEND_ENV_VAR):
        mod_pow(4, 7, 23)


@pytest.mark.req("R7")
def test_use_backend_restaura_el_anterior_incluso_si_hay_error(monkeypatch):
    monkeypatch.delenv(BACKEND_ENV_VAR, raising=False)
    with use_backend("nativa"):
        with use_backend("propia"):
            assert get_backend() == "propia"
        assert get_backend() == "nativa"
    with pytest.raises(RuntimeError), use_backend("nativa"):
        raise RuntimeError("falla dentro del bloque")
    assert get_backend() == "propia"


@pytest.mark.req("R7")
def test_backend_desconocido_lanza_error_en_espanol():
    with pytest.raises(ValueError, match="Backend aritmético desconocido"), use_backend("cuántico"):
        pass


@pytest.mark.req("R7")
@pytest.mark.usefixtures("_sin_cache_de_gmpy2")
def test_gmpy2_sin_instalar_lanza_error_claro(monkeypatch):
    monkeypatch.delenv(BACKEND_ENV_VAR, raising=False)
    monkeypatch.setitem(sys.modules, "gmpy2", None)  # import gmpy2 → ImportError
    with pytest.raises(ValueError, match="pip install gmpy2"), use_backend("gmpy2"):
        pass
    assert get_backend() == "propia"  # el error ocurre antes de cambiar el backend
