"""Pruebas del menú de consola: modo paso a paso y autenticación interactiva (R11)."""

import pytest

import demo

EXPECTED_OPTION_1 = """\
[Parámetros]    p = 23   q = 11   g = 4        (g^q ≡ 1 mod p ✔)
[Registro]      x = 7 (secreta)  →  y = 4^7 mod 23 = 8   (el banco guarda solo y)
[Compromiso]    r = 5  →  t = 4^5 mod 23 = 12
[Reto]          c = 3
[Respuesta]     s = 5 + 3·7 mod 11 = 4
[Verificación]  g^s = 4^4 mod 23 = 3   |   t·y^c = 12·8^3 mod 23 = 3
                (y^c)^-1 = 6^-1 = 4 (Euclides extendido) → g^s·(y^c)^-1 = 12 = t ✔
>>> ACCESO CONCEDIDO
"""


@pytest.mark.req("R11")
def test_opcion_1_reproduce_exactamente_la_transcripcion_del_escrito(capsys):
    assert demo.main(["--option", "1"]) == 0
    assert capsys.readouterr().out == EXPECTED_OPTION_1


@pytest.mark.req("R11")
def test_opcion_1_verbose_muestra_pasos_de_mod_pow_y_euclides(capsys):
    demo.main(["--verbose", "--option", "1"])
    out = capsys.readouterr().out
    assert "bit 2 = 1   base = 3   acumulador = 8" in out          # y = 4^7 mod 23
    assert "23 = 3·6 + 5" in out and "Despeje: 1 = 4·6 − 1·23" in out
    assert out.rstrip().endswith(">>> ACCESO CONCEDIDO")


@pytest.mark.req("R11")
@pytest.mark.parametrize("group", ["toy", "safe-256"])
def test_opcion_2_autentica_y_muestra_el_bloqueo(capsys, group):
    assert demo.main(["--option", "2", "--group", group]) == 0
    out = capsys.readouterr().out
    assert ">>> ACCESO CONCEDIDO" in out
    assert "Cuenta bloqueada" in out


@pytest.mark.req("R11")
def test_opcion_2_autentica_con_el_grupo_rfc_de_2048_bits(capsys):
    assert demo.main(["--option", "2", "--group", "rfc-2048"]) == 0
    out = capsys.readouterr().out
    assert "rfc3526-2048: p de 2048 bits" in out
    assert ">>> ACCESO CONCEDIDO" in out


@pytest.mark.req("R11")
@pytest.mark.parametrize("option", ["5", "6"])
def test_opciones_en_esqueleto_avisan_en_lugar_de_fallar(capsys, option):
    assert demo.main(["--option", option]) == 0
    assert "Disponible en el informe final" in capsys.readouterr().out


@pytest.mark.req("R8")
@pytest.mark.parametrize("group", [None, "safe-256"])
def test_opcion_3_inicia_sesion_sin_interaccion_y_rechaza_repeticiones(capsys, group):
    args = ["--option", "3"] + (["--group", group] if group else [])
    assert demo.main(args) == 0
    out = capsys.readouterr().out
    assert "c = H(p ‖ g ‖ y ‖ t ‖ id ‖ m) mod q" in out and ">>> ACCESO CONCEDIDO" in out
    assert "Prueba ya utilizada" in out and "Marca de tiempo fuera de la ventana permitida" in out


@pytest.mark.req("R11")
def test_opcion_4_ejecuta_el_laboratorio_de_ataques(capsys):
    assert demo.main(["--option", "4"]) == 0
    out = capsys.readouterr().out
    assert "mod 11 = 7" in out                       # x recuperada por reutilización de r
    assert "¿Misma distribución? sí" in out
    assert "[Impostor]" in out and "Disponible en el informe final" in out


@pytest.mark.req("R11")
def test_menu_interactivo_termina_con_la_opcion_0(capsys, monkeypatch):
    answers = iter(["9", "1", "0"])
    monkeypatch.setattr("builtins.input", lambda _prompt="": next(answers))
    assert demo.main([]) == 0
    out = capsys.readouterr().out
    assert "Opción no válida" in out and ">>> ACCESO CONCEDIDO" in out
