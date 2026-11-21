/**
 * Formato del guion simulado: cada acto declara sus pasos con lo que devolvería el backend
 * (values, math, terminal, exchanges) y los eventos del mecanismo que emitiría el banco.
 */
import type {
  ActInfo,
  ActStepInfo,
  Actor,
  CastMember,
  Exchange,
  MechanismEventData,
  RunStatus,
  StepStatus,
  TerminalLine,
} from "../../../shared/types";

export interface ScriptedEvent {
  kind: "registro" | "paso" | "verificacion" | "error";
  title: string;
  data: MechanismEventData;
}

export interface ScriptedExchange {
  exchange: Omit<Exchange, "correlation_id">;
  events: ScriptedEvent[];
}

export interface ScriptedStep {
  info: ActStepInfo;
  status: StepStatus;
  values: Record<string, string>;
  math: string[];
  terminal: TerminalLine[];
  intercepted: boolean;
  message: string;
  exchanges: ScriptedExchange[];
}

export interface ScriptedAct {
  info: ActInfo;
  steps: ScriptedStep[];
  finalStatus: RunStatus;
}

export const LOGGER = "banco.zkp";

type StepInput = Partial<Omit<ScriptedStep, "info">> & {
  id: string;
  actor: Actor;
  kind: ActStepInfo["kind"];
  title: string;
  explanation: string;
  formula?: string;
};

export function step(input: StepInput): ScriptedStep {
  const { id, actor, kind, title, explanation, formula = "", ...rest } = input;
  return {
    info: { id, actor, kind, title, explanation, formula },
    status: rest.status ?? "ok",
    values: rest.values ?? {},
    math: rest.math ?? [],
    terminal: rest.terminal ?? [],
    intercepted: rest.intercepted ?? false,
    message: rest.message ?? "",
    exchanges: rest.exchanges ?? [],
  };
}

interface ExchangeInput {
  method: "GET" | "POST";
  path: string;
  status: number;
  request?: unknown;
  response: unknown;
  ms: number;
  origin?: Actor;
  events: ScriptedEvent[];
}

export function exchange(input: ExchangeInput): ScriptedExchange {
  return {
    exchange: {
      method: input.method,
      path: input.path,
      status: input.status,
      request_body: input.request ?? null,
      response_body: input.response,
      elapsed_ms: input.ms,
      origin: input.origin ?? "ana",
    },
    events: input.events,
  };
}

export function mechanismEvent(kind: ScriptedEvent["kind"], title: string, data: MechanismEventData): ScriptedEvent {
  return { kind, title, data: { logger: LOGGER, ...data } };
}

interface ActInput {
  id: string;
  title: string;
  summary: string;
  cast: CastMember[];
  steps: ScriptedStep[];
  finalStatus: RunStatus;
}

export function act(input: ActInput): ScriptedAct {
  return {
    info: {
      id: input.id,
      title: input.title,
      summary: input.summary,
      cast: input.cast,
      mechanism: "zkp",
      available: true,
      steps: input.steps.map((s) => s.info),
    },
    steps: input.steps,
    finalStatus: input.finalStatus,
  };
}
