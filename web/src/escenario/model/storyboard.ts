/** Cuadros de la tira inferior: uno por beat, con separación entre pasos del backend. */
import type { ActRun } from "../../shared/types";
import { exchangeOf } from "./beats";
import { beatFocus } from "./camera";
import { laneOf } from "./diagram";
import type { Beat, Focus, Lane } from "./types";

export interface FrameModel {
  id: string;
  n: number;
  short: string;
  focus: Focus;
  /** Flecha del mensaje (en petición y respuesta). */
  arrow: { from: Lane; to: Lane } | null;
  gapBefore: boolean;
  ready: boolean;
}

function arrowOf(run: ActRun, beat: Beat): FrameModel["arrow"] {
  if (beat.kind !== "request" && beat.kind !== "response") return null;
  const origin = laneOf(exchangeOf(run, beat)?.origin ?? beat.actor);
  return beat.kind === "request" ? { from: origin, to: "bank" } : { from: "bank", to: origin };
}

export function frames(run: ActRun, beats: readonly Beat[]): FrameModel[] {
  return beats.map((beat, i) => {
    const prev = beats[i - 1];
    const gapBefore = i > 0 && (beat.stepIndex === null || prev.stepIndex !== beat.stepIndex);
    return {
      id: beat.id,
      n: i + 1,
      short: beat.short,
      focus: beatFocus(run, beat),
      arrow: arrowOf(run, beat),
      gapBefore,
      ready: beat.ready,
    };
  });
}
