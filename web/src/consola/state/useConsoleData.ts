/**
 * Carga inicial, flujo en vivo y refrescos de la Consola. Cada evento «acceso» trae peticiones
 * nuevas; «alerta» agrega la alerta; las decisiones del mecanismo (y las de soporte) refrescan
 * cuentas y auditoría. Un sondeo lento cubre lo que el flujo pierda si se corta.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { BankEvent } from "../../shared/types";
import type { ConsoleDataSource } from "../data/source";
import { alertFromEvent } from "../lib/alerts";
import { INITIAL_STATE, MAX_REQUESTS, reducer, type Action, type ConsoleState, type Resource } from "./store";

const POLL_MS = 10_000;
const REQUESTS_DEBOUNCE_MS = 200;
const ACCOUNTS_DEBOUNCE_MS = 600;
const ACCOUNT_KINDS = new Set(["registro", "paso", "verificacion", "error", "log"]);

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

type Dispatch = (action: Action) => void;

/** Pide un recurso y lo deja en el estado; si falla, anota el error para que la vista lo muestre. */
async function load<T>(dispatch: Dispatch, resource: Resource, fetcher: () => Promise<T>, apply: (value: T) => Action): Promise<void> {
  try {
    dispatch(apply(await fetcher()));
    dispatch({ type: "ok", resource });
  } catch (error: unknown) {
    dispatch({ type: "error", resource, message: message(error) });
  }
}

async function initialLoad(source: ConsoleDataSource): Promise<Partial<ConsoleState>> {
  const tasks = {
    requests: source.requests(0, MAX_REQUESTS), alerts: source.alerts(), accounts: source.accounts(), audit: source.audit(),
    mechanisms: source.mechanisms(), tests: source.tests(), results: source.results(), routes: source.routes(),
  };
  const keys = Object.keys(tasks) as Resource[];
  const settled = await Promise.allSettled(Object.values(tasks));
  const patch = Object.fromEntries(keys.flatMap((key, i) => {
    const r = settled[i];
    return r.status === "fulfilled" ? [[key, r.value]] : [];
  })) as Partial<ConsoleState>;
  const errors = Object.fromEntries(keys.flatMap((key, i) => {
    const r = settled[i];
    return r.status === "rejected" ? [[key, message(r.reason)]] : [];
  }));
  return { ...patch, errors };
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

function useLiveData(source: ConsoleDataSource): ConsoleState {
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
      safe({ type: "online", online: true });
      if (event.kind === "acceso") fetchRequests.call();
      if (ACCOUNT_KINDS.has(event.kind)) fetchAccounts.call();
      const alert = alertFromEvent(event);
      if (alert) safe({ type: "alert", alert });
    };
    let stop = (): void => undefined;
    void initialLoad(source).then((patch) => {
      if (!alive) return;
      dispatch({ type: "loaded", patch });
      stop = source.stream(onEvent, (online) => safe({ type: "online", online }));
    });
    const poll = setInterval(() => {
      fetchRequests.call();
      fetchAccounts.call();
      void load(safe, "alerts", () => source.alerts(), (alerts) => ({ type: "set", patch: { alerts } }));
    }, POLL_MS);
    return () => {
      alive = false;
      stop();
      fetchRequests.cancel();
      fetchAccounts.cancel();
      clearInterval(poll);
    };
  }, [source]);
  return state;
}

export interface ConsoleData {
  state: ConsoleState;
  live: boolean;
  setLive: (live: boolean) => void;
  /** Peticiones que llegaron mientras la vista estaba en pausa. */
  pending: number;
  /** Estado de la conexión en este momento (aunque la vista esté en pausa). */
  online: boolean;
}

/** Datos en vivo con pausa: en pausa la vista se congela y se cuentan las peticiones nuevas. */
export function useConsoleData(source: ConsoleDataSource): ConsoleData {
  const liveState = useLiveData(source);
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
  return { state: shown, live, setLive, pending, online: liveState.online };
}
