/** Barra superior: nombre, fila «En escena» con quien actúa y el botón de Dirección. */
import type { CastMember } from "../../shared/types";
import type { Focus } from "../model/types";
import { SlidersIcon } from "./icons";

const CHIPS: ReadonlyArray<{ member: CastMember; lane: string; label: string }> = [
  { member: "ana", lane: "ana", label: "Ana" },
  { member: "red", lane: "net", label: "Red" },
  { member: "banco", lane: "bank", label: "Banco" },
  { member: "eve", lane: "eve", label: "Eve" },
];

interface TopBarProps {
  cast: CastMember[];
  hasEve: boolean;
  focus: Focus | "review";
  simulated: boolean;
  drawerOpen: boolean;
  onDirection: () => void;
}

export function TopBar({ cast, hasEve, focus, simulated, drawerOpen, onDirection }: TopBarProps) {
  const present = (member: CastMember): boolean => (member === "eve" ? hasEve : member === "red" || cast.includes(member) || cast.length === 0);
  return (
    <header className="topbar">
      <div className="slate">
        <span className="name"><b>Schnorr Lab</b><span>Escenario</span></span>
        {simulated && <span className="sim-badge" title="Datos del guion, sin backend">Simulación</span>}
      </div>
      <div className="cast" aria-label="Elenco en escena">
        <span className="cast-label">En escena</span>
        {CHIPS.map((chip) => (
          <span key={chip.lane} className={`chip${chip.lane === focus ? " on" : ""}${present(chip.member) ? "" : " out"}`} data-a={chip.lane}>
            <i />
            {chip.label}
          </span>
        ))}
      </div>
      <button type="button" className="dir-btn" onClick={onDirection} aria-controls="drawer" aria-expanded={drawerOpen}>
        <SlidersIcon />
        <span className="lbl">Dirección</span>
        <kbd>D</kbd>
      </button>
    </header>
  );
}
