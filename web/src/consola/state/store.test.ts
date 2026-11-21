import { describe, expect, it } from "vitest";
import { alert, event, req } from "../test/builders";
import { INITIAL_STATE, bootFailure, reducer } from "./store";

describe("reducer", () => {
  it("agrega peticiones y eventos nuevos sin duplicar", () => {
    const s1 = reducer(INITIAL_STATE, { type: "requests", fresh: [req({ id: 1 }), req({ id: 2 })] });
    const s2 = reducer(s1, { type: "requests", fresh: [req({ id: 2 })] });
    expect(s2).toBe(s1);
    const s3 = reducer(s2, { type: "events", fresh: [event({ id: 5, kind: "acceso" })] });
    expect(s3.events.map((e) => e.id)).toEqual([5]);
    expect(INITIAL_STATE.requests).toHaveLength(0);
  });

  it("no repite una alerta que ya llegó por el flujo", () => {
    const s1 = reducer(INITIAL_STATE, { type: "alert", alert: alert({ id: 3 }) });
    expect(reducer(s1, { type: "alert", alert: alert({ id: 3 }) })).toBe(s1);
  });

  it("anota y limpia errores por recurso", () => {
    const failed = reducer(INITIAL_STATE, { type: "error", resource: "summary", message: "GET /telemetry/summary → 404 Not Found" });
    expect(failed.errors.summary).toContain("404");
    expect(reducer(failed, { type: "ok", resource: "summary" }).errors).toEqual({});
  });

  it("bootFailure avisa solo si no llegó ni el resumen ni las peticiones", () => {
    const loaded = reducer(INITIAL_STATE, { type: "loaded", patch: { errors: { summary: "404", requests: "404" } } });
    expect(bootFailure(loaded)).toBe("404");
    const withRequests = reducer(loaded, { type: "requests", fresh: [req({ id: 1 })] });
    expect(bootFailure(withRequests)).toBeNull();
    expect(bootFailure(INITIAL_STATE)).toBeNull();
  });
});
