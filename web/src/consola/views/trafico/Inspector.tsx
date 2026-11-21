/**
 * Inspector de una petición: lo que el banco recibió y respondió, la verificación que hizo, lo que
 * dedujo (alertas) y el resto del flujo con la misma correlación. No sabe qué «acto» ocurre.
 */
import type { Alert, RequestRecord, RouteStats } from "../../../shared/types";
import { CodeText, Method, Result, Severity, Status } from "../../components/Common";
import { Icon } from "../../components/Icons";
import { JsonView } from "../../components/JsonView";
import { containsSecret } from "../../lib/audit";
import { fmtClock, fmtClockMs, fmtMs, plural, shortNum } from "../../lib/format";
import type { GroupInfo } from "../../lib/group";
import { flowOf, outcomeOf, resultLabel, stepOf } from "../../lib/requests";
import { bodyFields, verificationOf, type Verification } from "../../lib/verify";

interface InspectorProps {
  request: RequestRecord | null;
  flow: readonly RequestRecord[];
  alerts: readonly Alert[];
  group: GroupInfo | null;
  y: string | null;
  route: RouteStats | undefined;
  onSelect: (id: number) => void;
}

function Guard({ body }: { body: unknown }) {
  const fields = bodyFields(body);
  if (containsSecret(body)) {
    return <div className="isec"><div className="guard bad"><Icon name="alta" /><span>El cuerpo trae un campo <code>x</code>: un secreto llegó al banco.</span></div></div>;
  }
  return (
    <div className="isec">
      <div className="guard"><Icon name="shield" style={{ marginTop: 1 }} />
        <span>El cuerpo solo trae valores públicos: {fields.length ? fields.map((f, i) => <span key={f}>{i ? ", " : ""}<code>{f}</code></span>) : "ninguno"}. Ningún campo x llegó al banco.</span>
      </div>
    </div>
  );
}

function Equations({ v, group }: { v: Verification; group: GroupInfo | null }) {
  const p = group ? shortNum(group.p, 6) : "p";
  const g = group ? shortNum(group.g, 6) : "g";
  const n = (value: string): string => shortNum(value, 8);
  const mark = (ok: boolean): string => (ok ? "✓" : "✗");
  return (
    <div className="isec">
      <h3>Verificación en el banco<span>{v.nizk ? "Fiat-Shamir" : "interactiva"}</span></h3>
      <div className="eqs">
        {v.nizk ? <div><span>c = H(p‖g‖y‖t‖id‖m) mod q</span><span>{n(v.c)}</span></div> : null}
        <div><span>g<sup>s</sup> = {g}<sup>{n(v.s)}</sup> mod {p}</span><span>{n(v.gs)}</span></div>
        <div><span>t·y<sup>c</sup> = {n(v.t)}·{v.y ? n(v.y) : "y"}<sup>{n(v.c)}</sup> mod {p}</span><span className={v.congruenceOk ? "okc" : "badc"}>{n(v.tyc)} {mark(v.congruenceOk)}</span></div>
        {v.yc ? <div><span>(y<sup>c</sup>)<sup>−1</sup> = {n(v.yc)}<sup>−1</sup> mod {p}</span><span>{n(v.ycInv)}</span></div> : null}
        {v.tRec ? <div><span>t = g<sup>s</sup>·(y<sup>c</sup>)<sup>−1</sup> mod {p}</span><span className={v.recoveryOk ? "okc" : "badc"}>{n(v.tRec)} {mark(v.recoveryOk)}</span></div> : null}
      </div>
    </div>
  );
}

