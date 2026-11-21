import { describe, expect, it } from "vitest";
import { parseBsgs, parseLatency, parseOpenApi } from "./results";

describe("parseLatency", () => {
  it("acepta el formato real de results/latency.json (seguridad como número o texto)", () => {
    const parsed = parseLatency({
      python: "3.12.13", platform: "Linux", karatsuba_exponent: 1.58,
      rows: [
        { name: "safe-256", family: "safe", series: "primo seguro", bits_p: 256, bits_q: 255, security_bits: "<80", backend: "propia", reps: 31, median_s: 0.0006 },
        { name: "rfc-2048", family: "rfc", series: "primo seguro", bits_p: 2048, bits_q: 2047, security_bits: 112, backend: "gmpy2", reps: 31, median_s: 0.0087 },
        { name: "roto", backend: "propia" },
      ],
    });
    expect(parsed?.rows).toHaveLength(2);
    expect(parsed?.rows[1].security_bits).toBe("112");
  });

  it("devuelve null si no hay filas utilizables", () => {
    expect(parseLatency(null)).toBeNull();
    expect(parseLatency({ rows: [{}] })).toBeNull();
  });
});

describe("parseBsgs", () => {
  it("lee filas, ajuste y predicciones", () => {
    const parsed = parseBsgs({
      rows: [{ q_bits: 16, p_bits: 48, operations: 281, seconds: 7.7e-5, x_real: 1, x_found: 1 }],
      fit: { seconds_per_operation: 2.6e-7, growth_exponent: 0.4977, expected_growth_exponent: 0.5 },
      holdout: { q_bits: 40, relative_error: 0.25 },
      predictions: [{ q_bits: 160, operations: 1.8e24, seconds: 4.8e17, years: 1.5e10 }],
      universe_age_years: 13.8e9,
    });
    expect(parsed?.rows[0].operations).toBe(281);
    expect(parsed?.predictions[0].years).toBe(1.5e10);
  });

  it("rechaza un archivo sin ajuste", () => {
    expect(parseBsgs({ rows: [], predictions: [] })).toBeNull();
  });
});

describe("parseOpenApi", () => {
  it("lista método, ruta, resumen y etiqueta", () => {
    const routes = parseOpenApi({
      openapi: "3.1.0",
      paths: {
        "/zkp/params": { get: { summary: "Parámetros públicos (p, q, g)", tags: ["ZKP · Schnorr"] } },
        "/lab/reset": { post: { summary: "Reiniciar el banco", tags: ["laboratorio"] }, parameters: [] },
      },
    });
    expect(routes).toEqual([
      { method: "GET", path: "/zkp/params", summary: "Parámetros públicos (p, q, g)", tag: "ZKP · Schnorr" },
      { method: "POST", path: "/lab/reset", summary: "Reiniciar el banco", tag: "laboratorio" },
    ]);
  });

  it("devuelve una lista vacía si el documento no trae rutas", () => {
    expect(parseOpenApi("<html>")).toEqual([]);
  });
});
