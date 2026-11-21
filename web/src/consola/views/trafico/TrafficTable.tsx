/** Tabla del tráfico en vivo: filas nuevas arriba, selección con teclado y resaltado del flujo. */
import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import type { RequestRecord } from "../../../shared/types";
import { Method, Result, Status } from "../../components/Common";
import { fmtClock } from "../../lib/format";
import { flowOf, hostOf, outcomeOf, resultLabel } from "../../lib/requests";
import { prefersReducedMotion } from "../../state/hooks";

export const MAX_TRAFFIC_ROWS = 250;
const SLOW_MS = 8;
const LAT_BAR_PER_MS = 3;
const LAT_BAR_MAX = 32;

interface TrafficTableProps {
  rows: readonly RequestRecord[];
  selected: number | null;
  hoverFlow: string | null;
  onSelect: (id: number) => void;
  onHoverFlow: (flow: string | null) => void;
  summaryText: string;
}

function Latency({ r }: { r: RequestRecord }) {
  if (r.path.endsWith("/events/stream")) return <span className="faint">abierta</span>;
  const ms = r.duration_ms;
  return (
    <span className="latbar">
      <span className="mono">{ms.toFixed(2)} ms</span>
      <i className={ms > SLOW_MS ? "slow" : ""} style={{ width: Math.min(LAT_BAR_MAX, ms * LAT_BAR_PER_MS) }} />
    </span>
  );
}

/** Anima las filas que no estaban en el render anterior (entrada suave, sin mover el resto). */
function useEnterAnimation(body: RefObject<HTMLTableSectionElement | null>, rows: readonly RequestRecord[]): void {
  const seen = useRef<number>(rows[0]?.id ?? 0);
  useEffect(() => {
    const newest = rows[0]?.id ?? 0;
    const previous = seen.current;
    seen.current = Math.max(previous, newest);
    if (!body.current || prefersReducedMotion() || previous === 0) return;
    body.current.querySelectorAll<HTMLTableRowElement>("tr[data-id]").forEach((tr) => {
      if (Number(tr.dataset.id) <= previous) return;
      tr.animate([{ background: "var(--banco-soft)", opacity: 0, transform: "translateY(-4px)" }, { background: "transparent", opacity: 1, transform: "none" }],
        { duration: 900, easing: "cubic-bezier(.2,.7,.2,1)" });
    });
  }, [rows, body]);
}

export function TrafficTable({ rows, selected, hoverFlow, onSelect, onHoverFlow, summaryText }: TrafficTableProps) {
  const body = useRef<HTMLTableSectionElement>(null);
  useEnterAnimation(body, rows);
  const selectedFlow = rows.find((r) => r.id === selected);
  const activeFlow = hoverFlow ?? (selectedFlow ? flowOf(selectedFlow) : null);
  const onKey = (event: KeyboardEvent<HTMLTableRowElement>, index: number): void => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(rows[index].id); }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const next = rows[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (!next) return;
    onSelect(next.id);
    body.current?.querySelector<HTMLTableRowElement>(`tr[data-id="${next.id}"]`)?.focus();
  };
  return (
    <div className="panel">
      <div className="tbl-scroll">
        <table className="t req">
          <thead><tr><th>Hora</th><th>Petición</th><th>Estado</th><th>Resultado</th><th className="r">Latencia</th><th>Origen</th><th className="wide">Correlación</th></tr></thead>
          <tbody ref={body} onMouseLeave={() => onHoverFlow(null)}>
            {rows.map((r, i) => {
              const flow = flowOf(r);
              const cls = [hoverFlow && flow !== hoverFlow ? "dim" : "", flow === activeFlow ? "sib" : ""].join(" ").trim();
              return (
                <tr key={r.id} data-id={r.id} tabIndex={0} aria-selected={selected === r.id} className={cls || undefined}
                  onClick={() => onSelect(r.id)} onKeyDown={(e) => onKey(e, i)} onMouseEnter={() => onHoverFlow(flow)}>
                  <td className="mono">{fmtClock(r.timestamp)}</td>
                  <td className="path"><Method method={r.method} /> {r.path}</td>
                  <td><Status status={r.status} /></td>
                  <td className="rc"><Result outcome={outcomeOf(r)} text={resultLabel(r)} /></td>
                  <td className="r"><Latency r={r} /></td>
                  <td className="mono">{hostOf(r.client)}</td>
                  <td className="corr wide">{r.correlation_id ?? "—"}</td>
                </tr>
              );
            })}
            {rows.length ? null : <tr><td colSpan={7} className="muted" style={{ padding: "24px 12px" }}>Ninguna petición coincide con el filtro.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="tfoot"><span>{summaryText}</span><span>Se muestran las {MAX_TRAFFIC_ROWS} más recientes</span></div>
    </div>
  );
}
