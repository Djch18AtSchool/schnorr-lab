/** Avisos breves de alertas altas que llegan en vivo, con acceso directo a la alerta. */
import { motion, AnimatePresence } from "motion/react";
import { useEffect } from "react";
import type { Alert } from "../../shared/types";
import { fmtClock } from "../lib/format";

const TOAST_MS = 6000;

interface ToastsProps {
  alerts: readonly Alert[];
  onOpen: (alert: Alert) => void;
  onDismiss: (id: number) => void;
}

function Toast({ alert, onOpen, onDismiss }: { alert: Alert; onOpen: (alert: Alert) => void; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(alert.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [alert.id, onDismiss]);
  return (
    <motion.div className="toast" layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.26, ease: "easeOut" }}>
      <b>{alert.title}</b>
      <p>{fmtClock(alert.timestamp)} · alerta alta</p>
      <button type="button" className="btn" onClick={() => onOpen(alert)}>Ver</button>
    </motion.div>
  );
}

export function Toasts({ alerts, onOpen, onDismiss }: ToastsProps) {
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence>
        {alerts.map((a) => <Toast key={a.id} alert={a} onOpen={onOpen} onDismiss={onDismiss} />)}
      </AnimatePresence>
    </div>
  );
}
