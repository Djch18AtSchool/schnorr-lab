/** Alertas: agrupación de repeticiones, conteo por severidad y texto con `código`. Funciones puras. */
import type { Alert } from "../../shared/types";

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

/** Parte un texto en tramos normales y `código` (entre comillas invertidas). */
export function codeSpans(text: string): Array<{ text: string; code: boolean }> {
  return text.split("`").map((part, i) => ({ text: part, code: i % 2 === 1 })).filter((part) => part.text !== "");
}
