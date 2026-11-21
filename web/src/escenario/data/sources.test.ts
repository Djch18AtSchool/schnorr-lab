import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "../../shared/api";
import type { BankEvent } from "../../shared/types";
import { createRealSource } from "./realSource";
import { createSimulatedSource } from "./simulated/simulatedSource";
import { searchWithSource, sourceKindFromSearch } from "./source";

describe("elección de fuente", () => {
  test("lee y escribe ?fuente=simulada sin perder otros parámetros", () => {
    expect(sourceKindFromSearch("?fuente=simulada")).toBe("simulada");
    expect(sourceKindFromSearch("?fuente=otra")).toBe("real");
    expect(searchWithSource("?a=1", "simulada")).toBe("?a=1&fuente=simulada");
    expect(searchWithSource("?fuente=simulada", "real")).toBe("");
  });
});

describe("fuente simulada", () => {
  test("la configuración lista los ocho actos y deshabilita los que no tiene", async () => {
    const config = await createSimulatedSource().loadConfig();

    expect(config.acts.map((a) => a.id)).toEqual([
      "registro", "login", "nizk", "espia_respuesta", "robo_base", "impostor", "espia_nizk", "r_repetido",
    ]);
    expect(config.acts.filter((a) => a.available).map((a) => a.id)).toEqual(["registro", "login", "nizk", "espia_respuesta"]);
    expect(config.groups.map((g) => g.id)).toEqual(["toy"]);
  });

  test("ejecuta paso a paso, emite eventos con la correlación del paso y responde 409 al terminar", async () => {
    const source = createSimulatedSource({ eventDelayMs: 0, newId: () => "run1" });
    const events: BankEvent[] = [];
    source.subscribeBank((e) => events.push(e));
    const run = await source.startAct("login");

    const first = await source.nextStep(run.id);
    const rest = [];
    for (let i = 1; i < run.steps.length; i += 1) rest.push(await source.nextStep(run.id));

    expect(first.next_index).toBe(1);
    expect(first.steps[0].record?.correlation_id).toBe("run1:1");
    expect(events.filter((e) => e.correlation_id === "run1:1").map((e) => e.kind)).toEqual(["paso", "acceso"]);
    expect(rest[rest.length - 1].status).toBe("aceptado");
    await expect(source.nextStep(run.id)).rejects.toMatchObject({ status: 409 });
  });

  test("rechaza actos y grupos que no simula", async () => {
    const source = createSimulatedSource();

    await expect(source.startAct("impostor")).rejects.toBeInstanceOf(ApiError);
    await expect(source.resetLab("rfc-2048")).rejects.toMatchObject({ status: 400 });
    await expect(source.resetLab("toy")).resolves.toMatchObject({ group: "toy" });
  });

  test("deja de avisar al cancelar la suscripción", async () => {
    const source = createSimulatedSource({ eventDelayMs: 0 });
    const seen: number[] = [];
    const stop = source.subscribeBank((e) => seen.push(e.id));
    const run = await source.startAct("registro");
    stop();

    await source.nextStep(run.id);
    await source.nextStep(run.id);

    expect(seen).toEqual([]);
  });
});

describe("fuente real", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("usa los endpoints del celular con los cuerpos del contrato", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const body = url.endsWith("/api/config") ? { bank_url: "http://127.0.0.1:8000", acts: [], groups: [], group: "toy" } : { id: "r1" };
      return new Response(JSON.stringify(body), { status: url.includes("/api/acts") && init?.method === "POST" ? 201 : 200 });
    });
    const source = createRealSource();

    await source.loadConfig();
    await source.startAct("login");
    await source.nextStep("r1");
    await source.resetLab("toy");

    expect(calls.map((c) => `${c.init?.method ?? "GET"} ${c.url}`)).toEqual([
      "GET /api/config", "POST /api/acts", "POST /api/acts/r1/next", "POST /api/lab/reset", "GET /api/config",
    ]);
    expect(calls[1].init?.body).toBe(JSON.stringify({ act: "login" }));
    expect(calls[3].init?.body).toBe(JSON.stringify({ group: "toy" }));
  });

  test("propaga el motivo del servidor en el error", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ detail: "El acto ya terminó" }), { status: 409 }));

    await expect(createRealSource().nextStep("r1")).rejects.toMatchObject({ message: "El acto ya terminó", status: 409 });
  });
});
