/** Alertas: agrupación de repeticiones, conteo por severidad y texto con `código`. Funciones puras. */
import type { Alert, BankEvent } from "../../shared/types";

export interface AlertGroup {
  alert: Alert;
  times: number;
}

/**
 * Más recientes primero; alertas iguales seguidas (mismo título, no altas) se agrupan en una con ×n.
 * Las altas nunca se agrupan: cada una es un incidente.
 */
export function groupAlerts(alerts: readonly Alert[]): AlertGroup[] {
  const newestFirst = [...alerts].sort((a, b) => b.timestamp - a.timestamp || b.id - a.id);
  return newestFirst.reduce<AlertGroup[]>((acc, alert) => {
    const prev = acc[acc.length - 1];
    if (prev && prev.alert.title === alert.title && alert.severity !== "alta") {
      return [...acc.slice(0, -1), { ...prev, times: prev.times + 1 }];
    }
    return [...acc, { alert, times: 1 }];
  }, []);
}

export function severityCounts(alerts: readonly Alert[]): Record<Alert["severity"], number> {
  return alerts.reduce<Record<Alert["severity"], number>>(
    (acc, a) => ({ ...acc, [a.severity]: acc[a.severity] + 1 }),
    { alta: 0, media: 0, baja: 0 },
  );
}

/** La alerta que se abre al entrar: la alta más reciente o, si no hay, la más reciente. */
export function defaultOpenAlert(groups: readonly AlertGroup[]): number | null {
  const high = groups.find((g) => g.alert.severity === "alta");
  return (high ?? groups[0])?.alert.id ?? null;
}

const SEVERITIES = new Set<string>(["alta", "media", "baja"]);

/** Un evento «alerta» del flujo en vivo trae la alerta en data; se valida antes de usarla. */
export function alertFromEvent(event: BankEvent): Alert | null {
  const d = event.data;
  if (event.kind !== "alerta" || typeof d.id !== "number" || typeof d.severity !== "string" || !SEVERITIES.has(d.severity)) return null;
  return {
    id: d.id,
    timestamp: typeof d.timestamp === "number" ? d.timestamp : event.timestamp,
    severity: d.severity as Alert["severity"],
    kind: typeof d.kind === "string" ? d.kind : "desconocida",
    title: typeof d.title === "string" ? d.title : event.title,
    detail: typeof d.detail === "string" ? d.detail : "",
    user_id: typeof d.user_id === "string" ? d.user_id : null,
    evidence: Array.isArray(d.evidence) ? d.evidence.filter((id): id is number => typeof id === "number") : [],
  };
}

/** Parte un texto en tramos normales y `código` (entre comillas invertidas). */
export function codeSpans(text: string): Array<{ text: string; code: boolean }> {
  return text.split("`").map((part, i) => ({ text: part, code: i % 2 === 1 })).filter((part) => part.text !== "");
}

/** Parte un texto con exponentes "g^s" o "4^3" en tramos normales y superíndices. */
export function supSpans(text: string): Array<{ text: string; sup: boolean }> {
  return text.split(/\^([\w−-]+)/).map((part, i) => ({ text: part, sup: i % 2 === 1 })).filter((part) => part.text !== "");
}
