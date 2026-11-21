/** Consola del banco: barra superior, navegación lateral y la sección activa. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Alert } from "../shared/types";
import { SideNav } from "./components/SideNav";
import { SourceNotice } from "./components/SourceNotice";
import { Toasts } from "./components/Toasts";
import { TipProvider } from "./components/Tooltip";
import { TopBar } from "./components/TopBar";
import type { ConsoleDataSource } from "./data/source";
import { groupOf } from "./lib/group";
import { userIndex, type TrafficQuery } from "./lib/requests";
import { useHashRoute, useNow, useTheme } from "./state/hooks";
import { SECTIONS, sectionByKey, type Section } from "./state/sections";
import { bootFailure } from "./state/store";
import { useAlertsUi } from "./state/useAlertsUi";
import { useConsoleData } from "./state/useConsoleData";
import { Api } from "./views/Api";
import { Auditoria } from "./views/Auditoria";
import { Configuracion } from "./views/Configuracion";
import { Laboratorio } from "./views/laboratorio/Laboratorio";
import { Logs } from "./views/Logs";
import { Resumen } from "./views/resumen/Resumen";
import { Trafico } from "./views/trafico/Trafico";
import { Usuarios } from "./views/Usuarios";

const EMPTY_QUERY: TrafficQuery = { filter: "all", search: "" };

interface KeyActions {
  go: (section: Section) => void;
  toggleLive: () => void;
  toggleTheme: () => void;
  focusSearch: () => boolean;
}

function useKeyboard(actions: KeyActions): void {
  const ref = useRef(actions);
  useEffect(() => { ref.current = actions; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) {
        if (e.key === "Escape") target?.blur();
        return;
      }
      const section = sectionByKey(e.key);
      if (section) ref.current.go(section);
      else if (e.key === "p" || e.key === "P") ref.current.toggleLive();
      else if (e.key === "t" || e.key === "T") ref.current.toggleTheme();
      else if (e.key === "/" && ref.current.focusSearch()) e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}

export function App({ source }: { source: ConsoleDataSource }) {
  const { state, live, setLive, pending, reset } = useConsoleData(source);
  const [section, go] = useHashRoute();
  const toggleTheme = useTheme();
  const now = useNow();
  const ui = useAlertsUi(state.alerts, state.loaded, section === "resumen");
  const [query, setQuery] = useState<TrafficQuery>(EMPTY_QUERY);
  const [selected, setSelected] = useState<number | null>(null);
  const trafficSearch = useRef<HTMLInputElement>(null);
  const logSearch = useRef<HTMLInputElement>(null);
  const main = useRef<HTMLElement>(null);
  const simulated = source.kind === "simulada";

  const requestsById = useMemo(() => new Map(state.requests.map((r) => [r.id, r])), [state.requests]);
  const users = useMemo(() => userIndex(state.requests), [state.requests]);
  const group = useMemo(() => groupOf(state.mechanisms ?? []), [state.mechanisms]);

  const navigate = useCallback((next: Section) => {
    go(next);
    if (main.current) main.current.scrollTop = 0;
  }, [go]);
  const openRequest = useCallback((id: number) => {
    setQuery(EMPTY_QUERY);
    setSelected(id);
    navigate("trafico");
    requestAnimationFrame(() => document.querySelector(`tr[data-id="${id}"]`)?.scrollIntoView({ block: "center" }));
  }, [navigate]);
  const openAlert = useCallback((alert: Alert) => {
    ui.dismissToast(alert.id);
    ui.showAlert(alert.id);
    navigate("resumen");
  }, [ui, navigate]);
  const showUserTraffic = useCallback((user: string) => {
    setQuery({ filter: "all", search: user });
    setSelected(null);
    navigate("trafico");
  }, [navigate]);

  useKeyboard({
    go: navigate,
    toggleLive: () => setLive(!live),
    toggleTheme,
    focusSearch: () => {
      const field = section === "trafico" ? trafficSearch.current : section === "logs" ? logSearch.current : null;
      field?.focus();
      return Boolean(field);
    },
  });
  useEffect(() => {
    document.title = `${SECTIONS.find((s) => s.id === section)?.title ?? "Resumen"} · Consola del banco`;
  }, [section]);

  const failure = bootFailure(state);
  return (
    <TipProvider>
      <div className="app">
        <TopBar online={state.online} startedAt={state.summary?.started_at ?? null} now={now} live={live} pending={pending}
          onToggleLive={() => setLive(!live)} onToggleTheme={toggleTheme} simulated={simulated} />
        <SideNav current={section} onGo={navigate} unseenAlerts={ui.unseen} group={group} simulated={simulated} />
        <main ref={main}>
          <section className="view" aria-label={SECTIONS.find((s) => s.id === section)?.title}>
            {failure && !simulated ? <SourceNotice error={failure} /> : null}
            {!state.loaded ? <div className="loading muted">Conectando con el banco…</div> : null}
            {state.loaded && section === "resumen" ? <Resumen state={state} now={now} requestsById={requestsById} openAlert={ui.openAlert}
              freshAlerts={ui.fresh} onToggleAlert={ui.toggleAlert} onOpenRequest={openRequest} /> : null}
            {state.loaded && section === "trafico" ? <Trafico state={state} now={now} users={users} group={group} query={query} onQuery={setQuery}
              selected={selected} onSelect={setSelected} searchRef={trafficSearch} /> : null}
            {state.loaded && section === "logs" ? <Logs events={state.events} startedAt={state.summary?.started_at ?? null} searchRef={logSearch} /> : null}
            {state.loaded && section === "usuarios" ? <Usuarios accounts={state.accounts} error={state.errors.accounts} requests={state.requests} users={users}
              maxAttempts={group?.maxAttempts ?? 3} now={now} onTraffic={showUserTraffic} /> : null}
            {state.loaded && section === "auditoria" ? <Auditoria entries={state.audit} error={state.errors.audit} requests={state.requests} onOpenRequest={openRequest} /> : null}
            {state.loaded && section === "laboratorio" ? <Laboratorio results={state.results} resultsError={state.errors.results} tests={state.tests} testsError={state.errors.tests} /> : null}
            {state.loaded && section === "api" ? <Api routes={state.routes} stats={state.summary?.routes ?? []} requests={state.requests} now={now} simulated={simulated} /> : null}
            {state.loaded && section === "configuracion" ? <Configuracion group={group} mechanisms={state.mechanisms} mechanismsError={state.errors.mechanisms}
              results={state.results} onReset={reset} /> : null}
          </section>
        </main>
      </div>
      <Toasts alerts={ui.toasts} onOpen={openAlert} onDismiss={ui.dismissToast} />
    </TipProvider>
  );
}
