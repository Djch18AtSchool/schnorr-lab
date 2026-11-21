import { describe, expect, it } from "vitest";
import latencyJson from "../../../../results/latency.json";
import { buildLabResults, LAB_FILES, labFile, listedFiles, rawBody, type RawLabFile } from "./labFiles";

const MISSING: RawLabFile = { kind: "missing" };

describe("buildLabResults", () => {
  it("un archivo ausente queda en null con estado «falta» sin afectar a los demás", () => {
    const r = buildLabResults({ latency: rawBody(latencyJson), bsgs: MISSING, comparacion: MISSING, experimentos: MISSING });
    expect(r.latency?.rows).toHaveLength(latencyJson.rows.length);
    expect(r.files.latency).toEqual({ status: "ok" });
    expect(r.comparacion).toBeNull();
    expect(r.files.comparacion).toEqual({ status: "falta" });
  });

  it("distingue un archivo con otra forma de uno que no se pudo leer", () => {
    const r = buildLabResults({
      latency: rawBody({ rows: [] }), bsgs: { kind: "error", detail: "GET /results/bsgs.json → 500" },
      comparacion: rawBody("texto"), experimentos: MISSING,
    });
    expect(r.files.latency).toEqual({ status: "invalido", detail: "el archivo no tiene la forma esperada" });
    expect(r.files.bsgs).toEqual({ status: "invalido", detail: "GET /results/bsgs.json → 500" });
    expect(r.files.comparacion.status).toBe("invalido");
  });

  it("conserva los campos de razón y predicción de latency.json", () => {
    const r = buildLabResults({ latency: rawBody(latencyJson), bsgs: MISSING, comparacion: MISSING, experimentos: MISSING });
    const step = r.latency?.rows.find((row) => row.name === "safe-512" && row.backend === "propia");
    expect(step?.previous).toBe("safe-256");
    expect(step?.pred_k3).toBe(8);
    expect(step?.pred_karatsuba).toBe(6);
  });
});

describe("catálogo de archivos", () => {
  it("cada archivo tiene el comando que lo genera", () => {
    expect(LAB_FILES.map((f) => f.file)).toEqual(["comparacion.json", "latency.json", "bsgs.json", "experimentos.json"]);
    expect(labFile("experimentos").command).toBe("python -m benchmark.experiments");
    expect(labFile("comparacion").command).toBe("python -m benchmark.compare");
  });

  it("listedFiles acepta solo listas de nombres", () => {
    expect(listedFiles(["a.json", 3, "b.png"])).toEqual(new Set(["a.json", "b.png"]));
    expect(listedFiles({ files: [] })).toBeNull();
  });
});
