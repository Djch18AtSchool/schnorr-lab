/**
 * Lectura de una petición (RequestRecord) tal como la vio el banco: su resultado en palabras, el
 * paso del protocolo al que corresponde y utilidades para cuerpos JSON. Funciones puras.
 */
import type { RequestRecord } from "../../shared/types";
import { shortNum } from "./format";

/** ok: concedido o creado · bad: rechazado · warn: error del cliente · neutral: todo lo demás. */
export type Tone = "ok" | "bad" | "warn" | "neutral";

export interface RequestOutcome {
  label: string;
  tone: Tone;
}

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const str = (value: unknown): string | null => (typeof value === "string" ? value : null);

export const bodyField = (body: unknown, key: string): string | null => str(asRecord(body)?.[key]);

/** Señales que el banco cuenta como acceso concedido o rechazado (las mismas que infra/telemetry.py). */
export const GRANTED_SIGNALS: ReadonlySet<string> = new Set(["auth.ok"]);
export const REJECTED_SIGNALS: ReadonlySet<string> = new Set(["auth.rejected", "auth.replay", "auth.stale", "auth.lockout", "auth.locked_attempt"]);

const SIGNAL_OUTCOME: Readonly<Record<string, RequestOutcome>> = {
  "auth.ok": { label: "Acceso concedido", tone: "ok" },
  "auth.rejected": { label: "Prueba inválida", tone: "bad" },
  "auth.replay": { label: "Repetición rechazada", tone: "bad" },
  "auth.stale": { label: "Prueba vieja rechazada", tone: "bad" },
  "auth.lockout": { label: "Prueba inválida: cuenta bloqueada", tone: "bad" },
  "auth.locked_attempt": { label: "Cuenta bloqueada", tone: "bad" },
  "account.created": { label: "Cuenta creada", tone: "ok" },
  "account.rejected": { label: "Registro rechazado", tone: "bad" },
  "admin.unlock": { label: "Cuenta desbloqueada", tone: "neutral" },
  "admin.remove": { label: "Cuenta dada de baja", tone: "neutral" },
};

function errorReason(body: unknown): string | null {
  const record = asRecord(body);
  const reason = str(record?.reason) ?? str(record?.detail);
  if (reason) return reason;
  const first = Array.isArray(record?.detail) ? asRecord(record.detail[0]) : null;
  return str(first?.msg);
}

export const isGranted = (r: RequestRecord): boolean => r.signal !== null && GRANTED_SIGNALS.has(r.signal);
export const isRejected = (r: RequestRecord): boolean => r.signal !== null && REJECTED_SIGNALS.has(r.signal);

/** Qué pasó con la petición, en palabras del banco. */
export function requestOutcome(r: RequestRecord): RequestOutcome {
  const known = r.signal ? SIGNAL_OUTCOME[r.signal] : undefined;
  if (known) return known;
  if (r.status === 422) return { label: "Mensaje mal formado", tone: "warn" };
  if (r.status >= 400) return { label: errorReason(r.response_body) ?? `Error ${r.status}`, tone: "warn" };
  const c = bodyField(r.response_body, "c");
  if (r.signal === "auth.challenge" || (c && bodyField(r.response_body, "session_id"))) {
    return { label: c ? `Reto emitido (c = ${shortNum(c, 6)})` : "Reto emitido", tone: "neutral" };
  }
  if (r.path.endsWith("/params")) return { label: "Parámetros públicos", tone: "neutral" };
  return { label: "Consulta", tone: "neutral" };
}

/** Nombre corto del paso: params, register, commit, respond, nizk, unlock, baja o la ruta. */
export function stepName(r: RequestRecord): string {
  const parts = r.path.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? r.path;
  if (r.path.startsWith("/admin/")) return r.method === "DELETE" ? "baja" : last;
  const isProtocolStep = parts[parts.length - 2] === "login" || last === "params" || last === "register";
  return isProtocolStep ? last : r.path;
}

export function statusClass(status: number): "s2" | "s4" | "s4x" {
  if (status < 300) return "s2";
  return status === 423 || status === 401 || status >= 500 ? "s4x" : "s4";
}

/** IP del cliente sin el puerto. */
export const hostOf = (client: string): string => client.replace(/:\d+$/, "");

/** Usuario de la petición: la etiqueta del banco o, si no la hay, el user_id del cuerpo. */
export const userOf = (r: RequestRecord): string | null => r.tags.user ?? bodyField(r.request_body, "user_id");

/** Agrega registros nuevos sin duplicar ids, en orden, y conserva solo los últimos `cap`. */
export function mergeById<T extends { id: number }>(current: readonly T[], fresh: readonly T[], cap: number): readonly T[] {
  const lastId = current.length ? current[current.length - 1].id : 0;
  const added = fresh.filter((item) => item.id > lastId).sort((a, b) => a.id - b.id);
  if (!added.length) return current;
  const merged = [...current, ...added];
  return merged.length > cap ? merged.slice(merged.length - cap) : merged;
}
