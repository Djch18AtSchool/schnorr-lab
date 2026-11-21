import { describe, expect, it } from "vitest";
import { BSGS, LATENCY } from "../data/simulated/fixtures";
import { bsgsSeries, latencyGroups, latencyPoints, latencySeries, linearScale, logScale, niceMax, perMinute, pointTotal } from "./charts";

const point = (t: number, ok: number, other = 0) => ({ t, ok, rejected: 0, other, error: 0, p50_ms: ok ? 3 : 0, p95_ms: ok ? 5 : 0 });

describe("escalas", () => {
  it("lineal y logarítmica llevan el dominio al rango", () => {
    expect(linearScale([0, 10], [0, 100])(2.5)).toBe(25);
    const log = logScale([1, 1000], [300, 0]);
    expect(log(1)).toBe(300);
    expect(log(10)).toBeCloseTo(200);
    expect(log(1000)).toBeCloseTo(0);
  });

  it("niceMax redondea hacia arriba a 2, 5 o 10 por potencia", () => {
    expect([3, 7, 13, 26, 61].map(niceMax)).toEqual([4, 10, 20, 50, 100]);
  });
});

describe("series del resumen", () => {
  it("agrupa intervalos de 30 s en minutos", () => {
    const series = [point(0, 1, 1), point(30, 2), point(60, 0, 4), point(90, 1)];
    expect(pointTotal(series[0])).toBe(2);
    expect(perMinute(series, 30)).toEqual([4, 5]);
  });

  it("deja huecos (null) donde no hubo peticiones", () => {
    expect(latencyPoints([point(0, 1), point(30, 0)])).toEqual([{ p50: 3, p95: 5 }, null]);
  });
});

describe("resultados del laboratorio", () => {
  it("agrupa latency.json por grupo con ms por aritmética", () => {
    const groups = latencyGroups(LATENCY);
    expect(groups).toHaveLength(7);
    const rfc = groups.find((g) => g.name === "rfc-2048");
    expect(rfc?.ms.propia).toBeCloseTo(94.736, 2);
    expect(rfc?.ms.gmpy2).toBeCloseTo(8.66, 2);
    expect(rfc?.bitsQ).toBe(2047);
  });

  it("separa primos seguros y grupos de Schnorr en cada serie", () => {
    const series = latencySeries(latencyGroups(LATENCY));
    expect(series.map((s) => s.backend)).toEqual(["propia", "nativa", "gmpy2"]);
    expect(series[0].safe.map((p) => p.x)).toEqual([256, 512, 1024, 2048, 3072]);
    expect(series[0].schnorr.map((p) => p.label)).toEqual(["schnorr-2048", "schnorr-3072"]);
  });

  it("convierte bsgs.json en medido, ajuste y extrapolación", () => {
    const s = bsgsSeries(BSGS);
    expect(s.measured).toHaveLength(7);
    expect(s.predicted.map((p) => p.x)).toEqual([160, 224, 256]);
    expect(s.fitSolid[0].x).toBe(16);
    expect(s.fitDashed[0].x).toBe(40);
    expect(s.fitDashed[s.fitDashed.length - 1].x).toBe(256);
    const q40 = 1.5 * 2 ** 20 * BSGS.fit.seconds_per_operation;
    expect(s.fitDashed[0].y).toBeCloseTo(q40);
  });
});
