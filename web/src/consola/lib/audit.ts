/** Auditoría: hechos (¿llegó alguna vez x?) y relación de cada cuerpo con su petición. Funciones puras. */
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

export type AuditFilter = "all" | "valid" | "invalid";

export function matchesAudit(entry: AuditEntry, filter: AuditFilter, endpoint: string): boolean {
  if (filter === "valid" && !entry.valid) return false;
  if (filter === "invalid" && entry.valid) return false;
  return !endpoint || entry.endpoint === endpoint;
}

/**
 * El contrato no une cada cuerpo auditado con su petición: se deduce recorriendo ambas listas en
 * orden y emparejando ruta y cuerpo idénticos. Devuelve índice de entrada → petición.
 */
export function linkAuditToRequests(entries: readonly AuditEntry[], requests: readonly RequestRecord[]): ReadonlyMap<number, RequestRecord> {
  const pairs: Array<[number, RequestRecord]> = [];
  let cursor = 0;
  entries.forEach((entry, index) => {
    const body = JSON.stringify(entry.body);
    const at = requests.findIndex((r, i) => i >= cursor && r.path === entry.endpoint && JSON.stringify(r.request_body) === body);
    if (at < 0) return;
    pairs.push([index, requests[at]]);
    cursor = at + 1;
  });
  return new Map(pairs);
}