function Timing({ r, route }: { r: RequestRecord; route: RouteStats | undefined }) {
  if (r.path.endsWith("/events/stream")) return null;
  const rows: Array<[string, number]> = [["Esta petición", r.duration_ms], ...(route ? [["p50 de la ruta", route.p50_ms], ["p95 de la ruta", route.p95_ms]] as Array<[string, number]> : [])];
  const max = Math.max(...rows.map(([, ms]) => ms), 0.01);
  return (
    <div className="isec">
      <h3>Tiempos<span>{route ? `${route.count} llamadas a la ruta` : fmtMs(r.duration_ms)}</span></h3>
      <div className="timing">
        {rows.map(([label, ms]) => (
          <div className="tr" key={label}><span>{label}</span><span className="tk"><i style={{ left: 0, width: `${Math.max(2, (ms / max) * 100)}%` }} /></span><b>{ms.toFixed(2)} ms</b></div>
        ))}
      </div>
    </div>
  );
}

function Deductions({ alerts }: { alerts: readonly Alert[] }) {
  if (!alerts.length) return null;
  return (
    <div className="isec">
      <h3>Deducciones del banco<span>{plural(alerts.length, "alerta", "alertas")}</span></h3>
      {alerts.map((a) => (
        <div key={a.id} className="deduction">
          <Severity severity={a.severity} />
          <span><b>{a.title}</b><br /><span className="muted"><CodeText text={a.detail} /></span></span>
        </div>
      ))}
    </div>
  );
}

function FlowList({ r, flow, onSelect }: { r: RequestRecord; flow: readonly RequestRecord[]; onSelect: (id: number) => void }) {
  return (
    <div className="isec">
      <h3>Flujo {flowOf(r)}<span>{plural(flow.length, "petición", "peticiones")}, mismo X-Correlation-ID</span></h3>
      <div className="flow">
        {flow.map((x) => (
          <button type="button" key={x.id} aria-current={x.id === r.id} onClick={() => onSelect(x.id)}>
            <span className="stp">{stepOf(x)}</span><span className="mono faint">{fmtClock(x.timestamp)}</span><Method method={x.method} />
            <span className="p">{x.path}</span><Status status={x.status} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function Inspector({ request: r, flow, alerts, group, y, route, onSelect }: InspectorProps) {
  if (!r) return <aside className="panel insp" aria-label="Inspector de petición"><div className="isec"><span className="muted">Selecciona una petición para ver sus cuerpos.</span></div></aside>;
  const verification = verificationOf(r, y);
  const isStream = r.path.endsWith("/events/stream");
  return (
    <aside className="panel insp" aria-label="Inspector de petición">
      <div className="ih">
        <div className="l1"><Method method={r.method} /><span className="path">{r.path}</span><Status status={r.status} /><Result outcome={outcomeOf(r)} text={resultLabel(r)} /></div>
        <div className="l2"><span>{fmtClockMs(r.timestamp)}</span><span>{isStream ? "abierta" : fmtMs(r.duration_ms)}</span><span>{r.client}</span>{r.correlation_id ? <span>corr={r.correlation_id}</span> : null}</div>
      </div>
      {r.method === "POST" && r.mechanism ? <Guard body={r.request_body} /> : null}
      <div className="isec">
        <h3>Petición<span>{r.request_body == null ? "sin cuerpo" : "application/json"}</span></h3>
        <dl className="hdrs">
          <dt>User-Agent</dt><dd title={r.user_agent}>{r.user_agent}</dd>
          <dt>Dispositivo</dt><dd>{r.device}</dd>
          <dt>X-Correlation-ID</dt><dd>{r.correlation_id ?? "—"}</dd>
          {r.request_body == null ? null : <><dt>Content-Type</dt><dd>application/json</dd></>}
        </dl>
        {r.request_body == null ? null : <JsonView value={r.request_body} />}
      </div>
      {verification ? <Equations v={verification} group={group} /> : null}
      <Deductions alerts={alerts} />
      <div className="isec"><h3>Respuesta<span>{isStream ? "text/event-stream" : "application/json"}</span></h3><JsonView value={r.response_body} /></div>
      <Timing r={r} route={route} />
      <FlowList r={r} flow={flow} onSelect={onSelect} />
    </aside>
  );
}
