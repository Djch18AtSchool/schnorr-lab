/** Botón flotante de «Dirección» (arriba a la derecha del lienzo) y la insignia de simulación. */
import { SlidersHorizontal } from "lucide-react";

interface DirectionButtonProps {
  simulated: boolean;
  drawerOpen: boolean;
  onDirection: () => void;
}

export function DirectionButton({ simulated, drawerOpen, onDirection }: DirectionButtonProps) {
  return (
    <div className="dir-float">
      {simulated && <span className="sim-badge" title="Datos del guion, sin backend">Simulación</span>}
      <button type="button" className="dir-btn" onClick={onDirection} aria-controls="drawer" aria-expanded={drawerOpen} aria-keyshortcuts="D" aria-label="Dirección" title="Dirección (D)">
        <SlidersHorizontal />
        <span className="lbl">Dirección</span>
        <kbd>D</kbd>
      </button>
    </div>
  );
}
