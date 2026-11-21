/**
 * Medición del mundo en el DOM (coordenadas de layout, sin transformaciones) para la cámara:
 * qué rectángulo encuadrar en cada toma y dónde anclar el celular.
 */
import type { CardPos, Rect, Shot } from "../model/camera";
import { pad, union } from "../model/camera";
import type { DiagramRow } from "../model/types";
import { HEADS_H, LANE_X, LAPTOP, PHONE, PHONE_BOTTOM_GAP, rightColumn, TERM } from "./layout";

export interface WorldEls {
  world: HTMLElement;
  phases: HTMLElement | null;
  diagram: HTMLElement | null;
  termInner: HTMLElement | null;
}

export function rectIn(el: HTMLElement, world: HTMLElement): Rect {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== world) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

export function rowEl(els: WorldEls, id: string | null): HTMLElement | null {
  if (!id || !els.phases) return null;
  return els.phases.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"]`);
}

/** Extensión horizontal de lo que una fila realmente dibuja. */
export function rowRect(el: HTMLElement, row: DiagramRow, world: HTMLElement): Rect | null {
  const r = rectIn(el, world);
  if (row.type === "msg") {
    const lo = Math.min(LANE_X[row.from], LANE_X[row.to]);
    const hi = Math.max(LANE_X[row.from], LANE_X[row.to]);
    const card = el.querySelector<HTMLElement>(".packet");
    const cardRect = card ? { x: (lo + hi) / 2 - card.offsetWidth / 2, y: r.y, w: card.offsetWidth, h: r.h } : null;
    const tap = row.tap ? { x: LANE_X.net, y: r.y, w: LANE_X.eve - LANE_X.net + 20, h: r.h } : null;
    return union([{ x: lo - 8, y: r.y, w: hi - lo + 48, h: r.h }, cardRect, tap]);
  }
  const side = el.querySelector<HTMLElement>(".mark, .c-side");
  const sideRect = side ? rectIn(side, world) : null;
  const lane = row.type === "local" ? LANE_X[row.at] : LANE_X.bank;
  return union([sideRect, { x: lane - 16, y: r.y, w: 32, h: r.h }]);
}

export function diagramBox(els: WorldEls, hasEve: boolean): Rect {
  const right = (hasEve ? LANE_X.eve : LANE_X.bank) + 100;
  const left = LANE_X.ana - 70;
  const phasesH = els.phases?.offsetHeight ?? 0;
  const diagH = els.diagram?.offsetHeight ?? 760;
  return { x: left, y: 0, w: right - left, h: Math.min(Math.max(320, HEADS_H + phasesH - 20), diagH - 24) };
}

export function phoneRect(phoneY: number): Rect {
  return { x: PHONE.x, y: phoneY, w: PHONE.w, h: PHONE.h + 36 };
}

export function laptopRect(): Rect {
  const c = rightColumn(true);
  return { x: c.lapX, y: c.lapY, w: LAPTOP.w, h: LAPTOP.h + 20 };
}

export function termRect(els: WorldEls, hasEve: boolean): Rect {
  const c = rightColumn(hasEve);
  return { x: c.termX, y: c.termY, w: TERM.w, h: (els.termInner?.offsetHeight ?? 120) + 40 };
}

/** Nueva altura del celular: junto a la fila actual, sin salirse del diagrama. */
export function anchorPhone(els: WorldEls, shot: Shot, previous: number): number {
  if (shot.kind === "wide" || shot.kind === "summary") return 0;
  if (shot.kind !== "focus") return previous;
  const el = rowEl(els, shot.rowId);
  if (!el) return previous;
  const r = rectIn(el, els.world);
  const diagH = els.diagram?.offsetHeight ?? PHONE.h;
  const max = Math.max(0, diagH - PHONE.h - PHONE_BOTTOM_GAP);
  return Math.min(max, Math.max(0, r.y + r.h / 2 - PHONE.h / 2));
}

export interface ShotGeometry {
  rect: Rect;
  cards: CardPos[];
  max: number;
  frame: Rect | null;
}

export function shotGeometry(els: WorldEls, shot: Shot, rows: ReadonlyMap<string, DiagramRow>, hasEve: boolean, phoneY: number): ShotGeometry {
  const box = diagramBox(els, hasEve);
  const term = termRect(els, hasEve);
  const lap = hasEve ? laptopRect() : null;
  if (shot.kind === "wide") {
    return { rect: pad(union([box, phoneRect(phoneY), term, lap]) ?? box, 24), cards: ["left", "top"], max: 1, frame: null };
  }
  if (shot.kind === "summary") return { rect: pad(union([box, term, lap]) ?? box, 24), cards: ["top", "left"], max: 1.05, frame: null };
  if (shot.kind === "review") {
    const phase = els.phases?.querySelector<HTMLElement>(`[data-step="${shot.stepIndex}"]`);
    const r = phase ? rectIn(phase, els.world) : box;
    const band = { x: box.x, y: r.y, w: box.w, h: r.h };
    return { rect: pad(band, 20), cards: ["left"], max: 1.1, frame: pad(band, 8) };
  }
  const el = rowEl(els, shot.rowId);
  const row = shot.rowId ? rows.get(shot.rowId) : undefined;
  const rowBox = el && row ? rowRect(el, row, els.world) : null;
  if (shot.focus === "bank") {
    const laneBox = el ? { x: LANE_X.bank - 14, y: rectIn(el, els.world).y, w: 28, h: el.offsetHeight } : null;
    return { rect: pad(union([term, laneBox]) ?? term, 26), cards: ["left"], max: 1.1, frame: pad({ ...term, h: term.h - 40 }, 12) };
  }
  if (shot.focus === "ana") return focusGeometry(union([phoneRect(phoneY), rowBox]), ["right"], 1.05);
  if (shot.focus === "eve") return focusGeometry(union([laptopRect(), rowBox]), ["left"], 1.12);
  const target = union([rowBox ?? box, shot.withLaptop ? laptopRect() : null]) ?? box;
  return focusGeometry(target, ["top", "left"], 1.15);
}

function focusGeometry(target: Rect | null, cards: CardPos[], max: number): ShotGeometry {
  const t = target ?? { x: 0, y: 0, w: 100, h: 100 };
  return { rect: pad(t, 26), cards, max, frame: pad(t, 10) };
}
