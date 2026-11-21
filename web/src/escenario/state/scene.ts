/**
 * Vista completa de una toma: todo lo que se dibuja en el beat actual, derivado con las
 * funciones puras del modelo. Sin efectos: se puede probar con un run y sus eventos.
 */
import type { ActInfo, ActRun } from "../../shared/types";
import { bankTerminal } from "../model/bankTerminal";
import { buildBeats, lastDecision } from "../model/beats";
import { beatFocus, isOverview, shotFor, type CamMode, type Shot } from "../model/camera";
import { buildDiagram, phaseNumbers } from "../model/diagram";
import type { EventStore } from "../model/events";
import { eveOnStage, eveTerminal } from "../model/eveTerminal";
import { noteView, reviewNote } from "../model/note";
import { phoneView } from "../model/phone";
import { frames, type FrameModel } from "../model/storyboard";
import type { BankTerminalView, Beat, DiagramView, EveLine, Focus, NoteView, PhoneView } from "../model/types";

export interface SceneInput {
  run: ActRun;
  act: ActInfo | null;
  index: number;
  exhausted: boolean;
  review: number | null;
  animate: boolean;
  cam: CamMode;
  store: EventStore;
}

export interface Scene {
  beats: Beat[];
  beat: Beat;
  index: number;
  focus: Focus | "review";
  shot: Shot;
  hasEve: boolean;
  diagram: DiagramView;
  phone: PhoneView;
  eve: EveLine[];
  terminal: BankTerminalView;
  note: NoteView;
  frames: FrameModel[];
  atEnd: boolean;
}

export function buildScene(input: SceneInput): Scene {
  const { run, act, exhausted, review, animate, cam, store } = input;
  const beats = buildBeats(run, exhausted);
  const index = Math.min(Math.max(0, input.index), beats.length - 1);
  const beat = beats[index];
  const shot = shotFor(run, beat, cam, review);
  const decision = lastDecision(run);
  return {
    beats,
    beat,
    index,
    focus: review !== null ? "review" : beatFocus(run, beat),
    shot,
    hasEve: eveOnStage(run),
    diagram: buildDiagram(run, beats, index, store, {
      review,
      wide: cam === "wide",
      animate: animate && review === null,
      decisionStep: decision?.stepIndex ?? null,
    }),
    phone: phoneView(run, beats, index),
    eve: eveTerminal(run, beats, index),
    terminal: bankTerminal(run, beats, index, store, isOverview(shot)),
    note: review !== null ? reviewNote(run, review, phaseNumbers(run).get(review) ?? review + 1) : noteView(run, act, beat, store),
    frames: frames(run, beats),
    atEnd: index === beats.length - 1,
  };
}
