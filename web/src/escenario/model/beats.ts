/**
 * Descompone un ActRun en «beats» (tomas de cámara). Función pura: depende solo del run.
 * compute → 1 beat; cada exchange → petición, servidor y respuesta; attack → 1 beat más
 * sus exchanges; narration → 1 beat. El Escenario agrega «Plano general» al inicio, la
 * huella antes de que Ana actúe (si no es el registro), el desenlace y el resumen.
 */
import type { ActRun, Actor, Exchange } from "../../shared/types";
import { headlineField, isRegistration, isSuccess, pathTail, shortKey, verdictOf } from "./format";
import type { Beat } from "./types";

export type RunStep = ActRun["steps"][number];

export interface Decision {
  exchange: Exchange;
  stepIndex: number;
  exchangeIndex: number;
}

export function isRunFinished(run: ActRun, exhausted = false): boolean {
  return exhausted || run.next_index >= run.steps.length;
}

export function exchangesOf(step: RunStep): Exchange[] {
  return step.record?.exchanges ?? [];
}

/** true si Ana hace algo en el acto (un paso suyo o un mensaje que sale de su celular). */
export function anaActs(run: ActRun): boolean {
  return run.steps.some((step) => step.actor === "ana" || exchangesOf(step).some((ex) => ex.origin === "ana"));
}

export function isSignupAct(run: ActRun): boolean {
  return run.act === "registro" || run.steps.some((step) => exchangesOf(step).some(isRegistration));
}

/** Último mensaje con decisión del banco (o el alta de una cuenta). */
export function lastDecision(run: ActRun): Decision | null {
  return run.steps.reduce<Decision | null>((found, step, stepIndex) => {
    const hit = exchangesOf(step).reduce<Decision | null>((acc, exchange, exchangeIndex) => {
      const decisive = verdictOf(exchange) !== null || (isRegistration(exchange) && isSuccess(exchange.status));
      return decisive ? { exchange, stepIndex, exchangeIndex } : acc;
    }, null);
    return hit ?? found;
  }, null);
}

function computeShort(step: RunStep): string {
  const entries = Object.entries(step.record?.values ?? {});
  if (!entries.length) return step.title;
  const [key, value] = entries[entries.length - 1];
  return `${shortKey(key)} = ${value}`;
}

function requestShort(exchange: Exchange | null): string {
  return exchange ? `${exchange.method} ${pathTail(exchange.path)}` : "Mensaje";
}

function responseShort(exchange: Exchange | null): string {
  if (!exchange) return "Respuesta";
  const verdict = verdictOf(exchange);
  if (verdict) return verdict.text;
  return headlineField(exchange.response_body) ?? `${exchange.status}`;
}

function exchangeBeats(stepIndex: number, k: number, exchange: Exchange | null, actor: Actor, ready: boolean): Beat[] {
  const base = { stepIndex, exchangeIndex: k, ready };
  const origin = exchange?.origin ?? actor;
  return [
    { ...base, id: `s${stepIndex}:x${k}:req`, kind: "request", actor: origin, short: requestShort(exchange) },
    { ...base, id: `s${stepIndex}:x${k}:srv`, kind: "server", actor: "banco", short: "Banco atiende" },
    { ...base, id: `s${stepIndex}:x${k}:res`, kind: "response", actor: "banco", short: responseShort(exchange) },
  ];
}

function stepBeats(step: RunStep, stepIndex: number): Beat[] {
  const ready = step.record !== null;
  const single = (kind: Beat["kind"], short: string): Beat => ({
    id: `s${stepIndex}:${kind}`, kind, stepIndex, exchangeIndex: null, actor: step.actor, ready, short,
  });
  const exchanges = exchangesOf(step);
  if (step.kind === "compute") return [single("compute", ready ? computeShort(step) : step.title)];
  if (step.kind === "narration") return [single("narration", step.title)];
  if (step.kind === "attack") {
    return [single("attack", step.title), ...exchanges.flatMap((ex, k) => exchangeBeats(stepIndex, k, ex, step.actor, ready))];
  }
  if (ready && exchanges.length === 0) return [single("compute", step.title)];
  const planned: Array<Exchange | null> = ready ? exchanges : [null];
  return planned.flatMap((ex, k) => exchangeBeats(stepIndex, k, ex, step.actor, ready));
}

function outcomeBeat(run: ActRun): Beat | null {
  const decision = lastDecision(run);
  if (!decision) return null;
  const verdict = verdictOf(decision.exchange);
  const origin = decision.exchange.origin;
  const short = verdict === null ? "Cuenta creada" : verdict.ok ? (origin === "ana" ? "Entra" : "Lo logra") : "Rechazo";
  return { id: "outcome", kind: "outcome", stepIndex: null, exchangeIndex: null, actor: origin, ready: true, short };
}

export function buildBeats(run: ActRun, exhausted = false): Beat[] {
  const finished = isRunFinished(run, exhausted);
  const firstAna = isSignupAct(run) || !anaActs(run) ? -1 : run.steps.findIndex((step) => step.actor === "ana" || exchangesOf(step).some((ex) => ex.origin === "ana"));
  const intro: Beat = { id: "intro", kind: "intro", stepIndex: null, exchangeIndex: null, actor: "banco", ready: true, short: "Plano general" };
  const biometric: Beat = { id: "bio", kind: "biometric", stepIndex: null, exchangeIndex: null, actor: "ana", ready: true, short: "Huella" };
  const body = run.steps.flatMap((step, i) => {
    if (finished && step.record === null) return [];
    const lead = i === firstAna ? [biometric] : [];
    return [...lead, ...stepBeats(step, i)];
  });
  const summary: Beat = { id: "summary", kind: "summary", stepIndex: null, exchangeIndex: null, actor: "banco", ready: finished, short: "Resumen" };
  const outcome = finished ? outcomeBeat(run) : plannedOutcome(run);
  return [intro, ...body, ...(outcome ? [outcome] : []), summary];
}

/** Antes de terminar se reserva el desenlace si el acto envía mensajes (para que la cuenta de pasos no salte). */
function plannedOutcome(run: ActRun): Beat | null {
  const sends = run.steps.some((step) => step.kind === "exchange" || step.kind === "attack");
  if (!sends) return null;
  const actor = run.steps[run.steps.length - 1]?.actor ?? "ana";
  return { id: "outcome", kind: "outcome", stepIndex: null, exchangeIndex: null, actor, ready: false, short: "Desenlace" };
}

export type Advance = { kind: "goto"; index: number } | { kind: "fetch" } | { kind: "end" };

/** Qué hacer al presionar →: ir al siguiente beat, pedir un paso más al backend o terminar. */
export function advanceFrom(beats: readonly Beat[], index: number): Advance {
  if (index >= beats.length - 1) return { kind: "end" };
  return beats[index + 1].ready ? { kind: "goto", index: index + 1 } : { kind: "fetch" };
}

/** Exchange del beat (si tiene). */
export function exchangeOf(run: ActRun, beat: Beat): Exchange | null {
  if (beat.stepIndex === null || beat.exchangeIndex === null) return null;
  return exchangesOf(run.steps[beat.stepIndex])[beat.exchangeIndex] ?? null;
}

export function stepOf(run: ActRun, beat: Beat): RunStep | null {
  return beat.stepIndex === null ? null : run.steps[beat.stepIndex] ?? null;
}
