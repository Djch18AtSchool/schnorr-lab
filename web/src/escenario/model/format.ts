/** Utilidades puras para leer cuerpos JSON del contrato y acortarlos para la pantalla. */
import type { Exchange } from "../../shared/types";
import type { KeyValue, Verdict } from "./types";

export const MAX_VALUE_CHARS = 22;
export const MAX_KV_ROWS = 5;
export const MAX_CAPTURE_CHARS = 96;

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}

/** Un valor escalar como texto; objetos y listas como JSON compacto. */
export function scalarText(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function compactJson(value: unknown, max = MAX_CAPTURE_CHARS): string {
  if (value === null || value === undefined) return "";
  return truncate(JSON.stringify(value), max);
}

/** Aplana un nivel: {"stored": {"y": "8"}} → stored.y = 8. Omite las claves indicadas. */
export function keyValues(body: unknown, skip: readonly string[] = []): KeyValue[] {
  const record = asRecord(body);
  if (!record) return [];
  return Object.entries(record)
    .filter(([key]) => !skip.includes(key))
    .flatMap(([key, value]): KeyValue[] => {
      const nested = asRecord(value);
      if (nested) {
        return Object.entries(nested).map(([inner, v]) => ({ key: `${key}.${inner}`, value: scalarText(v) }));
      }
      return [{ key, value: scalarText(value) }];
    })
    .slice(0, MAX_KV_ROWS)
    .map((kv) => ({ key: kv.key, value: truncate(kv.value, MAX_VALUE_CHARS) }));
}

/** Decisión del banco si la respuesta la trae (accepted) o si es un error HTTP. */
export function verdictOf(exchange: Exchange): Verdict | null {
  const body = asRecord(exchange.response_body);
  const reason = asString(body?.reason) ?? asString(body?.detail);
  if (body && typeof body.accepted === "boolean") {
    return { ok: body.accepted, text: reason ?? (body.accepted ? "Aceptado" : "Rechazado") };
  }
  if (exchange.status >= 400) return { ok: false, text: reason ?? `Error ${exchange.status}` };
  return null;
}

export function attemptsLeftOf(exchange: Exchange): number | null {
  const value = asRecord(exchange.response_body)?.attempts_left;
  return typeof value === "number" ? value : null;
}

/** "/zkp/login/commit" → "/commit". */
export function pathTail(path: string): string {
  const parts = path.split("?")[0].split("/").filter(Boolean);
  return parts.length ? `/${parts[parts.length - 1]}` : "/";
}

/** "r (aleatorio, de un solo uso)" → "r". */
export function shortKey(label: string): string {
  const head = label.split(/[\s(]/)[0];
  return head || label;
}

const IDENTITY_KEYS = ["user_id", "session_id", "name", "bits"];

/** Primer campo «interesante» de un cuerpo: t = 12, c = 3, s = 4… */
export function headlineField(body: unknown): string | null {
  const record = asRecord(body);
  if (!record) return null;
  const entry = Object.entries(record).find(([key, value]) => !IDENTITY_KEYS.includes(key) && asRecord(value) === null);
  return entry ? `${entry[0]} = ${truncate(scalarText(entry[1]), 14)}` : null;
}

export function isRegistration(exchange: Exchange): boolean {
  return /\/register$/.test(exchange.path.split("?")[0]);
}

export function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}
