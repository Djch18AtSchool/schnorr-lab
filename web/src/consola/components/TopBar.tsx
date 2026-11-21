/** Barra superior sobria, como la del Escenario: nombre, estado del servicio, En vivo/Pausado y tema. */
import { Moon, Pause, Play } from "lucide-react";

interface TopBarProps {
  online: boolean;
  live: boolean;
  pending: number;
  simulated: boolean;
  onToggleLive: () => void;
  onToggleTheme: () => void;
}

export function TopBar({ online, live, pending, simulated, onToggleLive, onToggleTheme }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="slate">
        <div className="name"><b>Schnorr Lab</b><span>Consola del banco</span></div>
        <span className="sep" aria-hidden="true" />
        <span className={`svc${online ? " on" : ""}`} role="status">
          <i aria-hidden="true" />{online ? "En línea" : "Sin conexión"}
        </span>
        {simulated ? <span className="sim-badge" title="?fuente=simulada: el banco corre en este navegador">Datos simulados</span> : null}
      </div>
      <div className="top-tools">
        <button type="button" className={`dir-btn live-btn${live ? " on" : ""}`} aria-pressed={live} onClick={onToggleLive}
          title={live ? "Congelar la vista para leer con calma" : "Volver a recibir peticiones en vivo"}>
          {live ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          <span className="lbl">{live ? "En vivo" : "Pausado"}</span>
          {!live && pending > 0 ? <span className="pending">+{pending}</span> : null}
        </button>
        <button type="button" className="icon-btn" onClick={onToggleTheme} aria-label="Cambiar tema claro u oscuro" title="Tema claro u oscuro">
          <Moon aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
