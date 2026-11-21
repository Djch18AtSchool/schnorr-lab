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

export function RawLog({ requests, selected, onSelect }: RawLogProps) {
  const lines = [...requests].sort((a, b) => b.id - a.id).slice(0, MAX_LINES);
  return (
    <div className="rawlog" role="list" aria-label="Registro de peticiones">
      {lines.map((r) => {
        const outcome = requestOutcome(r);
        const info = deviceInfo(r.device);
        return (
          <button key={r.id} type="button" role="listitem" className={`raw-line${r.id === selected ? " sel" : ""}`} onClick={() => onSelect(r.id)}
            data-a={info.actor} title={`${info.label} · ${hostOf(r.client)}`}>
            <span className="t">{fmtClockMs(r.timestamp)}</span>
            <span className="rq">"{r.method} {r.path}" <b className={r.status >= 400 ? "bad" : undefined}>{r.status}</b></span>
            <span className="ms">{fmtMsShort(r.duration_ms)}</span>
            <span className={`res ${outcome.tone}`}>{outcome.label}</span>
          </button>
        );
      })}
    </div>
  );
}
