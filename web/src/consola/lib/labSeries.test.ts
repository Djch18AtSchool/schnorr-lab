import { describe, expect, it } from "vitest";
import { LAB_RESULTS } from "../data/simulated/labData";
import type { ComparisonResults, ExperimentResults } from "../data/labTypes";
import type { LatencyResults } from "../data/source";
import { latencyGroups } from "./charts";
import { latencyBars, networkBars, qualitativeRows, secretList, stolenRows, verdictTone } from "./labComparison";
import { impostorByQ, impostorConvergence, nonceSteps, sameDistribution, simulatorBars, smallInverse, successWithin } from "./labExperiments";
import { familyOf, familySeries, meanErrors, ratioRows, speedup } from "./labLatency";

const LATENCY = LAB_RESULTS.latency as LatencyResults;
const CMP = LAB_RESULTS.comparacion as ComparisonResults;
const EXP = LAB_RESULTS.experimentos as ExperimentResults;

describe("latencia por familia y aritmética", () => {
  it("separa primos seguros, ffdhe y Schnorr", () => {
    expect([familyOf("safe"), familyOf("rfc"), familyOf("ffdhe"), familyOf("schnorr")]).toEqual(["seguro", "seguro", "ffdhe", "schnorr"]);
    const series = familySeries(latencyGroups(LATENCY), "propia");
    expect(series.map((s) => s.family)).toEqual(["seguro", "ffdhe", "schnorr"]);
    expect(series[0].points.map((p) => p.x)).toEqual([256, 512, 1024, 2048, 3072]);
    expect(series[1].points.map((p) => p.label)).toEqual(["ffdhe-2048", "ffdhe-3072"]);
  });

  it("omite las familias sin datos de esa aritmética", () => {
    const groups = latencyGroups({ ...LATENCY, rows: LATENCY.rows.filter((r) => r.family !== "ffdhe") });
    expect(familySeries(groups, "gmpy2").map((s) => s.family)).toEqual(["seguro", "schnorr"]);
  });

  it("speedup divide la aritmética lenta entre la rápida", () => {
    const rfc = latencyGroups(LATENCY).find((g) => g.name === "rfc-2048");
    expect(speedup(rfc, "propia", "gmpy2")).toBeCloseTo((rfc?.ms.propia ?? 0) / (rfc?.ms.gmpy2 ?? 1));
    expect(speedup(undefined, "propia", "gmpy2")).toBeNull();
  });

  it("ratioRows toma solo los pasos con grupo anterior y meanErrors promedia", () => {
    const rows = ratioRows(LATENCY, "propia");
    expect(rows[0].label).toBe("safe-256 → safe-512");
    expect(rows.every((r) => r.predK3 > 0)).toBe(true);
    const mean = meanErrors(rows);
    expect(mean?.karatsuba).toBeLessThan(mean?.k3 ?? 0);
    expect(meanErrors([])).toBeNull();
  });
});

describe("comparación", () => {
  it("latencyBars y networkBars traen una fila por mecanismo y marcan el ZKP", () => {
    const lat = latencyBars(CMP);
    expect(lat.map((r) => r.key)).toEqual(CMP.rows.map((r) => r.key));
    expect(lat.filter((r) => r.emphasis).every((r) => r.key.startsWith("zkp"))).toBe(true);
    const net = networkBars(CMP, "login").find((r) => r.key === "srp");
    expect(net?.roundTrips).toBe(3);
    expect(net?.totalBytes).toBe((net?.values.enviados ?? 0) + (net?.values.recibidos ?? 0));
  });

  it("stolenRows agrega SRP con gmpy2 tras SRP y deja un ZKP por grupo", () => {
    const rows = stolenRows(CMP);
    const keys = rows.map((r) => r.key);
    expect(keys.indexOf("srp-gmpy2")).toBe(keys.indexOf("srp") + 1);
    expect(keys).not.toContain("zkp-nizk-schnorr-2048");
    const zkp = rows.find((r) => r.key === "zkp-rfc-2048");
    expect(zkp?.log10Years.diccionario).toBeUndefined();
    expect(zkp?.log10Years.bsgs).toBeGreaterThan(290);
  });

  it("veredictos y tabla cualitativa en orden contraseña, TOTP, SRP, ZKP", () => {
    expect(verdictTone("Vulnerable")).toBe("bad");
    expect(verdictTone("Parcial (cae ante un relevo)")).toBe("warn");
    expect(verdictTone("Limitado por el bloqueo")).toBe("warn");
    expect(verdictTone("Despreciable")).toBe("ok");
    expect(qualitativeRows(CMP).map((r) => r.key)).toEqual(["password", "totp", "srp", "zkp"]);
  });

  it("secretList une los secretos de registro e inicio", () => {
    const totp = CMP.rows.find((r) => r.key === "totp");
    expect(totp ? secretList(totp) : []).toEqual([
      { name: "contraseña", login: true, register: true },
      { name: "secreto TOTP K", login: false, register: true },
    ]);
  });
});

describe("experimentos", () => {
  it("impostor: convergencia y tasa frente a 1/q ordenada por q", () => {
    const imp = EXP.impostor;
    if (!imp) throw new Error("falta impostor");
    expect(impostorConvergence(imp)[0]).toEqual({ x: 10, y: 0 });
    const { measured, expected } = impostorByQ(imp);
    expect(expected.map((p) => p.x)).toEqual([11, 89, 491, 1901, 7121]);
    expect(measured.every((p) => p.y > 0)).toBe(true);
    expect(successWithin(11, 3)).toBeCloseTo(1 - (10 / 11) ** 3);
  });

  it("simulador: una fila por t y distribución idéntica", () => {
    const sim = EXP.simulator;
    if (!sim) throw new Error("falta simulador");
    expect(simulatorBars(sim)[0]).toEqual({ key: "2", label: "t = 2", emphasis: false, values: { real: 11, simulada: 11 } });
    expect(sameDistribution(sim)).toBe(true);
    expect(sameDistribution({ ...sim, byT: [{ t: 1, real: 2, simulated: 3 }] })).toBe(false);
  });

  it("r repetido: reproduce x = 7 del ejemplo del escrito", () => {
    expect(smallInverse(9, 11)).toBe(5);
    expect(smallInverse(0, 11)).toBeNull();
    const nonce = EXP.nonceReuse;
    expect(nonce ? nonceSteps(nonce, 11) : null).toEqual({ ds: 8, dc: 9, inverse: 5, x: 7 });
    expect(nonce ? nonceSteps(nonce, 0) : null).toBeNull();
  });
});
