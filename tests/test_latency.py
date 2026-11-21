"""Pruebas de la medición de latencia según el tamaño de p (R7, interrogante P3)."""

import csv
import json
import sys

import pytest

from benchmark import latency
from core import modular
from core.params import TOY_GROUP

FAST_GROUPS = ["toy", "safe-256"]
FAST_BACKENDS = ("propia", "nativa")


def _row(name: str, series: str, bits_p: int, backend: str, median_s: float) -> dict:
    return {"name": name, "series": series, "bits_p": bits_p, "backend": backend, "median_s": median_s}


@pytest.mark.req("R7")
def test_measure_auth_rechaza_cero_repeticiones():
    with pytest.raises(ValueError):
        latency.measure_auth(TOY_GROUP, reps=0)


@pytest.mark.req("R7")
@pytest.mark.parametrize(
    ("bits_p", "bits_q", "expected"),
    [(256, None, "<80"), (512, 511, "<80"), (1024, 1023, 80), (2048, 2047, 112), (3072, 3071, 128),
     (2048, 224, 112), (3072, 256, 128), (2048, 160, 80)],
)
def test_nivel_de_seguridad_de_la_definicion_10(bits_p, bits_q, expected):
    assert latency.security_bits(bits_p, bits_q) == expected


@pytest.mark.req("R7")
def test_razon_y_predicciones_usan_el_tamano_anterior_de_la_misma_serie_y_backend():
    seguro, schnorr = latency.SAFE_SERIES, latency.SCHNORR_SERIES
    rows = latency.add_predictions([
        _row("schnorr-3072", schnorr, 3072, "propia", 0.03),
        _row("rfc-2048", seguro, 2048, "propia", 0.70),
        _row("safe-1024", seguro, 1024, "propia", 0.10),
        _row("safe-1024", seguro, 1024, "nativa", 0.05),
        _row("schnorr-2048", schnorr, 2048, "propia", 0.01),
    ])
    by_key = {(r["name"], r["backend"]): r for r in rows}
    doubling = by_key[("rfc-2048", "propia")]
    assert doubling["previous"] == "safe-1024"
    assert doubling["ratio"] == pytest.approx(7.0)
    assert doubling["pred_k3"] == pytest.approx(8.0)
    assert doubling["pred_karatsuba"] == pytest.approx(6.0)  # 2^(1 + log₂3) = 2·3
    assert doubling["err_k3"] == pytest.approx(1 / 8)
    assert by_key[("schnorr-3072", "propia")]["previous"] == "schnorr-2048"
    assert by_key[("safe-1024", "nativa")]["ratio"] is None
    assert [r["name"] for r in rows][-2:] == ["schnorr-2048", "schnorr-3072"]


@pytest.mark.req("R7")
def test_ffdhe_forma_su_propia_serie_con_la_seguridad_del_rfc_7919(monkeypatch):
    monkeypatch.setattr(latency, "measure_auth", lambda gp, reps: gp.bits / 1e6)
    rows = latency.measure(groups=["rfc-2048", "ffdhe-3072", "ffdhe-2048"], reps=1, backends=("propia",),
                           results_dir=None)
    assert [r["name"] for r in rows] == ["rfc-2048", "ffdhe-2048", "ffdhe-3072"]
    ffdhe_2048, ffdhe_3072 = rows[1], rows[2]
    assert ffdhe_2048["series"] == ffdhe_3072["series"] == latency.FFDHE_SERIES
    assert (ffdhe_2048["security_bits"], ffdhe_3072["security_bits"]) == (103, 125)
    assert ffdhe_2048["previous"] is None and ffdhe_3072["previous"] == "ffdhe-2048"
    assert rows[0]["security_bits"] == 112


@pytest.mark.req("R7")
def test_measure_guarda_tabla_y_graficas(tmp_path):
    rows = latency.measure(groups=FAST_GROUPS, reps=3, backends=FAST_BACKENDS, results_dir=tmp_path)
    latency.plot(rows, tmp_path)
    assert [(r["name"], r["backend"]) for r in rows] == [
        ("toy", "propia"), ("toy", "nativa"), ("safe-256", "propia"), ("safe-256", "nativa")]
    assert all(r["median_s"] > 0 for r in rows)
    assert rows[2]["previous"] == "toy" and rows[2]["ratio"] > 1
    assert rows[2]["security_bits"] == "<80" and rows[2]["family"] == "safe"
    with (tmp_path / "latency.csv").open(encoding="utf-8") as handle:
        assert len(list(csv.DictReader(handle))) == 4
    assert len(json.loads((tmp_path / "latency.json").read_text(encoding="utf-8"))["rows"]) == 4
    for figure in ("latency.png", "backends.png"):
        assert (tmp_path / figure).stat().st_size > 0


@pytest.mark.req("R7")
def test_measure_omite_gmpy2_con_aviso_si_no_esta_instalado(monkeypatch):
    modular._gmpy2_powmod.cache_clear()
    monkeypatch.setitem(sys.modules, "gmpy2", None)
    try:
        with pytest.warns(UserWarning, match="gmpy2"):
            rows = latency.measure(groups=["toy"], reps=1, backends=("propia", "gmpy2"), results_dir=None)
    finally:
        modular._gmpy2_powmod.cache_clear()
    assert [r["backend"] for r in rows] == ["propia"]


@pytest.mark.req("R7")
def test_cli_imprime_la_tabla_y_guarda_resultados(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(latency, "RESULTS_DIR", tmp_path)
    assert latency.main(["--groups", "safe-256", "--reps", "2", "--backends", "propia"]) == 0
    out = capsys.readouterr().out
    assert "safe-256" in out and "mediana ms" in out
    assert (tmp_path / "latency.png").exists()
