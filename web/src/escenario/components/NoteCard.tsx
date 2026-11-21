/** Tarjeta de anotación: quién actúa, qué pasa y las matemáticas con los números reales. */
import type { RefObject } from "react";
import type { CardPos } from "../model/camera";
import type { Focus, MathRow, NoteView } from "../model/types";
import { MathText } from "./MathText";

const FOCUS_COLOR: Readonly<Record<Focus, string>> = {
  ana: "var(--ana)", eve: "var(--eve)", bank: "var(--bank)", net: "var(--net)", wide: "var(--ink-2)", summary: "var(--ink-2)",
};

function MathRows({ rows }: { rows: MathRow[] }) {
  if (!rows.length) return null;
  return (
    <dl className="math">
      {rows.map((row, i) => (
        <div key={i} className="math-row">
          <dt><MathText text={row.term} /></dt>
          <dd className={row.tone === "plain" ? undefined : row.tone}>{row.detail && <MathText text={row.detail} />}</dd>
        </div>
      ))}
    </dl>
  );
}

interface NoteCardProps {
  note: NoteView;
  pos: CardPos;
  counter: string;
  reviewing: boolean;
  onBack: () => void;
  noteRef: RefObject<HTMLElement | null>;
}

export function NoteCard({ note, pos, counter, reviewing, onBack, noteRef }: NoteCardProps) {
  const color = FOCUS_COLOR[note.focus];
  return (
    <article ref={noteRef} className="note swap" data-pos={pos} style={{ ["--c" as string]: color }} aria-live="polite" key={`${note.title}|${note.who}`}>
      <div className="who"><b>{note.who}</b><span>{counter}</span></div>
      <h2><MathText text={note.title} /></h2>
      {note.text && <p>{note.text}</p>}
      <MathRows rows={note.math} />
      {note.hint && (
        <div className="hint">Presione <kbd>→</kbd> o <kbd>Espacio</kbd> para avanzar</div>
      )}
      {reviewing && (
        <div className="hint">
          <button type="button" className="back" onClick={onBack}>Volver al paso actual <kbd>Esc</kbd></button>
        </div>
      )}
    </article>
  );
}
