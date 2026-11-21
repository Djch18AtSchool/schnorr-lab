/**
 * Indicadores del Resumen calculados con las peticiones del rango elegido (los mismos criterios que
 * la telemetría del banco) y el estado de las cuentas contado igual que las alertas. Funciones puras.
 */
import type { Account, Alert, RequestRecord } from "../../shared/types";
import { isGranted, isRejected } from "./requests";

/** Percentil por rango más cercano (como infra/telemetry.py); 0 si no hay datos. */
export function percentile(values: readonly number[], fraction: number): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(fraction * ordered.length));
  return ordered[rank - 1];
}

export interface TrafficStats {
  requests: number;
  granted: number;
  rejected: number;
  p50: number;
  p95: number;
}

export function trafficStats(requests: readonly RequestRecord[]): TrafficStats {
  const durations = requests.map((r) => r.duration_ms);
  return {
    requests: requests.length,
    granted: requests.filter(isGranted).length,
    rejected: requests.filter(isRejected).length,
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
  };
}

export type SeverityCounts = Readonly<Record<Alert["severity"], number>>;

export function severityCounts(alerts: readonly Alert[]): SeverityCounts {
  return alerts.reduce<SeverityCounts>((acc, a) => ({ ...acc, [a.severity]: acc[a.severity] + 1 }), { alta: 0, media: 0, baja: 0 });
}

export interface SupportAction {
  id: number;
  timestamp: number;
  user: string;
  action: "unlock" | "remove";
}

/** Peticiones de soporte que el banco aceptó (señales admin.unlock y admin.remove). */
export function supportActions(requests: readonly RequestRecord[]): SupportAction[] {
  return requests.flatMap((r): SupportAction[] => {
    const user = r.tags.user;
    if (!user || (r.signal !== "admin.unlock" && r.signal !== "admin.remove")) return [];
    return [{ id: r.id, timestamp: r.timestamp, user, action: r.signal === "admin.unlock" ? "unlock" : "remove" }];
  });
}

export interface AccountsStatus {
  total: number;
  active: number;
  locked: readonly string[];
  /** Cuentas que se bloquearon (alerta lockout) y soporte desbloqueó después. */
  unlocked: ReadonlyArray<{ user: string; lockedAt: number; unlockedAt: number }>;
}

/** Estado de las cuentas contado de forma coherente con las alertas de bloqueo del rango. */
export function accountsStatus(accounts: readonly Account[], alerts: readonly Alert[], support: readonly SupportAction[]): AccountsStatus {
  const locked = accounts.filter((a) => a.status === "bloqueada").map((a) => a.user_id);
  const unlocked = alerts.filter((a) => a.kind === "lockout" && a.user_id !== null && !locked.includes(a.user_id)).flatMap((a) => {
    const fix = support.find((s) => s.action === "unlock" && s.user === a.user_id && s.timestamp >= a.timestamp);
    return fix && a.user_id ? [{ user: a.user_id, lockedAt: a.timestamp, unlockedAt: fix.timestamp }] : [];
  });
  return { total: accounts.length, active: accounts.length - locked.length, locked, unlocked };
}
