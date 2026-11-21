/** Barra superior: entorno, estado del servicio, En vivo/Pausado, fecha y hora, tema y operador. */
import { fmtClock } from "../lib/format";
import { BrandMark, Icon } from "./Icons";

interface TopBarProps {
  online: boolean;
  startedAt: number | null;
  now: number;
  live: boolean;
  pending: number;
  onToggleLive: () => void;
  onToggleTheme: () => void;
  simulated: boolean;
}

function uptime(startedAt: number | null, now: number): string {
  if (startedAt == null) return "";
  const minutes = Math.max(0, Math.floor((now - startedAt) / 60));
  return minutes < 60 ? `activo hace ${minutes} min` : `activo hace ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function TopBar({ online, startedAt, now, live, pending, onToggleLive, onToggleTheme, simulated }: TopBarProps) {
  const date = new Date(now * 1000).toLocaleDateString("es-CR", { weekday: "short", day: "numeric", month: "short" });
  const liveText = live ? "En vivo" : pending ? `Pausado · ${pending} nuevas` : "Pausado";
  return (
    <header className="top">
      <div className="brand"><BrandMark /><b>Banco Lab</b><span className="muted">Consola</span></div>
      <span className="env" title={simulated ? "Datos generados en el navegador (?fuente=simulada)" : "Entorno"}>
        banco-lab · {simulated ? "datos simulados" : "simulación"}
      </span>
      <span className="svc">
        <span className={`pulse${online ? "" : " off"}`} aria-hidden="true" />
        <strong>{online ? "Servicio en línea" : "Sin conexión en vivo"}</strong>
        <span className="muted mono">{uptime(startedAt, now)}</span>
      </span>
      <span className="spacer" />
      <button type="button" className="live" aria-pressed={live} onClick={onToggleLive} title="Pausar o reanudar la actualización en vivo (P)">
        <span className="ld" /><span>{liveText}</span>
      </button>
      <span className="clock mono"><span className="d">{date}, </span>{fmtClock(now)}</span>
      <button type="button" className="iconbtn" onClick={onToggleTheme} title="Cambiar tema (T)" aria-label="Cambiar tema"><Icon name="theme" /></button>
      <div className="op" title="Sesión de operador">
        <span className="avatar">MR</span>
        <span className="who">M. Rojas<small>operadora de turno</small></span>
      </div>
    </header>
  );
}
