/**
 * Auditoría (GET /audit/log) y cuerpos recibidos por cuenta: qué campos llegaron alguna vez al banco
 * y la comprobación de que x nunca viajó. Funciones puras.
 */
import type { AuditEntry, RequestRecord } from "../../shared/types";
import { asRecord } from "./requests";

/** ¿Aparece la clave "x" en el cuerpo, a cualquier profundidad? */
export function containsSecret(body: unknown, key = "x"): boolean {
  if (Array.isArray(body)) return body.some((item) => containsSecret(item, key));
  const record = asRecord(body);
  if (!record) return false;
  return Object.entries(record).some(([k, value]) => k === key || containsSecret(value, key));
}

export interface AuditFacts {
  total: number;
  invalid: number;
  fields: string[];
  withSecret: number;
}

export function auditFacts(entries: readonly AuditEntry[]): AuditFacts {
  const fields = new Set(entries.flatMap((e) => Object.keys(asRecord(e.body) ?? {})));
  return {
    total: entries.length,
    invalid: entries.filter((e) => !e.valid).length,
    fields: [...fields],
    withSecret: entries.filter((e) => containsSecret(e.body)).length,
  };
}

/** Rutas cuyo cuerpo el banco guarda en la auditoría (las del protocolo). */
export const isAuditedPath = (method: string, path: string): boolean =>
  method === "POST" && /^\/[a-z0-9_-]+\/(register|login\/[a-z]+)$/.test(path);

/** Cuerpos que llegaron al banco a nombre de la cuenta, el más reciente primero. */
export function bodiesFor(user: string, requests: readonly RequestRecord[]): RequestRecord[] {
  return requests.filter((r) => r.tags.user === user && isAuditedPath(r.method, r.path)).sort((a, b) => b.id - a.id);
}
