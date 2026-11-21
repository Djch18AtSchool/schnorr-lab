/**
 * Terminal del banco: se arma SOLO con los eventos del banco de cada correlación.
 * Línea de acceso estilo uvicorn y líneas estructuradas del mecanismo:
 *   INFO  192.168.1.23:52344 - "POST /zkp/login/commit HTTP/1.1" 200  4.03ms
 *   INFO  banco.zkp  challenge user=ana t=12 c=3 session=77991cce…
 */
import type { ActRun, BankEvent, CodeSpan } from "../../shared/types";
import { exchangeOf } from "./beats";
import { accessDataOf, codeSpanOf, correlationOf, eventsFor, mathOf, type EventStore } from "./events";
import { asString, truncate } from "./format";
import type { BankTerminalView, Beat, LogLevel, LogLine, LogToken, TermEntry } from "./types";

export const LOG_ENTRIES_SHOWN = 3;
const MAX_FIELD_CHARS = 12;
const FIELD_HEAD_CHARS = 8;
const MAX_PHRASE_CHARS = 40;
const RESERVED_FIELDS = ["logger", "span", "math", "signal", "event", "level"];
const BAD_SIGNALS = ["auth.rejected", "auth.replay", "auth.locked", "auth.stale", "auth.invalid"];
const LEVELS: readonly LogLevel[] = ["INFO", "WARN", "ERROR"];

function tok(text: string, cls: LogToken["cls"] = "plain"): LogToken {
  return { text, cls };
}

function levelForStatus(status: number): LogLevel {
  if (status >= 500) return "ERROR";
  return status >= 400 ? "WARN" : "INFO";
}

export function accessLine(event: BankEvent): LogLine | null {
  const access = accessDataOf(event);
  if (!access) return null;
  const level = levelForStatus(access.status);
  return {
    level,
    tokens: [
      tok(`${access.client} - `),
      tok(`"${access.method} ${access.path} HTTP/1.1"`, "req"),
      tok(" "),
      tok(String(access.status), level === "INFO" ? "st" : "bad"),
      tok("  "),
      tok(`${access.duration_ms.toFixed(2)}ms`, "ms"),
    ],
  };
}

export function mechanismLevel(event: BankEvent): LogLevel {
  const explicit = asString(event.data.level)?.toUpperCase();
  const known = LEVELS.find((level) => level === explicit);
  if (known) return known;
  const signal = asString(event.data.signal) ?? "";
  const span = codeSpanOf(event.data.span);
  return event.kind === "error" || BAD_SIGNALS.includes(signal) || span?.tone === "bad" ? "WARN" : "INFO";
}

/** Valores sin espacios (números grandes, ids) se acortan; las frases se citan completas. */
function fieldValue(value: string | number | boolean): string {
  const text = String(value);
  if (/\s/.test(text)) return `"${truncate(text, MAX_PHRASE_CHARS)}"`;
  return text.length > MAX_FIELD_CHARS ? `${text.slice(0, FIELD_HEAD_CHARS)}…` : text;
}

function valueClass(value: string | number | boolean): LogToken["cls"] {
  if (value === true || value === "ok" || value === "true") return "ok";
  if (value === false || value === "false") return "bad";
  return "plain";
}

export function mechanismLine(event: BankEvent): LogLine {
  const logger = asString(event.data.logger) ?? `banco.${event.mechanism ?? "app"}`;
  const word = asString(event.data.event) ?? event.kind;
  const fields = Object.entries(event.data).filter(
    (entry): entry is [string, string | number | boolean] =>
      !RESERVED_FIELDS.includes(entry[0]) && ["string", "number", "boolean"].includes(typeof entry[1]),
  );
  const fieldTokens = fields.flatMap(([key, value]) => [tok(" "), tok(`${key}=`, "k"), tok(fieldValue(value), valueClass(value))]);
  return { level: mechanismLevel(event), tokens: [tok(logger, "src"), tok("  "), tok(word), ...fieldTokens] };
}

interface ServedExchange {
  beat: Beat;
  lines: LogLine[];
  spans: CodeSpan[];
}

function served(run: ActRun, beat: Beat, store: EventStore): ServedExchange {
  const ref = correlationOf(run, beat);
  if (!ref) return { beat, lines: [], spans: [] };
  const { access, mechanism } = eventsFor(store, ref);
  const first = access ? accessLine(access) : null;
  const lines = [...(first ? [first] : []), ...mechanism.map(mechanismLine)];
  const spans = mechanism.map((e) => codeSpanOf(e.data.span)).filter((s): s is CodeSpan => s !== null);
  return { beat, lines, spans };
}

/** Lo que muestra la terminal del banco en el beat `index`. */
export function bankTerminal(run: ActRun, beats: readonly Beat[], index: number, store: EventStore, overview: boolean): BankTerminalView {
  const current = beats[index];
  const servedList = beats
    .slice(0, index + 1)
    .filter((b) => b.kind === "server" && b.ready)
    .map((b) => served(run, b, store));
  const latest = servedList[servedList.length - 1];
  const liveIds = current ? [current.id, current.id.replace(/:res$/, ":srv")] : [];
  const isLive = (s: ServedExchange): boolean => liveIds.includes(s.beat.id);
  const entries: TermEntry[] = servedList
    .filter((s) => s.lines.length > 0)
    .slice(-LOG_ENTRIES_SHOWN)
    .map((s) => ({
      key: s.beat.id,
      origin: exchangeOf(run, s.beat)?.origin ?? "ana",
      lines: s.lines,
      current: isLive(s),
      fresh: s.beat.id === current?.id,
    }));
  const span = latest && latest.spans.length ? latest.spans[latest.spans.length - 1] : null;
  const waiting = current?.kind === "server" && latest !== undefined && isLive(latest) && latest.lines.length === 0;
  return { entries, span, waiting, showCode: !overview && span !== null };
}

/** Título y matemáticas del banco para la tarjeta del beat «servidor». */
export function serverSummary(run: ActRun, beat: Beat, store: EventStore): { titles: string[]; math: string[]; bad: boolean } {
  const ref = correlationOf(run, beat);
  if (!ref) return { titles: [], math: [], bad: false };
  const { mechanism } = eventsFor(store, ref);
  const math = mechanism.flatMap(mathOf);
  const bad = mechanism.some((e) => mechanismLevel(e) !== "INFO");
  return { titles: mechanism.map((e) => e.title).filter(Boolean), math, bad };
}
