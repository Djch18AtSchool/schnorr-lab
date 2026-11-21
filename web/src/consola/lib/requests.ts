/**
 * Lectura de las peticiones (RequestRecord) tal como las ve el banco: resultado, flujo por
 * correlación, usuario deducido y filtros del Tráfico. Funciones puras.
 */
import type { RequestRecord } from "../../shared/types";
import { shortNum } from "./format";

export type Outcome = "granted" | "denied" | "error" | "other";

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const str = (value: unknown): string | null => (typeof value === "string" ? value : null);

/** Señales del banco que significan un acceso rechazado. */
const DENIED_SIGNALS = new Set(["auth.rejected", "auth.replay", "auth.locked", "auth.stale"]);

export function outcomeOf(r: RequestRecord): Outcome {
  if (r.signal === "auth.ok") return "granted";
  if (r.signal && DENIED_SIGNALS.has(r.signal)) return "denied";
  const accepted = asRecord(r.response_body)?.accepted;
  if (accepted === true) return "granted";
  if (accepted === false || r.status === 423) return "denied";
  if (r.status >= 400) return "error";
  return "other";
}

function errorReason(body: unknown): string | null {
  const record = asRecord(body);
  if (!record) return null;
  const reason = str(record.reason) ?? str(record.detail);
  if (reason) return reason;
  if (Array.isArray(record.detail)) {
    const first = asRecord(record.detail[0]);
    return str(first?.msg) ?? null;
  }
  return null;
}

function listLabel(path: string, body: unknown): string | null {
  if (Array.isArray(body)) {
    const noun = path.includes("audit") ? "entradas" : path.includes("mechanisms") ? "mecanismos" : "elementos";
    return `${body.length} ${noun}`;
  }
  return null;
}

/** Texto corto de la columna «Resultado», deducido de la respuesta. */
export function resultLabel(r: RequestRecord): string {
  const body = asRecord(r.response_body);
  const reason = errorReason(r.response_body);
  if (reason) return reason;
  if (r.path.endsWith("/events/stream")) return "Flujo SSE abierto";
  if (r.path.endsWith("/params")) return "Parámetros públicos";
  if (r.status === 201 && body?.stored) return "Registro exitoso";
  const c = str(body?.c);
  if (c && str(body?.session_id)) return `Reto emitido (c = ${shortNum(c, 6)})`;
  if (r.path.endsWith("/lab/reset") && r.status < 300) return "Banco reiniciado";
  const list = listLabel(r.path, r.response_body);
  if (list) return list;
  if (r.path.endsWith("/bank/users") && body) return "Credenciales guardadas";
  return r.status < 300 ? "OK" : `HTTP ${r.status}`;
}

export function statusClass(status: number): "s2" | "s4" | "s4x" {
  if (status < 300) return "s2";
  return status === 423 || status === 401 || status >= 500 ? "s4x" : "s4";
}

/** Correlación "flujo:paso" → flujo. Sin correlación, cada petición es su propio flujo. */
export function flowOf(r: RequestRecord): string {
  if (!r.correlation_id) return `#${r.id}`;
  const cut = r.correlation_id.lastIndexOf(":");
  return cut > 0 ? r.correlation_id.slice(0, cut) : r.correlation_id;
}

export function stepOf(r: RequestRecord): string {
  const cut = r.correlation_id?.lastIndexOf(":") ?? -1;
  return cut > 0 && r.correlation_id ? r.correlation_id.slice(cut + 1) : "·";
}

export const bodyField = (body: unknown, key: string): string | null => str(asRecord(body)?.[key]);

/**
 * Usuario de cada petición: el user_id del cuerpo o, para una respuesta s, el dueño de la sesión
 * (el que la pidió con su compromiso). Así una respuesta repetida por otro origen se atribuye a la
 * cuenta atacada.
 */
export function userIndex(requests: readonly RequestRecord[]): ReadonlyMap<number, string> {
  const sessionOwner = new Map<string, string>();
  const entries: Array<[number, string]> = [];
  for (const r of requests) {
    const user = bodyField(r.request_body, "user_id");
    const issued = bodyField(r.response_body, "session_id");
    if (user && issued) sessionOwner.set(issued, user);
    const owner = user ?? sessionOwner.get(bodyField(r.request_body, "session_id") ?? "");
    if (owner) entries.push([r.id, owner]);
  }
  return new Map(entries);
}

export type TrafficFilter = "all" | "write" | "bad";

export interface TrafficQuery {
  filter: TrafficFilter;
  search: string;
}

export const isWrite = (r: RequestRecord): boolean => r.method !== "GET";
export const isBad = (r: RequestRecord): boolean => {
  const outcome = outcomeOf(r);
  return outcome === "denied" || outcome === "error";
};

export function matchesTraffic(r: RequestRecord, query: TrafficQuery, user: string | undefined): boolean {
  if (query.filter === "write" && !isWrite(r)) return false;
  if (query.filter === "bad" && !isBad(r)) return false;
  const needle = query.search.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [r.path, r.client, r.correlation_id, user, bodyField(r.request_body, "session_id"),
    bodyField(r.response_body, "session_id"), resultLabel(r), String(r.status), r.device];
  return haystack.some((value) => value != null && value.toLowerCase().includes(needle));
}

/** IP del cliente sin el puerto. */
export const hostOf = (client: string): string => client.replace(/:\d+$/, "");

/** Agrega registros nuevos sin duplicar ids, en orden, y conserva solo los últimos `cap`. */
export function mergeById<T extends { id: number }>(current: readonly T[], fresh: readonly T[], cap: number): readonly T[] {
  const lastId = current.length ? current[current.length - 1].id : 0;
  const added = fresh.filter((item) => item.id > lastId).sort((a, b) => a.id - b.id);
  if (!added.length) return current;
  const merged = [...current, ...added];
  return merged.length > cap ? merged.slice(merged.length - cap) : merged;
}
