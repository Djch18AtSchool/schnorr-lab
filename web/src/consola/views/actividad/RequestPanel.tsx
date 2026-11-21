/**
 * Detalle de una petición: qué pidió quién, la terminal del banco (log, función, cálculos), los
 * cuerpos enviado y recibido, el origen y la garantía de que x no viajó.
 */
import { MousePointerClick, ShieldCheck, ShieldX } from "lucide-react";
import type { RequestRecord } from "../../../shared/types";
import { Empty, Outcome, Unavailable } from "../../components/Common";
import { DeviceChip } from "../../components/Device";
import { JsonView } from "../../components/JsonView";
import type { Attempt } from "../../lib/attempts";
import { fmtClockMs, fmtMsShort, plural } from "../../lib/format";
import { hostOf, requestOutcome, statusClass } from "../../lib/requests";
import { secretCheck, terminalView } from "../../lib/terminal";
import type { DetailState } from "../../state/useRequestDetail";
import { Terminal } from "./Terminal";

interface RequestPanelProps {
  detail: DetailState;
  attempt: Attempt | undefined;
  group: string | null;
}

function Header({ r, attempt }: { r: RequestRecord; attempt: Attempt | undefined }) {
  const outcome = requestOutcome(r);
  return (
    <header className="rq-head">
      <div className="rq-line">
        <span className="rq-method">{r.method}</span>
        <span className="rq-path">{r.path}</span>
        <span className={`st ${statusClass(r.status)}`}>{r.status}</span>
      </div>
      <div className="rq-meta">
        <Outcome tone={outcome.tone}>{outcome.label}</Outcome>
        <DeviceChip device={r.device} detail={hostOf(r.client)} />
        <span className="mono">{fmtClockMs(r.timestamp)}</span>
        <span className="mono">{fmtMsShort(r.duration_ms)}</span>
      </div>
      {attempt && attempt.requests.length > 1 ? (
        <p className="rq-part">Paso {attempt.requests.findIndex((x) => x.id === r.id) + 1} de {plural(attempt.requests.length, "petición", "peticiones")} del intento «{attempt.title}{attempt.user ? ` de ${attempt.user}` : ""}».</p>
      ) : null}
    </header>
  );
}

function SecretGuard({ r }: { r: RequestRecord }) {
  const check = secretCheck(r);
  if (!check) return null;
  return check.safe ? (
    <div className="guard ok"><ShieldCheck aria-hidden="true" /><span><b>x no viajó.</b> El mensaje solo llevó {check.fields.map((f) => <code key={f}>{f}</code>)}: valores públicos que no permiten despejar x.</span></div>
  ) : (
    <div className="guard bad"><ShieldX aria-hidden="true" /><span><b>¡El cuerpo contiene x!</b> Campos: {check.fields.join(", ")}.</span></div>
  );
}

function Origin({ r }: { r: RequestRecord }) {
  return (
    <dl className="kv">
      <dt>IP</dt><dd>{hostOf(r.client)}</dd>
      <dt>Dispositivo</dt><dd>{r.device}</dd>
      <dt>User-Agent</dt><dd>{r.user_agent || "—"}</dd>
      <dt>Petición</dt><dd>#{r.id}{r.correlation_id ? ` · correlación ${r.correlation_id}` : ""}</dd>
    </dl>
  );
}

export function RequestPanel({ detail, attempt, group }: RequestPanelProps) {
  if (detail.status === "idle") {
    return <aside className="panel rq"><Empty icon={MousePointerClick} title="Elija una petición">Verá lo mismo que la terminal del banco en el Escenario: el log, la función que la atendió y los cálculos.</Empty></aside>;
  }
  if (detail.status === "loading") return <aside className="panel rq"><div className="loading">Pidiendo la petición #{detail.id} al banco…</div></aside>;
  if (detail.status === "error") return <aside className="panel rq"><div className="pb"><Unavailable what={`La petición #${detail.id}`} error={detail.message} /></div></aside>;
  const r = detail.detail.request;
  return (
    <aside className="panel rq" aria-label={`Petición ${r.id}`}>
      <Header r={r} attempt={attempt} />
      <div className="pb rq-body">
        <Terminal view={terminalView(detail.detail)} group={group} />
        <SecretGuard r={r} />
        <div className="bodies">
          <section><h3>Cuerpo enviado</h3>{r.request_body === null ? <p className="muted">Sin cuerpo (petición {r.method}).</p> : <JsonView value={r.request_body} />}</section>
          <section><h3>Respuesta del banco</h3><JsonView value={r.response_body} /></section>
        </div>
        <section><h3>Origen</h3><Origin r={r} /></section>
      </div>
    </aside>
  );
}
