/**
 * Estado de interfaz de las alertas: avisos de las altas que llegan en vivo y cuántas altas o
 * medias no se han visto (insignia de Seguridad). Al abrir Seguridad todo queda visto.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Alert } from "../../shared/types";

const MAX_TOASTS = 3;

export interface AlertsUi {
  toasts: readonly Alert[];
  dismissToast: (id: number) => void;
  unseen: number;
}

const maxId = (alerts: readonly Alert[]): number => alerts.reduce((m, a) => Math.max(m, a.id), 0);

export function useAlertsUi(alerts: readonly Alert[], loaded: boolean, onSecurity: boolean): AlertsUi {
  const [toasts, setToasts] = useState<readonly Alert[]>([]);
  const [seenUpTo, setSeenUpTo] = useState<number | null>(null);
  const known = useRef<number | null>(null);

  useEffect(() => {
    if (!loaded) return;
    if (known.current === null) {
      known.current = maxId(alerts);
      setSeenUpTo(maxId(alerts));
      return;
    }
    const previous = known.current;
    const high = alerts.filter((a) => a.id > previous && a.severity === "alta");
    known.current = Math.max(previous, maxId(alerts));
    if (high.length && !onSecurity) setToasts((current) => [...current, ...high].slice(-MAX_TOASTS));
  }, [alerts, loaded, onSecurity]);

  useEffect(() => {
    if (onSecurity && loaded) setSeenUpTo(maxId(alerts));
  }, [onSecurity, alerts, loaded]);

  const dismissToast = useCallback((id: number) => setToasts((current) => current.filter((a) => a.id !== id)), []);
  const unseen = useMemo(() => alerts.filter((a) => a.severity !== "baja" && a.id > (seenUpTo ?? Infinity)).length, [alerts, seenUpTo]);
  return { toasts, dismissToast, unseen };
}
