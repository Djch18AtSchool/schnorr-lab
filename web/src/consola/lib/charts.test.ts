import { describe, expect, it } from "vitest";
import { LAB_RESULTS } from "../data/simulated/labData";
import type { BsgsResults, LatencyResults } from "../data/source";
import { bsgsSeries, latencyGroups, linearScale, linearTicks, logDomain, logScale, niceMax, powerTicks } from "./charts";

const LATENCY = LAB_RESULTS.latency as LatencyResults;
const BSGS = LAB_RESULTS.bsgs as BsgsResults;

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

describe("resultados del laboratorio", () => {
  it("agrupa latency.json por grupo con ms por aritmética, en el orden del archivo", () => {
    const groups = latencyGroups(LATENCY);
    const names = [...new Set(LATENCY.rows.map((r) => r.name))];
    expect(groups.map((g) => g.name)).toEqual(names);
    const row = LATENCY.rows.find((r) => r.name === "rfc-2048" && r.backend === "gmpy2");
    const rfc = groups.find((g) => g.name === "rfc-2048");
    expect(rfc?.ms.gmpy2).toBeCloseTo((row?.median_s ?? 0) * 1000, 6);
    expect(rfc?.bitsQ).toBe(2047);
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

describe("ejes del laboratorio", () => {
  it("logDomain cubre los valores con potencias de 10 enteras", () => {
    expect(logDomain([0.138, 295.8])).toEqual([0.1, 1000]);
    expect(logDomain([])).toEqual([1, 10]);
    expect(logDomain([5, 5])).toEqual([1, 10]);
  });

  it("powerTicks da las potencias de 10 del dominio, saltando de a step", () => {
    expect(powerTicks([0.1, 1000])).toEqual([0.1, 1, 10, 100, 1000]);
    expect(powerTicks([1e-6, 1e30], 6).map((v) => Math.round(Math.log10(v)))).toEqual([-6, 0, 6, 12, 18, 24, 30]);
  });

  it("linearTicks reparte de 0 al máximo", () => {
    expect(linearTicks(200)).toEqual([0, 50, 100, 150, 200]);
  });
});
