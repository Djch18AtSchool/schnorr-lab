/** Tira storyboard inferior con el transporte (anterior, siguiente/reproducir, reiniciar). */
import { ChevronLeft, Pause, Play, RotateCcw } from "lucide-react";
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
      <div className="transport" role="group" aria-label={`${actTitle}: paso ${index + 1} de ${frames.length}`}>
        <button type="button" className="tbtn" onClick={onPrev} disabled={index === 0} aria-label="Paso anterior (←)" title="Paso anterior (←)">
          <ChevronLeft />
        </button>
        <button type="button" className="tbtn primary" onClick={onPlay} disabled={pending} aria-keyshortcuts="ArrowRight Space"
          aria-label={playLabel({ auto, playing, atEnd, pending })} title={playLabel({ auto, playing, atEnd, pending })}>
          {auto && playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
        </button>
        <button type="button" className="tbtn" onClick={onRestart} aria-label="Reiniciar acto (R)" title="Reiniciar acto (R)">
          <RotateCcw />
        </button>
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
