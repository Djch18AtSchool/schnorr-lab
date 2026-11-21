/** Sección Auditoría: cada cuerpo recibido en las rutas del protocolo; prueba que x nunca llegó. */
import { useMemo, useState } from "react";
import type { AuditEntry, RequestRecord } from "../../shared/types";
import { Fact, Seg, Unavailable, ViewHead } from "../components/Common";
import { auditFacts, linkAuditToRequests, matchesAudit, type AuditFilter } from "../lib/audit";
import { fmtClock } from "../lib/format";

const MAX_SHOWN = 200;

interface AuditoriaProps {
  entries: readonly AuditEntry[] | null;
  error: string | undefined;
  requests: readonly RequestRecord[];
  onOpenRequest: (id: number) => void;
}

const FILTERS: ReadonlyArray<{ value: AuditFilter; label: string }> = [
  { value: "all", label: "Todos" }, { value: "valid", label: "Válidos" }, { value: "invalid", label: "Inválidos" },
];

function why(request: RequestRecord | undefined, entry: AuditEntry): string | null {
  if (entry.valid || !request) return null;
  const body = request.response_body as { reason?: unknown; detail?: unknown } | null;
  return typeof body?.reason === "string" ? body.reason : typeof body?.detail === "string" ? body.detail : null;
}

export function Auditoria({ entries, error, requests, onOpenRequest }: AuditoriaProps) {
  const [filter, setFilter] = useState<AuditFilter>("all");
  const [endpoint, setEndpoint] = useState("");
  const links = useMemo(() => linkAuditToRequests(entries ?? [], requests), [entries, requests]);
  const intro = "Cada cuerpo recibido en las rutas del protocolo, en orden de llegada, incluidos los rechazados por mal formados. Sirve para comprobar que x nunca llegó al banco.";
  if (!entries) return <><ViewHead title="Auditoría">{intro}</ViewHead><Unavailable what="La auditoría" error={error} /></>;
  const facts = auditFacts(entries);
  const endpoints = [...new Set(entries.map((e) => e.endpoint))].sort();
  const indexed = entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => matchesAudit(entry, filter, endpoint));
  return (
    <>
      <ViewHead title="Auditoría" tools={<>
        <Seg label="Validez" options={FILTERS} value={filter} onChange={setFilter} />
        <select className="field" aria-label="Ruta" value={endpoint} onChange={(e) => setEndpoint(e.target.value)}>
          <option value="">Todas las rutas</option>
          {endpoints.map((e) => <option key={e}>{e}</option>)}
        </select>
      </>}>{intro}</ViewHead>
      <div className="panel facts">
        <Fact label="Cuerpos recibidos" value={facts.total} />
        <Fact label="Rechazados por mal formados" value={facts.invalid} />
        <Fact label="Campos vistos"><div className="fields">{facts.fields.map((f) => <code key={f}>{f}</code>)}</div></Fact>
        <Fact label="Cuerpos con x" value={facts.withSecret} tone={facts.withSecret ? undefined : "ok"}>
          <span className="muted" style={{ fontSize: 12 }}>de {facts.total}, incluidos los inválidos</span>
        </Fact>
      </div>
      <div className="panel">
        <div className="alist">
          {indexed.slice(-MAX_SHOWN).reverse().map(({ entry, index }) => {
            const request = links.get(index);
            const reason = why(request, entry);
            return (
              <div className="aitem" key={index}>
                <span className="ix">#{index + 1}</span>
                <span className="mono faint">{request ? fmtClock(request.timestamp) : "—"}</span>
                {request
                  ? <button type="button" className="linkbtn mono" title="Ver la petición" onClick={() => onOpenRequest(request.id)}>{entry.endpoint}</button>
                  : <span className="mono">{entry.endpoint}</span>}
                <span className={`vtag ${entry.valid ? "y" : "n"}`}>{entry.valid ? "válido" : "inválido"}</span>
                <code>{JSON.stringify(entry.body)}</code>
                {reason ? <span className="why">{reason}</span> : null}
              </div>
            );
          })}
          {indexed.length ? null : <div className="aitem"><span /><span /><span className="muted">Sin cuerpos para este filtro.</span></div>}
        </div>
      </div>
    </>
  );
}
