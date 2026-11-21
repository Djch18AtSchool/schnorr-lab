/**
 * Fuente simulada: reproduce el guion con exactamente los tipos del contrato. Cada paso
 * ejecutado emite, un instante después (como llegaría por SSE), los eventos del banco con
 * la correlación del paso: los del mecanismo y la línea de acceso.
 */
import { ApiError } from "../../../shared/api";
import type { AccessData, ActRun, ActStepRecord, Actor, BankEvent, Exchange, GroupOption, PhoneConfig } from "../../../shared/types";
import type { ScenarioSource } from "../source";
import { SCRIPTED_ACTS, simulatedActs } from "./acts";
import type { ScriptedAct, ScriptedExchange } from "./script";

const TOY_GROUP: GroupOption = { id: "toy", label: "p = 23 (ejemplo del escrito)", bits: 5, q_bits: 4, security_bits: null };
const BANK_URL = "http://127.0.0.1:8000";
const DEFAULT_EVENT_DELAY_MS = 140;
const RUN_ID_CHARS = 12;

const CLIENTS: Readonly<Record<Actor, Pick<AccessData, "client" | "user_agent" | "device">>> = {
  ana: { client: "192.168.1.23:52344", user_agent: "BancoLab/2.4 (Android 15)", device: "celular de Ana" },
  eve: { client: "192.168.1.66:52391", user_agent: "curl/8.5.0", device: "laptop de Eve" },
  banco: { client: "127.0.0.1:50000", user_agent: "python-httpx", device: "desconocido" },
};

export interface SimulatedOptions {
  eventDelayMs?: number;
  now?: () => number;
  newId?: () => string;
}

function randomId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, RUN_ID_CHARS);
}

function initialRun(script: ScriptedAct, id: string): ActRun {
  return {
    id,
    act: script.info.id,
    title: script.info.title,
    user_id: "ana",
    group: TOY_GROUP.id,
    status: "en_curso",
    next_index: 0,
    cast: script.info.cast,
    steps: script.info.steps.map((info) => ({ ...info, record: null })),
  };
}

function corrFor(runId: string, stepIndex: number, k: number, total: number): string {
  return total > 1 ? `${runId}:${stepIndex + 1}.${k + 1}` : `${runId}:${stepIndex + 1}`;
}

function recordFor(script: ScriptedAct, runId: string, index: number): ActStepRecord {
  const s = script.steps[index];
  const exchanges: Exchange[] = s.exchanges.map((x, k) => ({ ...x.exchange, correlation_id: corrFor(runId, index, k, s.exchanges.length) }));
  return {
    index,
    status: s.status,
    values: s.values,
    math: s.math,
    exchanges,
    terminal: s.terminal,
    intercepted: s.intercepted,
    message: s.message,
    duration_ms: exchanges.reduce((sum, ex) => sum + ex.elapsed_ms, 0),
    correlation_id: `${runId}:${index + 1}`,
  };
}

function eventsFor(scripted: ScriptedExchange, exchange: Exchange, firstId: number, timestamp: number): BankEvent[] {
  const corr = exchange.correlation_id;
  const mechanism = scripted.events.map((e, i): BankEvent => ({
    id: firstId + i, timestamp, source: "banco", kind: e.kind, title: e.title, mechanism: "zkp", correlation_id: corr, data: e.data,
  }));
  const access: AccessData = {
    method: exchange.method, path: exchange.path, status: exchange.status, duration_ms: exchange.elapsed_ms, ...CLIENTS[exchange.origin],
  };
  const accessEvent: BankEvent = {
    id: firstId + mechanism.length, timestamp, source: exchange.origin === "eve" ? "atacante" : "cliente", kind: "acceso",
    title: `${exchange.method} ${exchange.path} ${exchange.status}`, mechanism: "zkp", correlation_id: corr, data: { ...access },
  };
  return [...mechanism, accessEvent];
}

function scriptOf(actId: string): ScriptedAct {
  const script = SCRIPTED_ACTS.find((a) => a.info.id === actId);
  if (!script) throw new ApiError(`El acto «${actId}» no está en la simulación.`, 404);
  return script;
}

function simulatedConfig(): PhoneConfig {
  return {
    bank_url: BANK_URL, docs_url: `${BANK_URL}/docs`, console_url: `${BANK_URL}/consola`,
    mechanisms: [], acts: simulatedActs(), groups: [TOY_GROUP], group: TOY_GROUP.id,
  };
}

/** Ejecuta el siguiente paso del guion: devuelve el run nuevo y el registro del paso. */
export function advanceRun(run: ActRun): { run: ActRun; record: ActStepRecord; script: ScriptedAct } {
  if (run.next_index >= run.steps.length) throw new ApiError("El acto ya terminó.", 409);
  const script = scriptOf(run.act);
  const index = run.next_index;
  const record = recordFor(script, run.id, index);
  const isLast = index === run.steps.length - 1;
  const next: ActRun = {
    ...run,
    next_index: index + 1,
    status: isLast ? script.finalStatus : "en_curso",
    steps: run.steps.map((s, i) => (i === index ? { ...s, record } : s)),
  };
  return { run: next, record, script };
}

/** Canal de eventos del banco simulado: entrega con una demora, como llegaría por SSE. */
function createBus(delay: number): Pick<ScenarioSource, "subscribeBank"> & { emit: (events: BankEvent[]) => void } {
  let listeners: ReadonlyArray<(event: BankEvent) => void> = [];
  return {
    emit(events) {
      const send = (): void => events.forEach((e) => listeners.forEach((l) => l(e)));
      if (delay <= 0) send();
      else setTimeout(send, delay);
    },
    subscribeBank(onEvent, onStatus) {
      listeners = [...listeners, onEvent];
      onStatus?.(true);
      return () => {
        listeners = listeners.filter((l) => l !== onEvent);
      };
    },
  };
}

export function createSimulatedSource(options: SimulatedOptions = {}): ScenarioSource {
  const now = options.now ?? (() => Date.now() / 1000);
  const newId = options.newId ?? randomId;
  const bus = createBus(options.eventDelayMs ?? DEFAULT_EVENT_DELAY_MS);
  let runs: ReadonlyMap<string, ActRun> = new Map();
  let lastEventId = 0;

  function eventsOf(script: ScriptedAct, record: ActStepRecord): BankEvent[] {
    return record.exchanges.flatMap((ex, k) => {
      const batch = eventsFor(script.steps[record.index].exchanges[k], ex, lastEventId + 1, now());
      lastEventId += batch.length;
      return batch;
    });
  }

  return {
    kind: "simulada",
    loadConfig: async () => simulatedConfig(),
    async startAct(act) {
      const run = initialRun(scriptOf(act), newId());
      runs = new Map(runs).set(run.id, run);
      return run;
    },
    async nextStep(runId) {
      const current = runs.get(runId);
      if (!current) throw new ApiError("No existe esa ejecución.", 404);
      const { run, record, script } = advanceRun(current);
      runs = new Map(runs).set(runId, run);
      bus.emit(eventsOf(script, record));
      return run;
    },
    async resetLab(group) {
      if (group !== TOY_GROUP.id) throw new ApiError("La simulación solo tiene el grupo de ejemplo (p = 23).", 400);
      runs = new Map();
      return simulatedConfig();
    },
    subscribeBank: bus.subscribeBank,
  };
}
