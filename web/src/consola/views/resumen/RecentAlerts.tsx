/** Últimas alertas en lenguaje claro; cada una abre en Actividad las peticiones que la sostienen. */
import { ArrowRight, ShieldCheck } from "lucide-react";
import type { Alert, RequestRecord } from "../../../shared/types";
import { Empty, PanelHead, Severity } from "../../components/Common";
import { DeviceChip } from "../../components/Device";
import { linkEvidence } from "../../lib/activityQuery";
import { rel } from "../../lib/format";
import { triggerOf } from "../../lib/security";
import type { ConsoleNav } from "../SectionView";

const SHOWN = 4;

interface RecentAlertsProps {
  alerts: readonly Alert[];
  requestsById: ReadonlyMap<number, RequestRecord>;
  now: number;
  nav: ConsoleNav;
}

function AlertItem({ alert, trigger, now, nav }: { alert: Alert; trigger: RequestRecord | null; now: number; nav: ConsoleNav }) {
  return (
    <li>
      <button type="button" className="alert-item" onClick={() => nav.openActivity(linkEvidence(alert), trigger?.id ?? null)}>
        <Severity severity={alert.severity} />
        <span className="alert-body">
          <span className="alert-title"><b>{alert.title}</b><time>{rel(alert.timestamp, now)}</time></span>
          <span className="alert-detail">{alert.detail}</span>
          {trigger ? <DeviceChip device={trigger.device} compact /> : null}
        </span>
      </button>
    </li>
  );
}

export function RecentAlerts({ alerts, requestsById, now, nav }: RecentAlertsProps) {
  const latest = [...alerts].sort((a, b) => b.timestamp - a.timestamp || b.id - a.id).slice(0, SHOWN);
  return (
    <div className="panel recent-alerts">
      <PanelHead title="Últimas alertas">
        {alerts.length ? <button type="button" className="link" onClick={() => nav.go("seguridad")}>Ver por origen<ArrowRight aria-hidden="true" /></button> : null}
      </PanelHead>
      {latest.length ? (
        <ul className="alert-list">
          {latest.map((a) => <AlertItem key={a.id} alert={a} trigger={triggerOf(a, requestsById)} now={now} nav={nav} />)}
        </ul>
      ) : (
        <Empty icon={ShieldCheck} title="Sin alertas">El banco no ha visto repeticiones, pruebas inválidas ni bloqueos. Los actos de Eve en el Escenario las provocan.</Empty>
      )}
    </div>
  );
}
