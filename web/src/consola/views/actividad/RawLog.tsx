/** Registro crudo: una línea por petición, como el log de acceso del servidor, la más reciente arriba. */
import type { RequestRecord } from "../../../shared/types";
import { deviceInfo } from "../../lib/devices";
import { fmtClockMs, fmtMsShort } from "../../lib/format";
import { hostOf, requestOutcome } from "../../lib/requests";

const MAX_LINES = 400;

interface RawLogProps {
  requests: readonly RequestRecord[];
  selected: number | null;
  onSelect: (id: number) => void;
}

const levelOf = (status: number): "INFO" | "WARN" | "ERROR" => (status >= 500 ? "ERROR" : status >= 400 ? "WARN" : "INFO");

export function RawLog({ requests, selected, onSelect }: RawLogProps) {
  const lines = [...requests].sort((a, b) => b.id - a.id).slice(0, MAX_LINES);
  return (
    <div className="rawlog" role="list" aria-label="Registro de peticiones">
      {lines.map((r) => {
        const outcome = requestOutcome(r);
        const level = levelOf(r.status);
        return (
          <button key={r.id} type="button" role="listitem" className={`raw-line${r.id === selected ? " sel" : ""}`} onClick={() => onSelect(r.id)}
            data-a={deviceInfo(r.device).actor}>
            <span className="t">{fmtClockMs(r.timestamp)}</span>
            <span className={`lv ${level}`}>{level}</span>
            <span className="ip">{hostOf(r.client)}</span>
            <span className="rq">"{r.method} {r.path}" <b className={r.status >= 400 ? "bad" : undefined}>{r.status}</b></span>
            <span className="ms">{fmtMsShort(r.duration_ms)}</span>
            <span className={`res ${outcome.tone}`}>{outcome.label}</span>
          </button>
        );
      })}
    </div>
  );
}
