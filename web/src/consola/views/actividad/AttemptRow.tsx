/** Un intento como fila desplegable: quién, qué, los pasos (params → commit → respond) y cómo terminó. */
import { ChevronRight } from "lucide-react";
import { Outcome } from "../../components/Common";
import { DeviceChip } from "../../components/Device";
import type { Attempt } from "../../lib/attempts";
import { fmtClock, fmtElapsed, fmtMsShort } from "../../lib/format";
import { requestOutcome, stepName, statusClass } from "../../lib/requests";

interface AttemptRowProps {
  attempt: Attempt;
  open: boolean;
  selected: number | null;
  onToggle: (key: string) => void;
  /** reveal: llevar el detalle a la vista (al elegir una petición concreta). */
  onSelect: (id: number, reveal: boolean) => void;
}

function Steps({ attempt }: { attempt: Attempt }) {
  return (
    <span className="steps" aria-label={`Pasos: ${attempt.requests.map(stepName).join(", ")}`}>
      {attempt.requests.map((r, i) => (
        <span key={r.id} className={`step ${requestOutcome(r).tone}`}>{i > 0 ? <i aria-hidden="true">→</i> : null}{stepName(r)}</span>
      ))}
    </span>
  );
}

export function AttemptRow({ attempt, open, selected, onToggle, onSelect }: AttemptRowProps) {
  const last = attempt.requests[attempt.requests.length - 1];
  const containsSelected = attempt.requests.some((r) => r.id === selected);
  return (
    <li className={`attempt${open ? " open" : ""}${containsSelected ? " has-sel" : ""}`}>
      <button type="button" className="attempt-sum" aria-expanded={open} onClick={() => { onToggle(attempt.key); if (!open) onSelect(last.id, false); }}>
        <ChevronRight className="chev" aria-hidden="true" />
        <span className="attempt-main">
          <span className="attempt-l1">
            <time className="mono">{fmtClock(attempt.start)}</time>
            <span className="attempt-what"><b>{attempt.title}</b>{attempt.user ? <span> · {attempt.user}</span> : null}</span>
            <Outcome tone={attempt.outcome.tone}>{attempt.outcome.label}</Outcome>
          </span>
          <span className="attempt-l2">
            <DeviceChip device={attempt.device} compact />
            <Steps attempt={attempt} />
            <span className="attempt-dur mono" title="Desde la primera petición hasta la última respuesta">{fmtElapsed(attempt.durationMs)}</span>
          </span>
        </span>
      </button>
      {open ? (
        <ol className="attempt-reqs">
          {attempt.requests.map((r) => (
            <li key={r.id}>
              <button type="button" className="req-line" aria-current={r.id === selected ? "true" : undefined} onClick={() => onSelect(r.id, true)}>
                <span className="mono p"><b>{r.method}</b> {r.path}</span>
                <span className={`st ${statusClass(r.status)}`}>{r.status}</span>
                <Outcome tone={requestOutcome(r).tone}>{requestOutcome(r).label}</Outcome>
                <span className="mono ms">{fmtMsShort(r.duration_ms)}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}
