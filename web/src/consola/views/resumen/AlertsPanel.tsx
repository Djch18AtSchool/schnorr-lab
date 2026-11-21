/** Alertas de seguridad deducidas, con la evidencia (peticiones) que las sostiene. */
import type { Alert, RequestRecord } from "../../../shared/types";
import { CodeText, Method, PanelHead, Severity } from "../../components/Common";
import { groupAlerts, severityCounts, type AlertGroup } from "../../lib/alerts";
import { fmtClock, rel } from "../../lib/format";
import { hostOf, resultLabel } from "../../lib/requests";

const MAX_SHOWN = 9;

interface AlertsPanelProps {
  alerts: readonly Alert[];
  requestsById: ReadonlyMap<number, RequestRecord>;
  now: number;
  openId: number | null;
  freshIds: ReadonlySet<number>;
  onToggle: (id: number) => void;
  onOpenRequest: (id: number) => void;
}

function Evidence({ ids, requestsById, onOpenRequest }: { ids: readonly number[]; requestsById: ReadonlyMap<number, RequestRecord>; onOpenRequest: (id: number) => void }) {
  if (!ids.length) return null;
  return (
    <div className="evidence">
      {ids.map((id) => {
        const r = requestsById.get(id);
        if (!r) return <span key={id} className="mono faint">petición #{id} (fuera de la memoria de la consola)</span>;
        return (
          <button type="button" key={id} title="Ver en Tráfico" onClick={() => onOpenRequest(id)}>
            <span>{fmtClock(r.timestamp)}</span><Method method={r.method} />
            <span className="p">{r.path} → {r.status} {resultLabel(r)}</span><span className="o">{hostOf(r.client)}</span>
          </button>
        );
      })}
    </div>
  );
}

function AlertItem({ group, open, fresh, now, onToggle, requestsById, onOpenRequest }: { group: AlertGroup; open: boolean; fresh: boolean; now: number } & Pick<AlertsPanelProps, "onToggle" | "requestsById" | "onOpenRequest">) {
  const a = group.alert;
  return (
    <div className={`alert${fresh ? " fresh" : ""}`}>
      <button type="button" className="ah" aria-expanded={open} onClick={() => onToggle(a.id)}>
        <Severity severity={a.severity} />
        <span className="at">{a.title}{group.times > 1 ? <span className="times">×{group.times}</span> : null}</span>
        <span className="am">{rel(a.timestamp, now)}</span>
      </button>
      {open ? (
        <>
          <p className="ad"><CodeText text={a.detail} /></p>
          <Evidence ids={a.evidence} requestsById={requestsById} onOpenRequest={onOpenRequest} />
        </>
      ) : null}
    </div>
  );
}

export function AlertsPanel(props: AlertsPanelProps) {
  const groups = groupAlerts(props.alerts);
  const counts = severityCounts(props.alerts);
  return (
    <div className="panel">
      <PanelHead title="Alertas de seguridad"><span className="muted">{counts.alta} altas, {counts.media} medias, {counts.baja} bajas</span></PanelHead>
      <div className="alerts" style={{ marginTop: 8 }}>
        {groups.slice(0, MAX_SHOWN).map((g) => (
          <AlertItem key={g.alert.id} group={g} open={props.openId === g.alert.id} fresh={props.freshIds.has(g.alert.id)} now={props.now}
            onToggle={props.onToggle} requestsById={props.requestsById} onOpenRequest={props.onOpenRequest} />
        ))}
        {groups.length ? null : <div className="alert"><span className="muted">Sin alertas en los últimos 15 minutos.</span></div>}
      </div>
    </div>
  );
}
