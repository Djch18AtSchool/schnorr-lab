/** Resumen: ¿qué está pasando ahora? Indicadores del rango, cada petición en el tiempo y las últimas alertas. */
import { Radio } from "lucide-react";
import { useMemo } from "react";
import { Empty, PanelHead, Seg, ViewHead } from "../../components/Common";
import { fmtClock, plural } from "../../lib/format";
import { accountsStatus, severityCounts, supportActions, trafficStats } from "../../lib/stats";
import { activitySpans } from "../../lib/timeAxis";
import { RANGES, inRange, rangeStart, type RangeKey } from "../../lib/timeline";
import { KNOWN_DEVICES } from "../../lib/devices";
import type { ConsoleState } from "../../state/store";
import type { ConsoleNav, Derived } from "../SectionView";
import { Kpis } from "./Kpis";
import { RecentAlerts } from "./RecentAlerts";
import { Timeline } from "./Timeline";
import { TimelineLegend } from "./TimelineLegend";

interface ResumenProps {
  state: ConsoleState;
  derived: Derived;
  now: number;
  nav: ConsoleNav;
  range: RangeKey;
  onRange: (range: RangeKey) => void;
}

const RANGE_TEXT: Readonly<Record<RangeKey, string>> = { "1m": "Último minuto", "5m": "Últimos 5 min", "15m": "Últimos 15 min", todo: "Todo el historial" };

function deviceOrder(devices: ReadonlySet<string>): string[] {
  return [...KNOWN_DEVICES.filter((d) => devices.has(d)), ...[...devices].filter((d) => !KNOWN_DEVICES.includes(d))];
}

export function Resumen({ state, derived, now, nav, range, onRange }: ResumenProps) {
  const since = rangeStart(range, now);
  const visible = useMemo(() => inRange(state.requests, range, now), [state.requests, range, now]);
  const alerts = useMemo(() => inRange(state.alerts, range, now), [state.alerts, range, now]);
  const accounts = useMemo(() => (state.accounts ? accountsStatus(state.accounts, state.alerts, supportActions(state.requests)) : null), [state.accounts, state.alerts, state.requests]);
  const spans = activitySpans(visible.map((r) => r.timestamp), now);
  const rangeLabel = RANGE_TEXT[range];
  const rangeSeg = <Seg label="Rango de tiempo" value={range} onChange={onRange} options={RANGES.map((r) => ({ value: r.key, label: r.label }))} />;
  return (
    <>
      <ViewHead title="Resumen" tools={rangeSeg}>¿Qué está pasando ahora? Cada número y cada punto llevan a las peticiones que lo forman.</ViewHead>
      <Kpis stats={trafficStats(visible)} accounts={accounts} alerts={severityCounts(alerts)} since={since} rangeLabel={rangeLabel} nav={nav} />
      <div className="resumen-grid">
        <div className="panel">
          <PanelHead title="Peticiones en el tiempo">
            <span className="muted">{spans ? `${plural(visible.length, "petición", "peticiones")} desde las ${fmtClock(visible[0].timestamp)} · altura = cuánto tardó el banco` : rangeLabel}</span>
          </PanelHead>
          {spans ? (
            <div className="pb">
              <Timeline visible={visible} attempts={derived.attempts} spans={spans} onOpen={nav.openRequest} />
              <TimelineLegend devices={deviceOrder(new Set(visible.map((r) => r.device)))} />
            </div>
          ) : (
            <Empty icon={Radio} title={state.requests.length ? "Sin peticiones en este rango" : "Todavía no hay peticiones"}>
              {state.requests.length ? "Elija un rango más amplio o inicie un acto en el Escenario." : "Inicie un acto en el Escenario: cada petición que reciba el banco aparece aquí al instante."}
            </Empty>
          )}
        </div>
        <RecentAlerts alerts={state.alerts} requestsById={derived.requestsById} now={now} nav={nav} />
      </div>
    </>
  );
}
