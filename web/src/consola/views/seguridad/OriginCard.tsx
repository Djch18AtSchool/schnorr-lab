/** Un origen (dispositivo + IP) con sus alertas, la evidencia de cada una y las cuentas que tocó. */
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import type { Alert, RequestRecord } from "../../../shared/types";
import { Severity } from "../../components/Common";
import { DeviceChip } from "../../components/Device";
import { EMPTY_QUERY, linkEvidence } from "../../lib/activityQuery";
import { deviceInfo } from "../../lib/devices";
import { fmtClock, plural } from "../../lib/format";
import { statusClass } from "../../lib/requests";
import type { OriginGroup } from "../../lib/security";
import type { ConsoleNav } from "../SectionView";

const SHOWN = 4;
const SEVERITY_TEXT: Readonly<Record<Alert["severity"], string>> = { alta: "Severidad alta", media: "Severidad media", baja: "Severidad baja" };

function Evidence({ alert, byId, nav }: { alert: Alert; byId: ReadonlyMap<number, RequestRecord>; nav: ConsoleNav }) {
  return (
    <div className="evidence" aria-label="Peticiones que la sostienen">
      {alert.evidence.map((id) => {
        const r = byId.get(id);
        return (
          <button key={id} type="button" className="ev" data-a={r ? deviceInfo(r.device).actor : "other"} onClick={() => nav.openActivity(linkEvidence(alert), id)}
            title={r ? `${deviceInfo(r.device).label} · ${fmtClock(r.timestamp)}` : "Petición fuera del historial cargado"}>
            <span className="mono">#{id}</span>
            {r ? <><span className="mono">{r.method} {r.path}</span><span className={`st ${statusClass(r.status)}`}>{r.status}</span></> : <span className="muted">sin datos</span>}
          </button>
        );
      })}
    </div>
  );
}

function AlertRow({ alert, byId, nav }: { alert: Alert; byId: ReadonlyMap<number, RequestRecord>; nav: ConsoleNav }) {
  return (
    <li className="sec-alert">
      <Severity severity={alert.severity} />
      <div>
        <div className="sec-alert-h"><b>{alert.title}</b><time className="mono">{fmtClock(alert.timestamp)}</time></div>
        <p>{alert.detail}</p>
        <Evidence alert={alert} byId={byId} nav={nav} />
      </div>
    </li>
  );
}

export function OriginCard({ group, byId, nav }: { group: OriginGroup; byId: ReadonlyMap<number, RequestRecord>; nav: ConsoleNav }) {
  const [all, setAll] = useState(false);
  const shown = all ? group.alerts : group.alerts.slice(0, SHOWN);
  const label = `${deviceInfo(group.device).label} (${group.ip})`;
  return (
    <article className="panel origin" data-sev={group.severity}>
      <header className="origin-h">
        <DeviceChip device={group.device} detail={group.ip} />
        <span className={`sev-text ${group.severity}`}>{SEVERITY_TEXT[group.severity]}</span>
        <span className="muted">{plural(group.alerts.length, "alerta", "alertas")}{group.users.length ? ` · ${group.users.length === 1 ? "cuenta" : "cuentas"}: ${group.users.join(", ")}` : ""}</span>
        <button type="button" className="link" onClick={() => nav.openActivity({ ...EMPTY_QUERY, device: group.device, label: `Todo lo que hizo ${label}` })}>
          Su actividad<ArrowRight aria-hidden="true" />
        </button>
      </header>
      <ol className="sec-alerts">{shown.map((a) => <AlertRow key={a.id} alert={a} byId={byId} nav={nav} />)}</ol>
      {group.alerts.length > SHOWN ? (
        <button type="button" className="more" onClick={() => setAll(!all)}>{all ? "Mostrar solo las últimas" : `Mostrar las ${group.alerts.length - SHOWN} anteriores`}</button>
      ) : null}
    </article>
  );
}
