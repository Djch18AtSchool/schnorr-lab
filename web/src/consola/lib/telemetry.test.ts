import { describe, expect, it } from "vitest";
import { commit, req, respond } from "../test/builders";
import { bucketize, quantile, rejectionText, summarize } from "./telemetry";

describe("quantile", () => {
  it("interpola como numpy (método lineal)", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([10], 0.95)).toBe(10);
    expect(quantile([], 0.5)).toBe(0);
  });
});

describe("summarize", () => {
  const now = 10_000;
  const at = (offset: number) => now - offset;
  const requests = [
    { ...commit(1, "ana", "s1", "a:2"), timestamp: at(100), duration_ms: 4 },
    { ...respond(2, "s1", "a:3", true), timestamp: at(99), duration_ms: 6 },
    { ...respond(3, "s1", "e:1", false), timestamp: at(30), duration_ms: 5 },
    req({ id: 4, path: "/events/stream", route: "/events/stream", timestamp: at(20), duration_ms: 0 }),
    req({ id: 5, status: 422, method: "POST", path: "/zkp/register", route: "/zkp/register", timestamp: at(10), duration_ms: 1 }),
    req({ id: 6, timestamp: at(2000) }),
  ];
  const summary = summarize({ requests, now, startedAt: 5000, windowS: 900, bucketS: 30, lockedAccounts: 1 });

  it("cuenta solo la ventana y clasifica los accesos", () => {
    expect(summary.totals).toEqual({ requests: 5, auth_ok: 1, auth_rejected: 1, locked_accounts: 1, errors_4xx: 1, errors_5xx: 0 });
    expect(summary.requests_per_min).toBe(3);
    expect(summary.signals).toEqual({ "auth.ok": 1, "auth.replay": 1 });
  });

  it("excluye los flujos SSE de la latencia", () => {
    expect(summary.p50_ms).toBe(4.5);
  });

  it("produce window/bucket intervalos y estadísticas por ruta", () => {
    expect(summary.series).toHaveLength(30);
    expect(summary.series.reduce((s, p) => s + p.ok + p.rejected + p.other + p.error, 0)).toBe(5);
    const respondStats = summary.routes.find((r) => r.route === "/zkp/login/respond");
    expect(respondStats).toMatchObject({ method: "POST", count: 2, errors: 0 });
  });

  it("bucketize ubica cada petición en su intervalo", () => {
    const series = bucketize([req({ id: 1, timestamp: 95 })], 100, 60, 30);
    expect(series.map((p) => p.other)).toEqual([0, 1]);
  });
});

describe("rejectionText", () => {
  it("nombra las dos causas de rechazo más frecuentes", () => {
    expect(rejectionText({ "auth.rejected": 4, "auth.replay": 2, "auth.stale": 1, "auth.ok": 50 })).toBe("4 congruencia, 2 repetidas");
    expect(rejectionText({ "auth.ok": 3 })).toBe("");
  });
});
