import { describe, expect, it } from "vitest";
import type { Account } from "../../shared/types";
import { EVE, SUPPORT, alert, req, respond } from "../test/builders";
import { accountsStatus, percentile, severityCounts, supportActions, trafficStats } from "./stats";
import { alertsByOrigin } from "./security";

const account = (user: string, status: Account["status"]): Account =>
  ({ mechanism: "zkp", user_id: user, stored: { y: "9" }, status, attempts_left: 3, created_at: 1, last_login_at: null, devices: [] });

describe("indicadores", () => {
  it("percentil por rango más cercano, como la telemetría del banco", () => {
    expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(percentile([1, 2, 3, 4, 100], 0.95)).toBe(100);
    expect(percentile([], 0.5)).toBe(0);
  });

  it("cuenta concedidos y rechazados con las mismas señales que el banco", () => {
    const stats = trafficStats([respond(1, "ana", "s", "auth.ok"), respond(2, "ana", "s", "auth.replay"), req({ id: 3, signal: "auth.locked_attempt" }), req({ id: 4 })]);
    expect(stats).toMatchObject({ requests: 4, granted: 1, rejected: 2 });
  });

  it("una cuenta bloqueada que soporte desbloqueó se informa como tal, no como 0 bloqueadas sin contexto", () => {
    const lockout = alert({ id: 5, kind: "lockout", severity: "alta", user_id: "ana", timestamp: 100 });
    const unlock = req({ id: 9, timestamp: 120, method: "POST", path: "/admin/accounts/zkp/ana/unlock", ...SUPPORT, signal: "admin.unlock", tags: { user: "ana" } });
    const status = accountsStatus([account("ana", "activa")], [lockout], supportActions([unlock]));
    expect(status).toEqual({ total: 1, active: 1, locked: [], unlocked: [{ user: "ana", lockedAt: 100, unlockedAt: 120 }] });
    expect(accountsStatus([account("ana", "bloqueada")], [lockout], []).locked).toEqual(["ana"]);
  });

  it("cuenta alertas por severidad", () => {
    expect(severityCounts([alert({ id: 1, severity: "alta" }), alert({ id: 2 })])).toEqual({ alta: 1, media: 1, baja: 0 });
  });
});

describe("alertas por origen", () => {
  it("agrupa por dispositivo e IP de la petición que disparó la alerta, la más grave primero", () => {
    const byId = new Map([[3, respond(3, "ana", "s", "auth.ok")], [4, respond(4, "ana", "s", "auth.replay", EVE)], [7, respond(7, "ana", "t", "auth.rejected", EVE)]]);
    const groups = alertsByOrigin([
      alert({ id: 1, severity: "alta", kind: "replay", evidence: [3, 4], timestamp: 10 }),
      alert({ id: 2, severity: "media", evidence: [7], timestamp: 20 }),
      alert({ id: 3, severity: "baja", evidence: [99], user_id: null, timestamp: 30 }),
    ], byId);
    expect(groups.map((g) => [g.device, g.ip, g.alerts.map((a) => a.id), g.severity])).toEqual([
      ["laptop de Eve", "192.168.1.66", [2, 1], "alta"],
      ["desconocido", "?", [3], "baja"],
    ]);
    expect(groups[0].users).toEqual(["ana"]);
  });
});
