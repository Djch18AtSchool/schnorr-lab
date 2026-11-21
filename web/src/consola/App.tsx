/** Consola del banco: barra superior, navegación lateral y la sección activa. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Alert } from "../shared/types";
import { SideNav } from "./components/SideNav";
import { SourceNotice } from "./components/SourceNotice";
import { Toasts } from "./components/Toasts";
import { TipProvider } from "./components/Tooltip";
import { TopBar } from "./components/TopBar";
import type { ConsoleDataSource } from "./data/source";
import { EMPTY_QUERY, type ActivityQuery } from "./lib/activityQuery";
import { attemptIndex, groupAttempts } from "./lib/attempts";
import type { RangeKey } from "./lib/timeline";
import { useHashRoute, useNow, useTheme } from "./state/hooks";
import { sectionInfo, type Section } from "./state/sections";
import { bootFailure } from "./state/store";
import { useAlertsUi } from "./state/useAlertsUi";
import { useConsoleData } from "./state/useConsoleData";
import { SectionView, type ConsoleNav, type Derived } from "./views/SectionView";

/** Navegación entre secciones y los saltos cruzados: cada número lleva a sus peticiones en Actividad. */
function useNavigation(go: (section: Section) => void) {
  const [query, setQuery] = useState<ActivityQuery>(EMPTY_QUERY);
  const [selected, setSelected] = useState<number | null>(null);
  const main = useRef<HTMLElement>(null);
  const navigate = useCallback((next: Section) => {
    go(next);
    if (main.current) main.current.scrollTop = 0;
  }, [go]);
  const openActivity = useCallback((next: ActivityQuery, select: number | null = null) => {
    setQuery(next);
    setSelected(select);
    navigate("actividad");
  }, [navigate]);
  const openRequest = useCallback((id: number) => openActivity(EMPTY_QUERY, id), [openActivity]);
  const nav: ConsoleNav = useMemo(() => ({ go: navigate, openActivity, openRequest, setQuery, select: setSelected }), [navigate, openActivity, openRequest]);
  return { main, query, selected, nav };
}

export function App({ source }: { source: ConsoleDataSource }) {
  const { state, live, setLive, pending, online } = useConsoleData(source);
  const [section, go] = useHashRoute();
  const toggleTheme = useTheme();
  const now = useNow();
  const [range, setRange] = useState<RangeKey>("todo");
  const ui = useAlertsUi(state.alerts, state.loaded, section === "seguridad");
  const { main, query, selected, nav } = useNavigation(go);
  const derived: Derived = useMemo(() => {
    const attempts = groupAttempts(state.requests);
    return { attempts, byRequest: attemptIndex(attempts), requestsById: new Map(state.requests.map((r) => [r.id, r])) };
  }, [state.requests]);
  const info = sectionInfo(section);
  useEffect(() => { document.title = `${info.title} · Consola del banco`; }, [info.title]);
  const openAlert = useCallback((alert: Alert) => {
    ui.dismissToast(alert.id);
    nav.go("seguridad");
  }, [ui, nav]);
  const simulated = source.kind === "simulada";
  const failure = bootFailure(state);
  return (
    <TipProvider>
      <div className="app">
        <TopBar online={online} live={live} pending={pending} simulated={simulated} onToggleLive={() => setLive(!live)} onToggleTheme={toggleTheme} />
        <SideNav current={section} onGo={nav.go} unseenAlerts={ui.unseen} />
        <main ref={main}>
          <section className={`view view-${section}`} aria-label={info.title}>
            {failure && !simulated ? <SourceNotice error={failure} /> : null}
            {state.loaded
              ? <SectionView section={section} state={state} derived={derived} now={now} simulated={simulated} source={source}
                  nav={nav} query={query} selected={selected} range={range} onRange={setRange} />
              : <div className="loading">Conectando con el banco…</div>}
          </section>
        </main>
      </div>
      <Toasts alerts={ui.toasts} onOpen={openAlert} onDismiss={ui.dismissToast} />
    </TipProvider>
  );
}
