/** Sección Resumen: indicadores, peticiones, latencia, embudo deducido y alertas con evidencia. */
import type { Alert, RequestRecord } from "../../../shared/types";
import { PanelHead, Unavailable, ViewHead } from "../../components/Common";
import { CATEGORIES, LatencyChart, RequestsChart } from "../../components/charts/TrafficCharts";
import { deduceFunnel, type Funnel } from "../../lib/funnel";
import type { ConsoleState } from "../../state/store";
import { AlertsPanel } from "./AlertsPanel";
import { Kpis } from "./Kpis";

const ALERT_GRACE_S = 120;

interface ResumenProps {
  state: ConsoleState;
  now: number;
  requestsById: ReadonlyMap<number, RequestRecord>;
  openAlert: number | null;
  freshAlerts: ReadonlySet<number>;
  onToggleAlert: (id: number) => void;
  onOpenRequest: (id: number) => void;
}

function FunnelRow({ label, value, max, ok }: { label: string; value: number; max: number; ok?: boolean }) {
  return (
    <div className="frow">
      <span>{label}</span>
      <div className="bar"><span className={ok ? "ok" : ""} style={{ width: `${(value / max) * 100}%` }} /></div>
      <b>{value}</b>
    </div>
  );
}

function FunnelPanel({ funnel }: { funnel: Funnel }) {
  const max = Math.max(1, funnel.commits, funnel.nizk);
  return (
    <div className="panel">
      <PanelHead title="Inicios de sesión"><span className="muted">deducido por correlación</span></PanelHead>
      <div className="pb">
        <div className="funnel">
          <FunnelRow label="Compromisos t recibidos" value={funnel.commits} max={max} />
          <FunnelRow label="Retos c emitidos" value={funnel.challenges} max={max} />
          <FunnelRow label="Respuestas s a su sesión" value={funnel.ownResponses} max={max} />
          <FunnelRow label="Accesos concedidos" value={funnel.granted} max={max} ok />
          <div style={{ height: 4 }} />
          <FunnelRow label="Pruebas Fiat-Shamir" value={funnel.nizk} max={max} />
          <FunnelRow label="Concedidas" value={funnel.nizkGranted} max={max} ok />
          <p className="fnote">{funnel.unanswered > 0 ? `${funnel.unanswered} retos sin respuesta (sesiones abandonadas o en curso).` : "Todas las sesiones emitidas recibieron respuesta."}</p>
        </div>
      </div>
    </div>
  );
}

export function Resumen({ state, now, requestsById, openAlert, freshAlerts, onToggleAlert, onOpenRequest }: ResumenProps) {
  const summary = state.summary;
  const windowS = summary?.window_s ?? 900;
  const inWindow = state.requests.filter((r) => r.timestamp >= now - windowS);
  const recentAlerts: Alert[] = state.alerts.filter((a) => a.timestamp >= now - windowS - ALERT_GRACE_S);
  return (
    <>
      <ViewHead title="Resumen">
        Últimos {Math.round(windowS / 60)} minutos de actividad del servidor. Las alertas se deducen de las peticiones: el banco no sabe quién está detrás de cada una.
      </ViewHead>
      {summary ? <Kpis summary={summary} accounts={state.accounts} /> : <Unavailable what="El resumen de telemetría" error={state.errors.summary} />}
      <div className="grid-main">
        <div className="stack">
          <div className="panel">
            <PanelHead title={`Peticiones cada ${summary?.bucket_s ?? 30} s`}>
              <div className="legend">{CATEGORIES.map((c) => <span key={c.key}><i style={{ background: c.color }} />{c.label}</span>)}</div>
            </PanelHead>
            <div className="pb">{summary ? <RequestsChart series={summary.series} bucketS={summary.bucket_s} /> : null}</div>
          </div>
          <div className="two">
            <div className="panel">
              <PanelHead title="Latencia">
                <div className="legend"><span><i className="ln" style={{ background: "var(--s1)" }} />p50</span><span><i className="ln" style={{ background: "var(--s2)" }} />p95</span></div>
              </PanelHead>
              <div className="pb">{summary ? <LatencyChart series={summary.series} bucketS={summary.bucket_s} /> : null}</div>
            </div>
            <FunnelPanel funnel={deduceFunnel(inWindow)} />
          </div>
        </div>
        <AlertsPanel alerts={recentAlerts} requestsById={requestsById} now={now} openId={openAlert} freshIds={freshAlerts}
          onToggle={onToggleAlert} onOpenRequest={onOpenRequest} />
      </div>
    </>
  );
}
