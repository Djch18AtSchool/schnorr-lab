import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../shared/api";
import { RealSource, describeFailure } from "./realSource";

function stubFetch(routes: Record<string, { status: number; body: unknown }>): string[] {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: { method?: string }) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const hit = routes[url.split("?")[0]] ?? { status: 404, body: { detail: "Not Found" } };
    return new Response(JSON.stringify(hit.body), { status: hit.status, statusText: hit.status === 404 ? "Not Found" : "OK" });
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("RealSource", () => {
  it("llama a los endpoints del contrato con rutas relativas al origen", async () => {
    const calls = stubFetch({
      "/telemetry/requests": { status: 200, body: [] },
      "/telemetry/requests/7": { status: 200, body: { request: { id: 7 }, events: [] } },
    });
    const source = new RealSource();
    await source.requests(42, 500);
    const detail = await source.requestDetail(7);
    expect(detail.request.id).toBe(7);
    expect(calls).toEqual(["GET /telemetry/requests?since=42&limit=500", "GET /telemetry/requests/7"]);
  });

  it("explica un 404 con la ruta y el motivo del banco", async () => {
    stubFetch({});
    await expect(new RealSource().requestDetail(3)).rejects.toThrow("GET /telemetry/requests/3 → 404 Not Found");
  });

  it("rechaza un detalle sin la petición y sus eventos", async () => {
    stubFetch({ "/telemetry/requests/3": { status: 200, body: { request: { id: 3 } } } });
    await expect(new RealSource().requestDetail(3)).rejects.toThrow("no trae la petición y sus eventos");
  });

  it("rechaza una lista que no es lista", async () => {
    stubFetch({ "/bank/accounts": { status: 200, body: { ana: {} } } });
    await expect(new RealSource().accounts()).rejects.toThrow("no devolvió una lista");
  });

  it("los resultados ausentes quedan en null en vez de fallar", async () => {
    stubFetch({ "/results/latency.json": { status: 200, body: { rows: [{ name: "safe-256", backend: "propia", bits_p: 256, median_s: 0.001 }] } } });
    const results = await new RealSource().results();
    expect(results.latency?.rows).toHaveLength(1);
    expect(results.bsgs).toBeNull();
    expect(results.files.bsgs.status).toBe("falta");
    expect(results.files.latency.status).toBe("ok");
  });

  it("no pide los archivos que GET /lab/results no lista", async () => {
    const calls = stubFetch({
      "/lab/results": { status: 200, body: ["experimentos.json", "latency.png"] },
      "/results/experimentos.json": { status: 200, body: { aleatoriedad: { logins: 3, distinct_t: 3, distinct_c: 3 } } },
    });
    const results = await new RealSource().results();
    expect(calls).toEqual(["GET /lab/results", "GET /results/experimentos.json"]);
    expect(results.experimentos?.randomness?.logins).toBe(3);
    expect(results.files.comparacion.status).toBe("falta");
  });

  it("marca como inválido un archivo que llega con otra forma o con error del servidor", async () => {
    stubFetch({
      "/results/comparacion.json": { status: 200, body: { rows: "no" } },
      "/results/bsgs.json": { status: 500, body: { detail: "falló" } },
    });
    const results = await new RealSource().results();
    expect(results.files.comparacion).toEqual({ status: "invalido", detail: "el archivo no tiene la forma esperada" });
    expect(results.files.bsgs.status).toBe("invalido");
    expect(results.files.bsgs.detail).toContain("GET /results/bsgs.json → 500");
  });

  it("usa la lista conocida si /openapi.json no responde", async () => {
    stubFetch({});
    const routes = await new RealSource().routes();
    expect(routes.origin).toBe("respaldo");
    expect(routes.routes.some((r) => r.path === "/zkp/login/commit")).toBe(true);
  });
});

describe("describeFailure", () => {
  it("distingue error HTTP, respuesta no JSON y falta de conexión", () => {
    expect(describeFailure("GET", "/x?y=1", new ApiError("Not Found", 404))).toBe("GET /x → 404 Not Found");
    expect(describeFailure("GET", "/x", new SyntaxError("Unexpected token"))).toBe("GET /x → la respuesta no es JSON");
    expect(describeFailure("GET", "/x", new TypeError("Failed to fetch"))).toBe("GET /x → sin conexión con el banco");
  });
});
