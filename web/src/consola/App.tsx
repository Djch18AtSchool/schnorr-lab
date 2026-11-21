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
import { useAlertsUi, type AlertsUi } from "./state/useAlertsUi";
import { useConsoleData } from "./state/useConsoleData";
import { SectionView } from "./views/SectionView";

const EMPTY_QUERY: TrafficQuery = { filter: "all", search: "" };

interface KeyActions {
  go: (section: Section) => void;
  toggleLive: () => void;
  toggleTheme: () => void;
  focusSearch: () => boolean;
}

/** Atajos: 1–9 secciones, P pausa, T tema, / buscar, Escape sale de un campo. */
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

/** Navegación entre secciones y los saltos cruzados (evidencia → Tráfico, usuario → su tráfico). */
function useNavigation(go: (section: Section) => void, ui: AlertsUi) {
  const [query, setQuery] = useState<TrafficQuery>(EMPTY_QUERY);
  const [selected, setSelected] = useState<number | null>(null);
  const main = useRef<HTMLElement>(null);
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
  return { main, query, setQuery, selected, setSelected, navigate, openRequest, openAlert, showUserTraffic };
}

export function App({ source }: { source: ConsoleDataSource }) {
  const { state, live, setLive, pending, reset } = useConsoleData(source);
  const [section, go] = useHashRoute();
  const toggleTheme = useTheme();
  const now = useNow();
  const ui = useAlertsUi(state.alerts, state.loaded, section === "resumen");
  const nav = useNavigation(go, ui);
  const trafficSearch = useRef<HTMLInputElement>(null);
  const logSearch = useRef<HTMLInputElement>(null);
  const simulated = source.kind === "simulada";
  const requestsById = useMemo(() => new Map(state.requests.map((r) => [r.id, r])), [state.requests]);
  const users = useMemo(() => userIndex(state.requests), [state.requests]);
  const group = useMemo(() => groupOf(state.mechanisms ?? []), [state.mechanisms]);
  const title = SECTIONS.find((s) => s.id === section)?.title ?? "Resumen";
  useEffect(() => { document.title = `${title} · Consola del banco`; }, [title]);
  useKeyboard({
    go: nav.navigate, toggleLive: () => setLive(!live), toggleTheme,
    focusSearch: () => {
      const field = section === "trafico" ? trafficSearch.current : section === "logs" ? logSearch.current : null;
      field?.focus();
      return Boolean(field);
    },
  });
  const failure = bootFailure(state);
  return (
    <TipProvider>
      <div className="app">
        <TopBar online={state.online} startedAt={state.summary?.started_at ?? null} now={now} live={live} pending={pending}
          onToggleLive={() => setLive(!live)} onToggleTheme={toggleTheme} simulated={simulated} />
        <SideNav current={section} onGo={nav.navigate} unseenAlerts={ui.unseen} group={group} />
        <main ref={nav.main}>
          <section className="view" aria-label={title}>
            {failure && !simulated ? <SourceNotice error={failure} /> : null}
            {state.loaded
              ? <SectionView section={section} state={state} now={now} simulated={simulated} group={group} users={users} requestsById={requestsById}
                  alertsUi={ui} query={nav.query} onQuery={nav.setQuery} selected={nav.selected} onSelect={nav.setSelected}
                  onOpenRequest={nav.openRequest} onUserTraffic={nav.showUserTraffic} onReset={reset} trafficSearch={trafficSearch} logSearch={logSearch} />
              : <div className="loading muted">Conectando con el banco…</div>}
          </section>
        </main>
      </div>
      <Toasts alerts={ui.toasts} onOpen={nav.openAlert} onDismiss={ui.dismissToast} />
    </TipProvider>
  );
}
