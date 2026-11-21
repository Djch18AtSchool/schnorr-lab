/**
 * Logs del servidor a partir de los eventos del banco (BankEvent): cada evento se escribe como lo
 * haría uvicorn o el registrador del banco. Funciones puras: conversión, filtros y conteos.
 */
import type { AccessData, BankEvent } from "../../shared/types";
import { asRecord } from "./requests";

export const LEVELS = ["DEBUG", "INFO", "WARNING", "ERROR"] as const;
export type Level = (typeof LEVELS)[number];

export interface LogLine {
  id: number;
  ts: number;
  level: Level;
  source: string;
  msg: string;
}

const MECHANISM_KINDS = new Set(["registro", "paso", "verificacion", "error"]);
/** Campos que no se imprimen como clave=valor (son estructura, no datos del log). */
const HIDDEN_FIELDS = new Set(["logger", "span", "math", "signal", "trace", "level"]);
const MAX_VALUE_CHARS = 28;

const isLevel = (value: unknown): value is Level => typeof value === "string" && (LEVELS as readonly string[]).includes(value);

function accessLine(event: BankEvent): Pick<LogLine, "level" | "source" | "msg"> {
  const data = event.data as Partial<AccessData>;
  const status = Number(data.status ?? 0);
  const ms = typeof data.duration_ms === "number" ? `${data.duration_ms.toFixed(2)}ms` : "stream";
  const corr = event.correlation_id ? `  corr=${event.correlation_id}` : "";
  const level: Level = status >= 500 ? "ERROR" : status >= 400 ? "WARNING" : "INFO";
  return { level, source: "uvicorn.access", msg: `${data.client ?? "?"} - "${data.method ?? "?"} ${data.path ?? "?"} HTTP/1.1" ${status}  ${ms}${corr}` };
}

function fieldText(value: unknown): string | null {
  if (value == null || typeof value === "object") return null;
  const text = String(value).replace(/\s+/g, " ");
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text;
}

function fieldsOf(data: Record<string, unknown>): string {
  return Object.entries(data)
    .filter(([key]) => !HIDDEN_FIELDS.has(key))
    .map(([key, value]) => [key.includes(" ") ? `"${key}"` : key, fieldText(value)] as const)
    .filter(([, text]) => text !== null && text !== "")
    .map(([key, text]) => `${key}=${text}`)
    .join(" ");
}

function mechanismLevel(event: BankEvent): Level {
  if (event.kind === "error") return "WARNING";
  const data = asRecord(event.data) ?? {};
  const signal = typeof data.signal === "string" ? data.signal : null;
  if (signal && signal !== "auth.ok") return "WARNING";
  if (event.kind === "verificacion" && String(data.accepted).toLowerCase() === "false") return "WARNING";
  return "INFO";
}

function sourceOf(event: BankEvent): string {
  const logger = asRecord(event.data)?.logger;
  if (typeof logger === "string") return logger;
  if (event.mechanism) return `banco.${event.mechanism}`;
  return event.source === "sistema" ? "banco.sistema" : `banco.${event.source}`;
}

/** Un evento del banco → una línea de log. */
export function eventToLogLine(event: BankEvent): LogLine {
  const base = { id: event.id, ts: event.timestamp };
  const declared = asRecord(event.data)?.level;
  if (event.kind === "acceso") return { ...base, ...accessLine(event) };
  if (event.kind === "alerta") {
    const data = asRecord(event.data) ?? {};
    return { ...base, level: "WARNING", source: "banco.alertas", msg: `alerta ${String(data.severity ?? "")} ${String(data.kind ?? "")}: ${event.title}` };
  }
  const fields = fieldsOf(asRecord(event.data) ?? {});
  const msg = fields ? `${event.title}  ${fields}` : event.title;
  const level = isLevel(declared) ? declared : MECHANISM_KINDS.has(event.kind) ? mechanismLevel(event) : "INFO";
  return { ...base, level, source: sourceOf(event), msg };
}

export interface LogQuery {
  levels: Readonly<Record<Level, boolean>>;
  source: string;
  text: string;
}

export function matchesLog(line: LogLine, query: LogQuery): boolean {
  if (!query.levels[line.level]) return false;
  if (query.source && line.source !== query.source) return false;
  const needle = query.text.trim().toLowerCase();
  return !needle || `${line.source} ${line.msg}`.toLowerCase().includes(needle);
}

export function countLevels(lines: readonly LogLine[]): Record<Level, number> {
  return lines.reduce<Record<Level, number>>(
    (acc, line) => ({ ...acc, [line.level]: acc[line.level] + 1 }),
    { DEBUG: 0, INFO: 0, WARNING: 0, ERROR: 0 },
  );
}

export function sourcesOf(lines: readonly LogLine[]): string[] {
  return [...new Set(lines.map((line) => line.source))].sort();
}

/** Parte el texto en tramos para resaltar las coincidencias de la búsqueda (sin HTML). */
export function highlight(text: string, needle: string): Array<{ text: string; hit: boolean }> {
  const query = needle.trim();
  if (!query) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const target = query.toLowerCase();
  const parts: Array<{ text: string; hit: boolean }> = [];
  let from = 0;
  for (let at = lower.indexOf(target); at >= 0; at = lower.indexOf(target, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), hit: false });
    parts.push({ text: text.slice(at, at + target.length), hit: true });
    from = at + target.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), hit: false });
  return parts;
}
