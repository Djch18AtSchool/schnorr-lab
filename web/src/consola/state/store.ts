/** Estado de la Consola: una instantánea inmutable que solo cambia a través del reductor. */
import type { Account, Alert, AuditEntry, BankEvent, BankMechanism, RequestRecord, TelemetrySummary, TestReport } from "../../shared/types";
import type { ApiRoutes, LabResults } from "../data/source";
import { mergeById } from "../lib/requests";

export type Resource = "summary" | "requests" | "alerts" | "accounts" | "audit" | "mechanisms" | "tests" | "results" | "events" | "routes";

export interface ConsoleState {
  summary: TelemetrySummary | null;
  requests: readonly RequestRecord[];
  alerts: readonly Alert[];
  accounts: readonly Account[] | null;
  audit: readonly AuditEntry[] | null;
  mechanisms: readonly BankMechanism[] | null;
  tests: TestReport | null;
  results: LabResults | null;
  events: readonly BankEvent[];
  routes: ApiRoutes | null;
  errors: Readonly<Partial<Record<Resource, string>>>;
  online: boolean;
  loaded: boolean;
}

export const MAX_REQUESTS = 1500;
export const MAX_EVENTS = 3000;

export const INITIAL_STATE: ConsoleState = {
  summary: null, requests: [], alerts: [], accounts: null, audit: null, mechanisms: null, tests: null, results: null,
  events: [], routes: null, errors: {}, online: false, loaded: false,
};

export type Action =
  | { type: "loaded"; patch: Partial<ConsoleState> }
  | { type: "set"; patch: Partial<ConsoleState> }
  | { type: "requests"; fresh: readonly RequestRecord[] }
  | { type: "events"; fresh: readonly BankEvent[] }
  | { type: "alert"; alert: Alert }
  | { type: "error"; resource: Resource; message: string }
  | { type: "ok"; resource: Resource }
  | { type: "online"; online: boolean }
  | { type: "reset" };

function withoutError(errors: ConsoleState["errors"], resource: Resource): ConsoleState["errors"] {
  if (!(resource in errors)) return errors;
  return Object.fromEntries(Object.entries(errors).filter(([key]) => key !== resource));
}

export function reducer(state: ConsoleState, action: Action): ConsoleState {
  switch (action.type) {
    case "loaded": return { ...state, ...action.patch, loaded: true };
    case "set": return { ...state, ...action.patch };
    case "requests": {
      const requests = mergeById(state.requests, action.fresh, MAX_REQUESTS);
      return requests === state.requests ? state : { ...state, requests };
    }
    case "events": {
      const events = mergeById(state.events, action.fresh, MAX_EVENTS);
      return events === state.events ? state : { ...state, events };
    }
    case "alert":
      return state.alerts.some((a) => a.id === action.alert.id) ? state : { ...state, alerts: [...state.alerts, action.alert] };
    case "error": return { ...state, errors: { ...state.errors, [action.resource]: action.message } };
    case "ok": {
      const errors = withoutError(state.errors, action.resource);
      return errors === state.errors ? state : { ...state, errors };
    }
    case "online": return state.online === action.online ? state : { ...state, online: action.online };
    case "reset": return INITIAL_STATE;
  }
}

/** El arranque falló si no hay ni resumen ni peticiones: la telemetría del banco no responde. */
export function bootFailure(state: ConsoleState): string | null {
  if (!state.loaded || state.summary || state.requests.length) return null;
  return state.errors.summary ?? state.errors.requests ?? null;
}
