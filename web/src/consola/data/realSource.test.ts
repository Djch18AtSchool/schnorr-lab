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
      "/telemetry/summary": { status: 200, body: { window_s: 900 } },
      "/telemetry/requests": { status: 200, body: [] },
      "/events": { status: 200, body: [] },
    });
    const source = new RealSource();
    await source.summary(900);
    await source.requests(42, 500);
    await source.events(7);
    expect(calls).toEqual(["GET /telemetry/summary?window=900", "GET /telemetry/requests?since=42&limit=500", "GET /events?since=7&limit=5000"]);
  });

  it("explica un 404 con la ruta (la telemetría todavía no existe)", async () => {
    stubFetch({});
    await expect(new RealSource().summary(900)).rejects.toThrow("GET /telemetry/summary → 404 Not Found");
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
  });

  it("usa la lista conocida si /openapi.json no responde", async () => {
    stubFetch({});
    const routes = await new RealSource().routes();
    expect(routes.origin).toBe("respaldo");
    expect(routes.routes.some((r) => r.path === "/zkp/login/commit")).toBe(true);
  });

  it("reinicia con POST /lab/reset", async () => {
    const calls = stubFetch({ "/lab/reset": { status: 200, body: [] } });
    await new RealSource().reset();
    expect(calls).toEqual(["POST /lab/reset"]);
  });
});

describe("describeFailure", () => {
  it("distingue error HTTP, respuesta no JSON y falta de conexión", () => {
    expect(describeFailure("GET", "/x?y=1", new ApiError("Not Found", 404))).toBe("GET /x → 404 Not Found");
    expect(describeFailure("GET", "/x", new SyntaxError("Unexpected token"))).toBe("GET /x → la respuesta no es JSON");
    expect(describeFailure("GET", "/x", new TypeError("Failed to fetch"))).toBe("GET /x → sin conexión con el banco");
  });
});
