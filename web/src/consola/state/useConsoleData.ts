/**
 * Carga inicial, flujo en vivo y refrescos periódicos de la Consola. Los eventos «acceso» traen
 * las peticiones nuevas; «alerta» agrega la alerta; las decisiones del mecanismo refrescan cuentas
 * y auditoría. El resumen se vuelve a pedir cada pocos segundos.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { BankEvent } from "../../shared/types";
import { SUMMARY_WINDOW_S, type ConsoleDataSource } from "../data/source";
import { alertFromEvent } from "../lib/alerts";
import { INITIAL_STATE, MAX_EVENTS, MAX_REQUESTS, reducer, type Action, type ConsoleState, type Resource } from "./store";

const SUMMARY_EVERY_MS = 5000;
const ALERTS_EVERY_MS = 15000;
const REQUESTS_DEBOUNCE_MS = 250;
const ACCOUNTS_DEBOUNCE_MS = 800;
const MECHANISM_KINDS = new Set(["registro", "paso", "verificacion", "error"]);

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

type Dispatch = (action: Action) => void;

/** Pide un recurso y lo deja en el estado; si falla, anota el error para que la vista lo muestre. */
async function load<T>(dispatch: Dispatch, resource: Resource, fetcher: () => Promise<T>, apply: (value: T) => Action): Promise<void> {
  try {
    const value = await fetcher();
    dispatch(apply(value));
    dispatch({ type: "ok", resource });
  } catch (error: unknown) {
    dispatch({ type: "error", resource, message: message(error) });
  }
}

async function initialLoad(source: ConsoleDataSource): Promise<{ patch: Partial<ConsoleState>; errors: ConsoleState["errors"] }> {
  const tasks = {
    summary: source.summary(SUMMARY_WINDOW_S), requests: source.requests(0, MAX_REQUESTS), alerts: source.alerts(),
    accounts: source.accounts(), audit: source.audit(), mechanisms: source.mechanisms(), tests: source.tests(),
    results: source.results(), events: source.events(0), routes: source.routes(),
  };
  const keys = Object.keys(tasks) as Resource[];
  const settled = await Promise.allSettled(Object.values(tasks));
  const patch = Object.fromEntries(keys.flatMap((key, i) => {
    const r = settled[i];
    if (r.status !== "fulfilled") return [];
    const value = key === "events" ? (r.value as BankEvent[]).slice(-MAX_EVENTS) : r.value;
    return [[key, value]];
  })) as Partial<ConsoleState>;
  const errors = Object.fromEntries(keys.flatMap((key, i) => {
    const r = settled[i];
    return r.status === "rejected" ? [[key, message(r.reason)]] : [];
  }));
  return { patch, errors };
}

function debounce(run: () => void, ms: number): { call: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    call: () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; run(); }, ms);
    },
    cancel: () => { if (timer) clearTimeout(timer); },
  };
}

function useLiveData(source: ConsoleDataSource): [ConsoleState, () => Promise<void>] {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const lastRequest = useRef(0);
  useEffect(() => {
    lastRequest.current = state.requests[state.requests.length - 1]?.id ?? 0;
  }, [state.requests]);

  useEffect(() => {
    let alive = true;
    const safe: Dispatch = (action) => { if (alive) dispatch(action); };
    dispatch({ type: "reset" });
    const fetchRequests = debounce(() => void load(safe, "requests", () => source.requests(lastRequest.current, MAX_REQUESTS), (fresh) => ({ type: "requests", fresh })), REQUESTS_DEBOUNCE_MS);
    const fetchAccounts = debounce(() => {
      void load(safe, "accounts", () => source.accounts(), (accounts) => ({ type: "set", patch: { accounts } }));
      void load(safe, "audit", () => source.audit(), (audit) => ({ type: "set", patch: { audit } }));
    }, ACCOUNTS_DEBOUNCE_MS);
    const onEvent = (event: BankEvent): void => {
      safe({ type: "events", fresh: [event] });
      safe({ type: "online", online: true }); // un evento que llega prueba que el flujo está abierto
      if (event.kind === "acceso") fetchRequests.call();
      if (MECHANISM_KINDS.has(event.kind)) fetchAccounts.call();
      const alert = alertFromEvent(event);
      if (alert) safe({ type: "alert", alert });
    };
    let stop = (): void => undefined;
    void initialLoad(source).then(({ patch, errors }) => {
      if (!alive) return;
      dispatch({ type: "loaded", patch: { ...patch, errors } });
      stop = source.stream(onEvent, (online) => safe({ type: "online", online }));
    });
    const summaryTimer = setInterval(() => {
      void load(safe, "summary", () => source.summary(SUMMARY_WINDOW_S), (summary) => ({ type: "set", patch: { summary } }));
      fetchAccounts.call();
    }, SUMMARY_EVERY_MS);
    const alertsTimer = setInterval(() => void load(safe, "alerts", () => source.alerts(), (alerts) => ({ type: "set", patch: { alerts } })), ALERTS_EVERY_MS);
    return () => {
      alive = false;
      stop();
      fetchRequests.cancel();
      fetchAccounts.cancel();
      clearInterval(summaryTimer);
      clearInterval(alertsTimer);
    };
  }, [source]);

  const reset = useCallback(async () => {
    await source.reset();
    await load(dispatch, "accounts", () => source.accounts(), (accounts) => ({ type: "set", patch: { accounts } }));
  }, [source]);
  return [state, reset];
}

export interface ConsoleData {
  state: ConsoleState;
  live: boolean;
  setLive: (live: boolean) => void;
  pending: number;
  reset: () => Promise<void>;
}

/** Datos en vivo con pausa: en pausa la vista se congela y se cuentan las peticiones nuevas. */
export function useConsoleData(source: ConsoleDataSource): ConsoleData {
  const [liveState, reset] = useLiveData(source);
  const [live, setLiveFlag] = useState(true);
  const [frozen, setFrozen] = useState<ConsoleState | null>(null);
  const setLive = useCallback((next: boolean) => {
    setLiveFlag(next);
    setFrozen(next ? null : liveState);
  }, [liveState]);
  const shown = live || !frozen ? liveState : frozen;
  const pending = useMemo(() => {
    if (live || !frozen) return 0;
    const lastId = frozen.requests[frozen.requests.length - 1]?.id ?? 0;
    return liveState.requests.filter((r) => r.id > lastId).length;
  }, [live, frozen, liveState.requests]);
  return { state: shown, live, setLive, pending, reset };
}
