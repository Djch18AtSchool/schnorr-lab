/**
 * Seguridad: las alertas agrupadas por quién las provocó (dispositivo + IP de la petición más
 * reciente de su evidencia), con las cuentas afectadas y la severidad más alta. Funciones puras.
 */
import type { Alert, RequestRecord } from "../../shared/types";
import { hostOf } from "./requests";

export interface OriginGroup {
  key: string;
  device: string;
  ip: string;
  /** Las alertas de este origen, la más reciente primero. */
  alerts: readonly Alert[];
  users: readonly string[];
  severity: Alert["severity"];
  last: number;
}

const SEVERITY_RANK: Readonly<Record<Alert["severity"], number>> = { alta: 3, media: 2, baja: 1 };

/** La petición que disparó la alerta: la más reciente de su evidencia que la Consola conoce. */
export function triggerOf(alert: Alert, byId: ReadonlyMap<number, RequestRecord>): RequestRecord | null {
  const known = alert.evidence.map((id) => byId.get(id)).filter((r): r is RequestRecord => r !== undefined);
  return known.length ? known.reduce((a, b) => (b.id > a.id ? b : a)) : null;
}

export function highestSeverity(alerts: readonly Alert[]): Alert["severity"] {
  return alerts.reduce<Alert["severity"]>((top, a) => (SEVERITY_RANK[a.severity] > SEVERITY_RANK[top] ? a.severity : top), "baja");
}

/** Orígenes con alertas: primero los de severidad más alta y, entre iguales, el más reciente. */
export function alertsByOrigin(alerts: readonly Alert[], byId: ReadonlyMap<number, RequestRecord>): OriginGroup[] {
  const groups = new Map<string, { device: string; ip: string; alerts: Alert[] }>();
  for (const alert of alerts) {
    const trigger = triggerOf(alert, byId);
    const device = trigger?.device ?? "desconocido";
    const ip = trigger ? hostOf(trigger.client) : "?";
    const key = `${device}|${ip}`;
    const group = groups.get(key) ?? { device, ip, alerts: [] };
    groups.set(key, { ...group, alerts: [...group.alerts, alert] });
  }
  return [...groups.entries()].map(([key, g]): OriginGroup => {
    const newestFirst = [...g.alerts].sort((a, b) => b.timestamp - a.timestamp || b.id - a.id);
    const users = [...new Set(newestFirst.map((a) => a.user_id).filter((u): u is string => u !== null))];
    return { key, device: g.device, ip: g.ip, alerts: newestFirst, users, severity: highestSeverity(g.alerts), last: newestFirst[0].timestamp };
  }).sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.last - a.last);
}
