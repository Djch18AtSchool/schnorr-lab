/**
 * Estado de interfaz de las alertas: cuál está abierta, cuáles son nuevas (destello y aviso) y
 * cuántas altas o medias no se han visto (insignia en la navegación).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Alert } from "../../shared/types";
import { defaultOpenAlert, groupAlerts } from "../lib/alerts";

/** Al cargar, las alertas de hace más de 4 minutos se dan por vistas (como en el boceto). */
const SEEN_AFTER_S = 240;
const MAX_TOASTS = 3;

export interface AlertsUi {
  openAlert: number | null;
  toggleAlert: (id: number) => void;
  showAlert: (id: number) => void;
  fresh: ReadonlySet<number>;
  toasts: readonly Alert[];
  dismissToast: (id: number) => void;
  unseen: number;
}

const maxId = (alerts: readonly Alert[]): number => alerts.reduce((m, a) => Math.max(m, a.id), 0);

export function useAlertsUi(alerts: readonly Alert[], loaded: boolean, onResumen: boolean): AlertsUi {
  const [openAlert, setOpenAlert] = useState<number | null>(null);
  const [toasts, setToasts] = useState<readonly Alert[]>([]);
  const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set());
  const [seenUpTo, setSeenUpTo] = useState<number | null>(null);
  const known = useRef<number | null>(null);

  useEffect(() => {
    if (!loaded) return;
    if (known.current === null) {
      known.current = maxId(alerts);
      const now = Date.now() / 1000;
      setSeenUpTo(maxId(alerts.filter((a) => a.timestamp < now - SEEN_AFTER_S)));
      setOpenAlert(defaultOpenAlert(groupAlerts(alerts)));
      return;
    }
    const previous = known.current;
    const arrived = alerts.filter((a) => a.id > previous);
    if (!arrived.length) return;
    known.current = maxId(alerts);
    setFresh(new Set(arrived.map((a) => a.id)));
    const high = arrived.filter((a) => a.severity === "alta");
    if (high.length) setToasts((current) => [...current, ...high].slice(-MAX_TOASTS));
  }, [alerts, loaded]);

  useEffect(() => {
    if (onResumen && loaded) setSeenUpTo(maxId(alerts));
  }, [onResumen, alerts, loaded]);

  const toggleAlert = useCallback((id: number) => setOpenAlert((current) => (current === id ? -1 : id)), []);
  const showAlert = useCallback((id: number) => setOpenAlert(id), []);
  const dismissToast = useCallback((id: number) => setToasts((current) => current.filter((a) => a.id !== id)), []);
  const unseen = useMemo(() => alerts.filter((a) => a.severity !== "baja" && a.id > (seenUpTo ?? Infinity)).length, [alerts, seenUpTo]);
  return { openAlert, toggleAlert, showAlert, fresh, toasts, dismissToast, unseen };
}
