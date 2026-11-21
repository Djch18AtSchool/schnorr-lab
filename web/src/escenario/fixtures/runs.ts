/**
 * Fixtures de prueba: ejecuta un acto del guion simulado paso a paso (sin demoras y con ids
 * fijos) y guarda cada ActRun intermedio y los eventos del banco que emitió.
 */
import type { ActRun, BankEvent, Exchange } from "../../shared/types";
import { createSimulatedSource } from "../data/simulated/simulatedSource";
import { addEvents, EMPTY_STORE, type EventStore } from "../model/events";

export interface PlayedAct {
  /** runs[0] es el acto recién creado; runs[k] tiene k pasos ejecutados. */
  runs: ActRun[];
  final: ActRun;
  events: BankEvent[];
  store: EventStore;
}

export async function playAct(actId: string): Promise<PlayedAct> {
  const source = createSimulatedSource({ eventDelayMs: 0, now: () => 1_795_222_446, newId: () => "c6ef288ecbe1" });
  const events: BankEvent[] = [];
  const stop = source.subscribeBank((e) => events.push(e));
  const first = await source.startAct(actId);
  const runs = [first];
  for (let i = 0; i < first.steps.length; i += 1) {
    runs.push(await source.nextStep(first.id));
  }
  stop();
  return { runs, final: runs[runs.length - 1], events, store: addEvents(EMPTY_STORE, events) };
}

export function exchangeFixture(overrides: Partial<Exchange> = {}): Exchange {
  return {
    method: "POST",
    path: "/zkp/login/respond",
    status: 200,
    request_body: { session_id: "abc", s: "4" },
    response_body: { accepted: true, reason: "Acceso concedido", attempts_left: 3 },
    elapsed_ms: 1.5,
    correlation_id: "run:1",
    origin: "ana",
    ...overrides,
  };
}

export function bankEvent(overrides: Partial<BankEvent> & Pick<BankEvent, "id" | "kind">): BankEvent {
  return {
    timestamp: 1_795_222_446,
    source: "banco",
    title: "evento",
    mechanism: "zkp",
    correlation_id: "run:1",
    request_id: null,
    data: {},
    ...overrides,
  };
}
