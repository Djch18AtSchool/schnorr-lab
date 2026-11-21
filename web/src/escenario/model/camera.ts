/**
 * Plan de cámara por beat (a quién enfocar y qué filas encuadrar) y la geometría pura del
 * encuadre: dado el rectángulo objetivo y la región libre de la pantalla, la escala y el
 * desplazamiento del «mundo».
 */
import type { ActRun } from "../../shared/types";
import { exchangeOf, lastDecision, stepOf } from "./beats";
import { eveOnStage } from "./eveTerminal";
import type { Beat, Focus } from "./types";

export type CamMode = "follow" | "wide";
export type CardPos = "right" | "left" | "top";

export type Shot =
  | { kind: "wide" }
  | { kind: "summary" }
  | { kind: "review"; stepIndex: number }
  | { kind: "focus"; focus: "ana" | "eve" | "bank" | "net"; rowId: string | null; withLaptop: boolean; linkRowId: string | null };

const ROW_KINDS: readonly Beat["kind"][] = ["compute", "attack", "request", "server", "response"];

export function beatFocus(run: ActRun, beat: Beat): Focus {
  switch (beat.kind) {
    case "intro":
      return "wide";
    case "summary":
      return "summary";
    case "biometric":
      return "ana";
    case "request":
    case "response":
      return "net";
    case "server":
      return "bank";
    case "outcome":
      return beat.actor === "eve" ? "eve" : "ana";
    default: {
      const actor = stepOf(run, beat)?.actor ?? beat.actor;
      return actor === "banco" ? "bank" : actor;
    }
  }
}

function copiesToEve(run: ActRun, beat: Beat): boolean {
  if (beat.kind !== "request" && beat.kind !== "response") return false;
  const exchange = exchangeOf(run, beat);
  return eveOnStage(run) && stepOf(run, beat)?.record?.intercepted === true && exchange?.origin !== "eve";
}

export function shotFor(run: ActRun, beat: Beat, cam: CamMode, review: number | null): Shot {
  if (review !== null) return { kind: "review", stepIndex: review };
  const focus = beatFocus(run, beat);
  if (cam === "wide" || focus === "wide") return { kind: "wide" };
  if (focus === "summary") return { kind: "summary" };
  const decision = beat.kind === "outcome" ? lastDecision(run) : null;
  const decisionRow = decision ? `s${decision.stepIndex}:x${decision.exchangeIndex}:res` : null;
  const rowId = ROW_KINDS.includes(beat.kind) ? beat.id : decisionRow;
  return {
    kind: "focus",
    focus,
    rowId,
    withLaptop: copiesToEve(run, beat),
    linkRowId: beat.kind === "server" ? beat.id : null,
  };
}

/** true si la toma es de conjunto (plano general, resumen): la terminal oculta el código. */
export function isOverview(shot: Shot): boolean {
  return shot.kind === "wide" || shot.kind === "summary";
}

// ---------------------------------------------------------------- geometría

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function union(rects: ReadonlyArray<Rect | null>): Rect | null {
  const list = rects.filter((r): r is Rect => r !== null);
  if (!list.length) return null;
  const x1 = Math.min(...list.map((r) => r.x));
  const y1 = Math.min(...list.map((r) => r.y));
  const x2 = Math.max(...list.map((r) => r.x + r.w));
  const y2 = Math.max(...list.map((r) => r.y + r.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function pad(r: Rect, px: number, py = px): Rect {
  return { x: r.x - px, y: r.y - py, w: r.w + px * 2, h: r.h + py * 2 };
}

export interface Fit {
  s: number;
  tx: number;
  ty: number;
}

/** Escala (sin pasar de max) y traslada `target` para centrarlo en `region`. */
export function fitRect(target: Rect, region: Rect, max: number): Fit {
  const s = Math.max(0.05, Math.min(region.w / target.w, region.h / target.h, max));
  return {
    s,
    tx: region.x + region.w / 2 - (target.x + target.w / 2) * s,
    ty: region.y + region.h / 2 - (target.y + target.h / 2) * s,
  };
}

export const NARROW_MAX_WIDTH = 760;
const NOTE_MAX_W = 440;

export interface Viewport {
  vw: number;
  vh: number;
  noteH: number;
}

/** Región libre de la pantalla según dónde va la tarjeta de anotación. */
export function regionFor(card: CardPos, { vw, vh, noteH }: Viewport): Rect {
  if (vw <= NARROW_MAX_WIDTH) return { x: 8, y: 8, w: vw - 16, h: vh * 0.54 - 8 };
  const noteW = Math.min(NOTE_MAX_W, vw - 32);
  if (card === "right") return { x: 24, y: 44, w: vw * 0.55 - 36, h: vh - 76 };
  if (card === "left") {
    const x = 32 + noteW + 28;
    return { x, y: 44, w: vw - x - 28, h: vh - 76 };
  }
  const top = Math.min(24 + noteH + 34, vh * 0.46);
  return { x: 24, y: top, w: vw - 48, h: vh - top - 20 };
}

const PREFERENCE_MARGIN = 0.02;

/** Elige, entre las posiciones de tarjeta posibles, la que deja ver el objetivo más grande. */
export function bestFit(target: Rect, cards: readonly CardPos[], viewport: Viewport, max: number): Fit & { card: CardPos } {
  const fits = cards.map((card) => ({ card, ...fitRect(target, regionFor(card, viewport), max) }));
  return fits.reduce((a, b) => (b.s > a.s + PREFERENCE_MARGIN ? b : a));
}
