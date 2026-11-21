/** Diagrama de secuencia vivo: carriles, cabeceras y fases (las anteriores, compactas). */
import type { CSSProperties, KeyboardEvent } from "react";
import type { DiagramView, Lane, PhaseView, RowView } from "../model/types";
import { Icon, type IconName } from "./icons";
import { DIAGRAM_W, LANE_ORDER, LANE_X } from "./layout";
import { LocalRowView, MessageRow, ServerRowView } from "./DiagramRows";

const LANE_HEAD: Readonly<Record<Lane, { label: string; icon: IconName }>> = {
  ana: { label: "Celular de Ana", icon: "phone" },
  net: { label: "Red", icon: "net" },
  bank: { label: "Servidor del banco", icon: "bank" },
  eve: { label: "Eve", icon: "laptop" },
};

interface DiagramProps {
  view: DiagramView;
  linkRowId: string | null;
  onReview: (stepIndex: number) => void;
}

function Row({ view, compact, linked }: { view: RowView; compact: boolean; linked: boolean }) {
  if (view.row.type === "msg") return <MessageRow view={view} compact={compact} />;
  if (view.row.type === "local") return <LocalRowView view={view} compact={compact} />;
  return <ServerRowView view={view} compact={compact} linked={linked} />;
}

function Phase({ phase, linkRowId, onReview }: { phase: PhaseView; linkRowId: string | null; onReview: (stepIndex: number) => void }) {
  const open = (): void => onReview(phase.stepIndex);
  const onKey = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    open();
  };
  const interactive = phase.compact
    ? { role: "button", tabIndex: 0, "aria-label": `Revisar el paso ${phase.n}: ${phase.title}`, onClick: open, onKeyDown: onKey }
    : {};
  return (
    <section className={`phase${phase.compact ? " compact" : ""}${phase.later ? " later" : ""}`} data-step={phase.stepIndex} {...interactive}>
      <div className="ph-head">
        <span className="ph-n">{phase.n}</span>
        <span className="ph-t">{phase.title}</span>
        {phase.compact && <span className="peek">Ver de nuevo</span>}
      </div>
      {phase.rows.map((row) => (
        <Row key={row.row.id} view={row} compact={phase.compact} linked={row.row.id === linkRowId} />
      ))}
    </section>
  );
}

export function Diagram({ view, linkRowId, onReview }: DiagramProps) {
  const lanes = view.hasEve ? LANE_ORDER : LANE_ORDER.filter((l) => l !== "eve");
  const style = {
    width: view.hasEve ? DIAGRAM_W.eve : DIAGRAM_W.base,
    "--x-last": `${view.hasEve ? LANE_X.eve : LANE_X.bank}px`,
  } as CSSProperties;
  return (
    <div className="diagram" style={style}>
      <div className="lifelines">
        {LANE_ORDER.map((lane) => (
          <div key={lane} className={`lifeline ${lane}${lanes.includes(lane) ? "" : " off"}`} />
        ))}
      </div>
      <div className="heads">
        {LANE_ORDER.map((lane) => (
          <div key={lane} className={`head ${lane}${lanes.includes(lane) ? "" : " off"}`}>
            <Icon name={LANE_HEAD[lane].icon} />
            {LANE_HEAD[lane].label}
          </div>
        ))}
      </div>
      {view.showEmpty && (
        <div className="flow-empty">
          <b>El intercambio se dibuja aquí</b>
          Cada mensaje sale del carril de quien lo envía. A la derecha, la terminal del banco muestra cada petición y el código que la atendió.
        </div>
      )}
      <div className="phases">
        {view.phases.map((phase) => (
          <Phase key={phase.stepIndex} phase={phase} linkRowId={linkRowId} onReview={onReview} />
        ))}
      </div>
    </div>
  );
}
