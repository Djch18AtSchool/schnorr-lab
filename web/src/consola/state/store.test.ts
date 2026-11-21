import { describe, expect, it } from "vitest";
import { alert, req } from "../test/builders";
import { INITIAL_STATE, bootFailure, reducer } from "./store";

describe("reducer", () => {
  it("agrega peticiones nuevas sin duplicar y sin tocar el estado anterior", () => {
    const s1 = reducer(INITIAL_STATE, { type: "requests", fresh: [req({ id: 1 }), req({ id: 2 })] });
    const s2 = reducer(s1, { type: "requests", fresh: [req({ id: 2 })] });
    expect(s2).toBe(s1);
    expect(s1.requests.map((r) => r.id)).toEqual([1, 2]);
    expect(INITIAL_STATE.requests).toHaveLength(0);
  });

  it("no repite una alerta que ya llegó por el flujo", () => {
    const s1 = reducer(INITIAL_STATE, { type: "alert", alert: alert({ id: 3 }) });
    expect(reducer(s1, { type: "alert", alert: alert({ id: 3 }) })).toBe(s1);
  });

  it("anota y limpia errores por recurso", () => {
    const failed = reducer(INITIAL_STATE, { type: "error", resource: "requests", message: "GET /telemetry/requests → 404 Not Found" });
    expect(failed.errors.requests).toContain("404");
    expect(reducer(failed, { type: "ok", resource: "requests" }).errors).toEqual({});
  });

  it("bootFailure avisa solo si no llegaron ni peticiones ni cuentas", () => {
    const loaded = reducer(INITIAL_STATE, { type: "loaded", patch: { errors: { requests: "404", accounts: "404" } } });
    expect(bootFailure(loaded)).toBe("404");
    const withRequests = reducer(loaded, { type: "requests", fresh: [req({ id: 1 })] });
    expect(bootFailure(withRequests)).toBeNull();
    expect(bootFailure(INITIAL_STATE)).toBeNull();
  });
});
