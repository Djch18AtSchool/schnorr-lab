/** Tira storyboard inferior con el transporte (anterior, siguiente/reproducir, reiniciar). */
import { Fragment, useEffect, useRef } from "react";
import type { FrameModel } from "../model/storyboard";
import { FrameSvg } from "./FrameSvg";
import { useMotionSettings } from "./motion";

interface BoardProps {
  actTitle: string;
  frames: FrameModel[];
  index: number;
  hasEve: boolean;
  pending: boolean;
  atEnd: boolean;
  auto: boolean;
  playing: boolean;
  holdMs: number | null;
  onPrev: () => void;
  onPlay: () => void;
  onRestart: () => void;
  onJump: (index: number) => void;
}

function playLabel({ auto, playing, atEnd, pending }: Pick<BoardProps, "auto" | "playing" | "atEnd" | "pending">): string {
  if (pending) return "Ejecutando…";
  if (auto) return playing ? "Pausar" : atEnd ? "Repetir" : "Reproducir";
  return atEnd ? "Repetir acto" : "Siguiente";
}

export function Board(props: BoardProps) {
  const { actTitle, frames, index, hasEve, pending, atEnd, auto, playing, holdMs, onPrev, onPlay, onRestart, onJump } = props;
  const strip = useRef<HTMLElement>(null);
  const { reduced } = useMotionSettings();
  useEffect(() => {
    const current = strip.current?.querySelector<HTMLElement>(".frame.cur");
    current?.scrollIntoView({ block: "nearest", inline: "center", behavior: reduced ? "auto" : "smooth" });
  }, [index, frames.length, reduced]);
  return (
    <footer className="board">
      <div className="transport">
        <div className="act">{actTitle}<small>Paso {index + 1} de {frames.length}</small></div>
        <div className="tbtns">
          <button type="button" className="tbtn" onClick={onPrev} disabled={index === 0} aria-label="Paso anterior (←)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <button type="button" className="tbtn primary" onClick={onPlay} disabled={pending} aria-keyshortcuts="ArrowRight Space">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              {auto && playing ? <><rect x="6.5" y="5" width="4" height="14" rx="1" /><rect x="13.5" y="5" width="4" height="14" rx="1" /></> : <path d="M8 5.5v13l11-6.5z" />}
            </svg>
            <span>{playLabel({ auto, playing, atEnd, pending })}</span>
          </button>
          <button type="button" className="tbtn" onClick={onRestart} aria-label="Reiniciar acto (R)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" /></svg>
          </button>
        </div>
      </div>
      <nav className="strip" ref={strip} aria-label="Pasos del acto">
        {frames.map((frame, i) => (
          <Fragment key={frame.id}>
            {frame.gapBefore && <span className="gap" aria-hidden="true" />}
            <button
              type="button"
              className={`frame${i === index ? " cur" : ""}${i > index ? " future" : ""}${frame.ready ? "" : " planned"}`}
              aria-label={`Paso ${frame.n}: ${frame.short}`}
              aria-current={i === index ? "step" : undefined}
              onClick={(event) => {
                if (event.detail > 0) event.currentTarget.blur();
                onJump(i);
              }}
            >
              <FrameSvg frame={frame} hasEve={hasEve} />
              <span className="cap"><b>{frame.n}</b><span className="cap-t">{frame.short}</span></span>
              {i === index && holdMs !== null && <span className="prog" style={{ animationDuration: `${holdMs}ms` }} />}
            </button>
          </Fragment>
        ))}
      </nav>
    </footer>
  );
}
