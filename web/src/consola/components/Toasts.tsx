/** Avisos breves de alertas altas que llegan en vivo, con acceso directo a Seguridad. */
import { motion, AnimatePresence } from "motion/react";
import { useEffect } from "react";
import type { Alert } from "../../shared/types";
import { fmtClock } from "../lib/format";
import { Severity } from "./Common";

const TOAST_MS = 7000;

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
      <Severity severity={alert.severity} />
      <div><b>{alert.title}</b><p>{fmtClock(alert.timestamp)} · {alert.detail}</p></div>
      <button type="button" className="dir-btn" onClick={() => onOpen(alert)}>Ver</button>
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
