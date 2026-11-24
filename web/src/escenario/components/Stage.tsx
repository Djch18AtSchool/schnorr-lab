/** El escenario: mundo con cámara (diagrama, celular, terminal, laptop), corchetes y tarjeta. */
import { useMemo, useRef } from "react";
import { cardFor } from "../model/camera";
import type { DiagramRow } from "../model/types";
import type { Scene } from "../state/scene";
import { BankTerminal } from "./BankTerminal";
import { Diagram } from "./Diagram";
import { EveLaptop } from "./EveLaptop";
import { rightColumn } from "./layout";
import { NoteCard } from "./NoteCard";
import { useMotionSettings } from "./motion";
import { Phone } from "./Phone";
import { useCamera } from "./useCamera";

interface StageProps {
  scene: Scene;
  group: string;
  bankOnline: boolean;
  wide: boolean;
  speed: number;
  reviewN: number | null;
  animate: boolean;
  onReview: (stepIndex: number) => void;
  onBack: () => void;
}

function dimmed(scene: Scene, wide: boolean): { phone: boolean; eve: boolean; bank: boolean } {
  const broad = scene.focus === "wide" || (wide && scene.focus !== "review");
  const withLaptop = scene.shot.kind === "focus" && scene.shot.withLaptop;
  return {
    phone: !broad && scene.focus !== "ana",
    eve: !broad && scene.focus !== "eve" && !withLaptop,
    bank: !broad && scene.focus !== "bank" && scene.focus !== "summary",
  };
}

export function Stage({ scene, group, bankOnline, wide, speed, reviewN, animate, onReview, onBack }: StageProps) {
  const stage = useRef<HTMLElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const phone = useRef<HTMLDivElement>(null);
  const termActor = useRef<HTMLDivElement>(null);
  const termInner = useRef<HTMLDivElement>(null);
  const laptop = useRef<HTMLDivElement>(null);
  const note = useRef<HTMLElement>(null);
  const brackets = useRef<HTMLDivElement>(null);
  const link = useRef<SVGSVGElement>(null);
  const refs = useMemo(() => ({ stage, world, phone, termInner, note, brackets, link }), []);
  const termRefs = useMemo(() => ({ actor: termActor, inner: termInner }), []);
  const { reduced } = useMotionSettings();

  const rows = useMemo(
    () => new Map<string, DiagramRow>(scene.diagram.phases.flatMap((p) => p.rows.map((r) => [r.row.id, r.row] as const))),
    [scene.diagram],
  );
  const notePos = cardFor(scene.shot);
  useCamera(refs, { shot: scene.shot, focus: scene.focus, reviewN, rows, hasEve: scene.hasEve, speed, reduced });
  const col = rightColumn(scene.hasEve);
  const dim = dimmed(scene, wide);
  const linkRowId = scene.shot.kind === "focus" ? scene.shot.linkRowId : null;
  const counter = scene.focus === "review" ? `Va en el paso ${scene.index + 1} de ${scene.beats.length}` : `Paso ${scene.index + 1} de ${scene.beats.length}`;

  return (
    <main className="stage" ref={stage}>
      <div className="world" ref={world}>
        <Diagram view={scene.diagram} linkRowId={linkRowId} onReview={onReview} />
        <Phone view={scene.phone} dim={dim.phone} actorRef={phone} />
        <svg className="link" ref={link} width="10" height="10" aria-hidden="true">
          <path d="" />
          <circle r="5" />
          <circle r="5" />
        </svg>
        <BankTerminal view={scene.terminal} group={group} online={bankOnline} dim={dim.bank} left={col.termX} top={col.termY} animate={animate} refs={termRefs} />
        <EveLaptop lines={scene.eve} onStage={scene.hasEve} dim={dim.eve} left={col.lapX} top={col.lapY} animate={animate} actorRef={laptop} />
      </div>
      <div className="brackets hidden" ref={brackets}>
        <b /><b /><b /><b />
        <span />
      </div>
      {notePos !== "none" && <NoteCard note={scene.note} pos={notePos} counter={counter} reviewing={scene.focus === "review"} onBack={onBack} noteRef={note} />}
    </main>
  );
}
