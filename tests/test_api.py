"""Pruebas de la API HTTP del banco y del cliente HTTP (R11)."""

import httpx
import pytest
from fastapi.testclient import TestClient

import http_client
from api.app import create_app
from protocol import TOY_GROUP, get_group
from protocol.client import Client

USER = "cliente01"


@pytest.fixture
def api() -> TestClient:
    return TestClient(create_app("toy"))


def _register(api: TestClient, y: str = "8", user_id: str = USER) -> httpx.Response:
    return api.post("/register", json={"user_id": user_id, "y": y})


def _commit(api: TestClient, t: str = "12", user_id: str = USER) -> httpx.Response:
    return api.post("/login/commit", json={"user_id": user_id, "t": t})


def _respond(api: TestClient, session_id: str, s: str) -> httpx.Response:
    return api.post("/login/respond", json={"session_id": session_id, "s": s})


# ------------------------------------------------------------------ flujo completo

@pytest.mark.req("R11")
def test_params_muestra_el_grupo_de_ejemplo_como_cadenas(api):
    assert api.get("/params").json() == {"name": "toy-23", "p": "23", "q": "11", "g": "4", "bits": 5}


@pytest.mark.req("R11")
def test_flujo_completo_con_el_ejemplo_del_escrito(api):
    client = Client(USER, TOY_GROUP, x=7)
    assert _register(api).status_code == 201
    commit = _commit(api, str(client.commit(r=5))).json()
    s = client.respond(int(commit["c"]))
    body = _respond(api, commit["session_id"], str(s)).json()
    assert body["accepted"] and body["reason"] == "Acceso concedido"
    assert body["transcript"] == {"t": "12", "c": commit["c"], "s": str(s)}
    assert body["details"]["t_rec"] == "12"
    assert body["attempts_left"] == 3


@pytest.mark.req("R11")
def test_banco_solo_guarda_y(api):
    _register(api)
    assert api.get("/bank/users").json() == {USER: "8"}


@pytest.mark.req("R11")
def test_cliente_http_inicia_sesion_y_x_no_aparece_en_ningun_mensaje():
    api = TestClient(create_app("safe-256"))
    report = http_client.login_over_http(api, USER, show=False)
    assert report.accepted
    assert not report.leaks
    audit = api.get("/audit/log").json()
    assert [entry["endpoint"] for entry in audit] == ["/register", "/login/commit", "/login/respond"]
    assert all(str(report.x) not in entry["body"].values() for entry in audit)


@pytest.mark.req("R11")
def test_cliente_http_con_grupo_de_ejemplo_no_envia_campos_secretos(api):
    report = http_client.login_over_http(api, USER, show=False)
    assert report.accepted and not report.leaks


@pytest.mark.req("R11")
def test_cliente_http_usa_otro_id_si_el_usuario_ya_existe(api):
    _register(api, y="16")
    report = http_client.login_over_http(api, USER, show=False)
    assert report.accepted and report.user_id.startswith(f"{USER}-")


# ------------------------------------------------------------- detector de fugas de x

@pytest.mark.req("R11")
def test_detector_marca_campos_no_publicos_y_valores_de_x_con_q_grande():
    gp = get_group("safe-256")
    leaks, _ = http_client.find_secret_leaks(x=123456789, gp=gp, bodies=[{"user_id": "a", "x": "1"},
                                                                          {"s": "123456789"}])
    assert len(leaks) == 2


@pytest.mark.req("R11")
def test_detector_solo_anota_coincidencias_con_q_pequeno():
    leaks, notes = http_client.find_secret_leaks(x=4, gp=TOY_GROUP, bodies=[{"session_id": "ab", "s": "4"}])
    assert leaks == [] and len(notes) == 1


@pytest.mark.req("R11")
def test_veredicto_no_afirma_ausencia_de_x_si_hubo_coincidencias(capsys):
    report = http_client.LoginReport("cliente01", 4, True, "Acceso concedido", ({"s": "4"},), 3,
                                     leaks=(), notes=("«s» = 4 coincide numéricamente con x",))
    http_client.print_verdict(report)
    out = capsys.readouterr().out
    assert "no aparece en ningún cuerpo" not in out
    assert "Ningún campo transporta x" in out


