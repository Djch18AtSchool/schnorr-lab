/** Aviso discreto: sin conexión con el backend (con opción explícita de pasar a la simulación) o un error. */
import { TriangleAlert, WifiOff } from "lucide-react";

interface BannerProps {
  offline: boolean;
  message: string | null;
  canSimulate: boolean;
  onSimulate: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}

export function Banner({ offline, message, canSimulate, onSimulate, onRetry, onDismiss }: BannerProps) {
  if (!offline && !message) return null;
  return (
    <div className={`banner${offline ? " offline" : ""}`} role="status">
      {offline ? <WifiOff className="banner-icon" /> : <TriangleAlert className="banner-icon" />}
      <div className="banner-text">
        <b>{offline ? "No hay conexión con el celular del laboratorio" : "Algo no salió como se esperaba"}</b>
        <span>{offline ? `Revise que el laboratorio esté corriendo (python lab.py). ${message ?? ""}`.trim() : message}</span>
      </div>
      <div className="banner-actions">
        {offline && <button type="button" onClick={onRetry}>Reintentar</button>}
        {canSimulate && <button type="button" className="primary" onClick={onSimulate}>Usar la simulación</button>}
        {!offline && <button type="button" onClick={onDismiss} aria-label="Cerrar aviso">Cerrar</button>}
      </div>
    </div>
  );
}
