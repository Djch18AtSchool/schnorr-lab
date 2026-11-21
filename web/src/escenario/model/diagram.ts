/**
 * Diagrama de secuencia: cada beat revela a lo sumo una fila (cálculo en un carril, mensaje
 * entre carriles o actividad del banco). Las fases son los pasos del backend que dibujan
 * filas; las anteriores se compactan y se pueden revisar.
 */
import type { ActRun, Actor } from "../../shared/types";
import { exchangeOf, exchangesOf, type RunStep } from "./beats";
import { correlationOf, eventsFor, type EventStore } from "./events";
import { eveOnStage } from "./eveTerminal";
import { headlineField, keyValues, pathTail, shortKey, truncate, verdictOf } from "./format";
import type { Beat, DiagramRow, DiagramView, Lane, PhaseView } from "./types";

const MAX_SRV_CHARS = 34;
const MAX_FACTS = 2;

export function laneOf(actor: Actor): Lane {
  return actor === "banco" ? "bank" : actor;
}

/** Paso que dibuja filas (los cálculos del banco y las narraciones no dibujan). */
export function drawsRows(step: RunStep): boolean {
  if (step.kind === "narration") return false;
  return step.kind !== "compute" || step.actor !== "banco";
}

function factsOf(step: RunStep): string {
  const entries = Object.entries(step.record?.values ?? {}).slice(-MAX_FACTS);
  return entries.map(([k, v]) => `${shortKey(k)} = ${truncate(v, 14)}`).join(", ");
}

function localRow(beat: Beat, step: RunStep): DiagramRow | null {
  if (step.actor === "banco") return null;
  const at = step.actor;
  const fact = factsOf(step);
  if (beat.kind === "attack") {
    return { type: "local", id: beat.id, at: "eve", icon: "rec", label: step.title, fact, short: step.title };
  }
  const label = at === "ana" ? "Chip seguro" : "Laptop";
  return { type: "local", id: beat.id, at, icon: at === "ana" ? "chip" : "rec", label, fact: fact || step.title, short: fact || step.title };
}

function isCopy(run: ActRun, beat: Beat): boolean {
  const exchange = exchangeOf(run, beat);
  if (!exchange || exchange.origin !== "eve" || beat.stepIndex === null) return false;
  const body = JSON.stringify(exchange.request_body);
  return run.steps.slice(0, beat.stepIndex).some(
    (s) => s.record?.intercepted === true && exchangesOf(s).some((ex) => ex.origin === "ana" && JSON.stringify(ex.request_body) === body),
  );
}

function messageRow(run: ActRun, beat: Beat, hasEve: boolean): DiagramRow | null {
  const exchange = exchangeOf(run, beat);
  const step = beat.stepIndex === null ? null : run.steps[beat.stepIndex];
  if (!exchange || !step) return null;
  const origin = laneOf(exchange.origin);
  const tap = hasEve && step.record?.intercepted === true && exchange.origin !== "eve";
  if (beat.kind === "request") {
    const headline = headlineField(exchange.request_body);
    const body = exchange.request_body === null || exchange.request_body === undefined ? null : keyValues(exchange.request_body);
    return {
      type: "msg", id: beat.id, from: origin, to: "bank", lead: exchange.method, label: exchange.path,
      short: `${pathTail(exchange.path)}${headline ? `  ${headline}` : ""}`, body, verdict: null, tap, copied: tap,
      tag: isCopy(run, beat) ? "copia" : null,
    };
  }
  const verdict = verdictOf(exchange);
  const body = keyValues(exchange.response_body, verdict ? ["reason", "details"] : ["details"]);
  return {
    type: "msg", id: beat.id, from: "bank", to: origin, lead: String(exchange.status), label: verdict?.text ?? "OK",
    short: verdict?.text ?? headlineField(exchange.response_body) ?? "OK", body, verdict, tap, copied: false, tag: null,
  };
}

function serverRow(run: ActRun, beat: Beat, store: EventStore): DiagramRow | null {
  const exchange = exchangeOf(run, beat);
  if (!exchange) return null;
  const ref = correlationOf(run, beat);
  const mechanism = ref ? eventsFor(store, ref).mechanism : [];
  const title = mechanism.length ? mechanism[mechanism.length - 1].title : "";
  const verdict = verdictOf(exchange);
  const bad = exchange.status >= 400 || verdict?.ok === false;
  return { type: "srv", id: beat.id, bad, short: truncate(title || `responde ${exchange.status}`, MAX_SRV_CHARS) };
}

export function rowOfBeat(run: ActRun, beat: Beat, store: EventStore, hasEve: boolean): DiagramRow | null {
  if (!beat.ready || beat.stepIndex === null) return null;
  const step = run.steps[beat.stepIndex];
  if (beat.kind === "compute" || beat.kind === "attack") return localRow(beat, step);
  if (beat.kind === "request" || beat.kind === "response") return messageRow(run, beat, hasEve);
  if (beat.kind === "server") return serverRow(run, beat, store);
  return null;
}

/** Número de fase de cada paso (1, 2, …) entre los pasos que dibujan filas. */
export function phaseNumbers(run: ActRun): Map<number, number> {
  const drawing = run.steps.map((s, i) => [i, drawsRows(s)] as const).filter(([, draws]) => draws);
  return new Map(drawing.map(([i], k) => [i, k + 1]));
}

export interface DiagramOptions {
  review: number | null;
  wide: boolean;
  animate: boolean;
  decisionStep: number | null;
}

function openStep(beat: Beat | undefined, opts: DiagramOptions): number | null {
  if (opts.review !== null) return opts.review;
  if (!beat || opts.wide || beat.kind === "summary" || beat.kind === "intro") return null;
  if (beat.kind === "outcome") return opts.decisionStep;
  return beat.stepIndex;
}

export function buildDiagram(run: ActRun, beats: readonly Beat[], index: number, store: EventStore, opts: DiagramOptions): DiagramView {
  const hasEve = eveOnStage(run);
  const current = beats[index];
  const numbers = phaseNumbers(run);
  const open = openStep(current, opts);
  const overview = opts.wide || current?.kind === "intro" || current?.kind === "summary";
  const revealed = beats.slice(0, index + 1).flatMap((beat) => {
    const row = rowOfBeat(run, beat, store, hasEve);
    return row && beat.stepIndex !== null ? [{ beat, row, stepIndex: beat.stepIndex }] : [];
  });
  const stepIds = [...new Set(revealed.map((r) => r.stepIndex))];
  const reviewN = opts.review === null ? null : numbers.get(opts.review) ?? null;
  const phases: PhaseView[] = stepIds.map((stepIndex) => {
    const n = numbers.get(stepIndex) ?? 0;
    return {
      n,
      stepIndex,
      title: run.steps[stepIndex].title,
      compact: stepIndex !== open,
      later: reviewN !== null && n > reviewN,
      rows: revealed
        .filter((r) => r.stepIndex === stepIndex)
        .map(({ beat, row }) => {
          const isCurrent = beat.id === current?.id;
          return {
            row,
            dim: opts.review !== null ? stepIndex !== opts.review : !isCurrent && !overview,
            now: opts.wide && opts.review === null && isCurrent,
            fresh: isCurrent && opts.animate,
          };
        }),
    };
  });
  return { hasEve, phases, showEmpty: phases.length === 0 && overview };
}