@pytest.mark.req("R11")
def test_cliente_http_informa_si_la_api_no_esta_disponible(capsys):
    assert http_client.main(["--base", "http://127.0.0.1:9"]) == http_client.EXIT_CONNECTION
    assert "uvicorn api.app:app" in capsys.readouterr().out


# --------------------------------------------------------------- validación (R9 por HTTP)

@pytest.mark.req("R11")
@pytest.mark.parametrize("y", ["1", "5"])
def test_registro_invalido_devuelve_400_con_motivo(api, y):
    response = _register(api, y=y)
    assert response.status_code == 400 and "y" in response.json()["reason"]


@pytest.mark.req("R11")
def test_registro_repetido_devuelve_400(api):
    _register(api)
    assert _register(api).json() == {"reason": "El usuario ya está registrado"}


@pytest.mark.req("R11")
def test_compromiso_rechaza_usuario_inexistente_t_invalido_y_cuenta_bloqueada(api):
    assert _commit(api).status_code == 404
    _register(api)
    assert _commit(api, t="5").status_code == 400
    for _ in range(2):
        session_id = _commit(api).json()["session_id"]
        _respond(api, session_id, "11")
    response = _commit(api)
    assert response.status_code == 423 and response.json()["reason"] == "Cuenta bloqueada"


@pytest.mark.req("R11")
def test_respuesta_fuera_de_rango_y_sesion_reutilizada(api):
    _register(api)
    session_id = _commit(api).json()["session_id"]
    first = _respond(api, session_id, "11").json()
    assert not first["accepted"] and first["reason"] == "s fuera de rango"
    assert first["attempts_left"] == 2
    assert _respond(api, session_id, "4").json()["reason"] == "Sesión inválida"


@pytest.mark.req("R11")
@pytest.mark.parametrize("body", [{"user_id": USER, "y": 8}, {"user_id": USER, "y": "ocho"},
                                  {"user_id": "con espacio", "y": "8"}, {"user_id": USER}])
def test_entradas_mal_formadas_devuelven_422(api, body):
    assert api.post("/register", json=body).status_code == 422


@pytest.mark.req("R11")
def test_cuerpo_rechazado_queda_en_la_auditoria_y_la_respuesta_no_repite_la_entrada(api):
    leaky = {"user_id": "filtrador", "y": "8", "x": "7"}
    response = api.post("/register", json=leaky)
    assert response.status_code == 422
    assert response.json() == {"reason": "Cuerpo inválido: x: campo no permitido (solo viajan valores públicos)"}
    assert api.get("/audit/log").json() == [{"endpoint": "/register", "valid": False, "body": leaky}]
    leaks, _ = http_client.find_secret_leaks(x=7, gp=TOY_GROUP, bodies=[leaky])
    assert leaks  # el campo «x» se detecta aunque el banco lo haya rechazado


@pytest.mark.req("R11")
def test_cuerpo_que_no_es_json_tambien_se_audita(api):
    response = api.post("/login/respond", content=b"{roto", headers={"content-type": "application/json"})
    assert response.status_code == 422 and "JSON" in response.json()["reason"]
    entry = api.get("/audit/log").json()[0]
    assert entry["valid"] is False and entry["body"] == {"_cuerpo_no_json": "{roto"}


@pytest.mark.req("R11")
def test_cliente_de_demostracion_devuelve_x_pero_no_entra_al_banco_ni_a_la_auditoria(api):
    response = api.post("/demo/client", json={"user_id": USER, "x": "7"})
    assert response.status_code == 201
    assert response.json()["x"] == "7" and response.json()["y"] == "8"
    assert api.get("/bank/users").json() == {}
    assert api.get("/audit/log").json() == []


@pytest.mark.req("R11")
def test_grupo_desconocido_en_la_variable_de_entorno_falla_al_iniciar():
    with pytest.raises(ValueError):
        create_app("grupo-inexistente")
