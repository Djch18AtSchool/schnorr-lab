/**
 * Almacén inmutable de eventos del banco agrupados por correlación, y lectura segura de
 * los campos que trae cada evento (vienen de la red: se validan antes de usarlos).
 */
import type { AccessData, ActRun, BankEvent, CodeSpan } from "../../shared/types";
import { exchangeOf, exchangesOf } from "./beats";
import { asRecord, asString } from "./format";
import type { Beat } from "./types";

export type EventStore = Readonly<Record<string, readonly BankEvent[]>>;

export const EMPTY_STORE: EventStore = Object.freeze({});

export const MECHANISM_KINDS = ["registro", "paso", "verificacion", "error"] as const;

/** Agrega un evento (sin duplicar ids). Los eventos sin correlación no se guardan. */
export function addEvent(store: EventStore, event: BankEvent): EventStore {
  const corr = event.correlation_id;
  if (!corr) return store;
  const current = store[corr] ?? [];
  if (current.some((e) => e.id === event.id)) return store;
  const next = [...current, event].sort((a, b) => a.id - b.id);
  return { ...store, [corr]: next };
}

export function addEvents(store: EventStore, events: readonly BankEvent[]): EventStore {
  return events.reduce(addEvent, store);
}

export interface ExchangeRef {
  corr: string;
  segment: number;
}

/** Correlación de los eventos de un mensaje: la del exchange o, si no tiene, la del paso. */
export function correlationOf(run: ActRun, beat: Beat): ExchangeRef | null {
  const exchange = exchangeOf(run, beat);
  if (!exchange || beat.stepIndex === null || beat.exchangeIndex === null) return null;
  if (exchange.correlation_id) return { corr: exchange.correlation_id, segment: 0 };
  const step = run.steps[beat.stepIndex];
  const shared = exchangesOf(step).slice(0, beat.exchangeIndex).filter((ex) => !ex.correlation_id).length;
  return step.record ? { corr: step.record.correlation_id, segment: shared } : null;
}

export interface ExchangeEvents {
  access: BankEvent | null;
  mechanism: BankEvent[];
}

/**
 * Eventos de un mensaje. Si varios mensajes comparten correlación, se separan por su línea
 * de acceso (el acceso se registra al terminar la petición, después de sus eventos).
 */
export function eventsFor(store: EventStore, ref: ExchangeRef): ExchangeEvents {
  const events = store[ref.corr] ?? [];
  const accessCount = events.filter((e) => e.kind === "acceso").length;
  if (accessCount <= 1) {
    return { access: events.find((e) => e.kind === "acceso") ?? null, mechanism: events.filter(isMechanism) };
  }
  const segments = events.reduce<ExchangeEvents[]>(
    (acc, event) => {
      const last = acc[acc.length - 1];
      if (event.kind === "acceso") return [...acc.slice(0, -1), { ...last, access: event }, { access: null, mechanism: [] }];
      return isMechanism(event) ? [...acc.slice(0, -1), { ...last, mechanism: [...last.mechanism, event] }] : acc;
    },
    [{ access: null, mechanism: [] }],
  );
  return segments[ref.segment] ?? { access: null, mechanism: [] };
}

export function isMechanism(event: BankEvent): boolean {
  return (MECHANISM_KINDS as readonly string[]).includes(event.kind);
}

export function accessDataOf(event: BankEvent): AccessData | null {
  const d = event.data;
  const method = asString(d.method);
  const path = asString(d.path);
  if (!method || !path || typeof d.status !== "number") return null;
  return {
    method,
    path,
    status: d.status,
    duration_ms: typeof d.duration_ms === "number" ? d.duration_ms : 0,
    client: asString(d.client) ?? "desconocido",
    user_agent: asString(d.user_agent) ?? "",
    device: asString(d.device) ?? "desconocido",
  };
}

function isLine(value: unknown): value is { n: number; text: string } {
  const r = asRecord(value);
  return r !== null && typeof r.n === "number" && typeof r.text === "string";
}

export function codeSpanOf(value: unknown): CodeSpan | null {
  const r = asRecord(value);
  if (!r || !Array.isArray(r.lines) || !r.lines.every(isLine)) return null;
  const highlight = Array.isArray(r.highlight) ? r.highlight.filter((n): n is number => typeof n === "number") : [];
  return {
    file: asString(r.file) ?? "",
    function: asString(r.function) ?? "",
    lines: r.lines,
    highlight,
    tone: r.tone === "bad" ? "bad" : "ok",
  };
}

export function mathOf(event: BankEvent): string[] {
  const math = event.data.math;
  return Array.isArray(math) ? math.filter((m): m is string => typeof m === "string") : [];
}
