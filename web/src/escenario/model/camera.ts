/**
 * Plan de cámara por beat (a quién enfocar y qué filas encuadrar) y la geometría pura del
 * encuadre: dado el rectángulo objetivo y la región libre de la pantalla, la escala y el
 * desplazamiento del «mundo».
 */
import type { ActRun } from "../../shared/types";
import { exchangeOf, stepOf } from "./beats";
import { eveOnStage } from "./eveTerminal";
import type { Beat, Focus } from "./types";

export type CamMode = "follow" | "wide";
/** «none»: sin ficha (plano inicial y resumen final), el lienzo entero es del panorama. */
export type CardPos = "right" | "left" | "top" | "none";

export type Shot =
  | { kind: "wide"; bare?: boolean }
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
  if (focus === "wide") return { kind: "wide", bare: true };
  if (focus === "summary") return cam === "wide" ? { kind: "wide", bare: true } : { kind: "summary" };
  if (cam === "wide") return { kind: "wide" };
  const rowId = ROW_KINDS.includes(beat.kind) ? beat.id : null;
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
/** Distancia de la tarjeta de anotación a los bordes, igual en las tres posiciones. */
export const NOTE_MARGIN = 32;
const REGION_GAP = 28;

/** Posición fija de la tarjeta según quién actúa: Ana a la derecha, Eve a la izquierda y el resto arriba; sin ficha al inicio y al final. */
export function cardFor(shot: Shot): CardPos {
  if (shot.kind === "summary" || (shot.kind === "wide" && shot.bare)) return "none";
  if (shot.kind !== "focus") return "top";
  if (shot.focus === "ana") return "right";
  return shot.focus === "eve" ? "left" : "top";
}

export interface Viewport {
  vw: number;
  vh: number;
  noteH: number;
}

/** Región libre de la pantalla según dónde va la tarjeta de anotación. */
export function regionFor(card: CardPos, { vw, vh, noteH }: Viewport): Rect {
  if (card === "none") return { x: REGION_GAP, y: REGION_GAP, w: vw - REGION_GAP * 2, h: vh - REGION_GAP * 2 };
  if (vw <= NARROW_MAX_WIDTH) return { x: 8, y: 8, w: vw - 16, h: vh * 0.54 - 8 };
  const noteW = Math.min(NOTE_MAX_W, vw - NOTE_MARGIN * 2);
  const side = { y: REGION_GAP, h: vh - REGION_GAP * 2 };
  if (card === "right") return { x: REGION_GAP, w: vw - noteW - NOTE_MARGIN - REGION_GAP * 2, ...side };
  if (card === "left") {
    const x = NOTE_MARGIN + noteW + REGION_GAP;
    return { x, w: vw - x - REGION_GAP, ...side };
  }
  const top = Math.min(NOTE_MARGIN + noteH + REGION_GAP, vh * 0.46);
  return { x: REGION_GAP, y: top, w: vw - REGION_GAP * 2, h: vh - top - REGION_GAP };
}

/** Encuadra el objetivo en la región que deja libre la tarjeta de esa posición. */
export function fitFor(target: Rect, card: CardPos, viewport: Viewport, max: number): Fit {
  return fitRect(target, regionFor(card, viewport), max);
}
