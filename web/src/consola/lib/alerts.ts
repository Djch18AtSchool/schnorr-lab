/** Alertas que llegan por el flujo en vivo y su texto con `código` o exponentes. Funciones puras. */
import type { Alert, BankEvent } from "../../shared/types";

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
