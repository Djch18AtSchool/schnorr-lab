/**
 * Cámara: tras cada render mide el mundo, ancla el celular junto a la fila actual, encuadra
 * la toma (zoom/pan sobrio), coloca los corchetes «En foco» y la línea banco → terminal.
 */
import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { bestFit, type CardPos, type Fit, type Rect, type Shot } from "../model/camera";
import type { DiagramRow, Focus } from "../model/types";
import { anchorPhone, rectIn, rowEl, shotGeometry, type WorldEls } from "./cameraDom";
import { LANE_X, rightColumn } from "./layout";
import { prefersReducedMotion } from "./motion";

const CAM_MS = 900;
const MIN_CAM_MS = 380;
const LINK_TOP_MIN = 54;
const LINK_BOTTOM_GAP = 30;
const LINK_ELBOW = 34;

export interface CameraRefs {
  stage: RefObject<HTMLElement | null>;
  world: RefObject<HTMLDivElement | null>;
  phone: RefObject<HTMLDivElement | null>;
  termInner: RefObject<HTMLDivElement | null>;
  note: RefObject<HTMLElement | null>;
  brackets: RefObject<HTMLDivElement | null>;
  link: RefObject<SVGSVGElement | null>;
}

export interface CameraInput {
  shot: Shot;
  focus: Focus | "review";
  reviewN: number | null;
  rows: ReadonlyMap<string, DiagramRow>;
  hasEve: boolean;
  speed: number;
}

const BRACKET_INFO: Readonly<Record<string, { label: string; color: string }>> = {
  ana: { label: "En foco: celular de Ana", color: "var(--ana)" },
  eve: { label: "En foco: laptop de Eve", color: "var(--eve)" },
  bank: { label: "En foco: servidor del banco", color: "var(--bank)" },
  net: { label: "En foco: el mensaje en la red", color: "var(--net)" },
};

function worldEls(refs: CameraRefs): WorldEls | null {
  const world = refs.world.current;
  if (!world) return null;
  return {
    world,
    phases: world.querySelector<HTMLElement>(".phases"),
    diagram: world.querySelector<HTMLElement>(".diagram"),
    termInner: refs.termInner.current,
  };
}

function placeBrackets(el: HTMLDivElement | null, frame: Rect | null, fit: Fit, input: CameraInput): void {
  if (!el) return;
  const info = input.shot.kind === "review"
    ? { label: `Revisando el paso ${input.reviewN ?? ""}`, color: "var(--ink-2)" }
    : BRACKET_INFO[input.shot.kind === "focus" ? input.shot.focus : ""];
  el.classList.toggle("hidden", !frame || !info);
  if (!frame || !info) return;
  el.style.transform = `translate(${fit.tx + frame.x * fit.s}px, ${fit.ty + frame.y * fit.s}px)`;
  el.style.width = `${frame.w * fit.s}px`;
  el.style.height = `${frame.h * fit.s}px`;
  el.style.setProperty("--c", info.color);
  el.classList.toggle("r", input.focus !== "ana");
  const label = el.querySelector("span");
  if (label) label.textContent = info.label;
}

function placeLink(svg: SVGSVGElement | null, els: WorldEls, input: CameraInput): void {
  if (!svg) return;
  const id = input.shot.kind === "focus" ? input.shot.linkRowId : null;
  const row = rowEl(els, id);
  svg.classList.toggle("on", row !== null);
  if (!row || !id) return;
  const r = rectIn(row, els.world);
  const y1 = r.y + r.h / 2;
  const x1 = LANE_X.bank + 9;
  const c = rightColumn(input.hasEve);
  const termH = els.termInner?.offsetHeight ?? 120;
  const y2 = Math.min(Math.max(y1, c.termY + LINK_TOP_MIN), c.termY + termH - LINK_BOTTOM_GAP);
  const xm = c.termX - LINK_ELBOW;
  const bad = input.rows.get(id)?.type === "srv" && (input.rows.get(id) as Extract<DiagramRow, { type: "srv" }>).bad;
  svg.style.setProperty("--c", bad ? "var(--bad)" : "var(--bank)");
  svg.querySelector("path")?.setAttribute("d", `M${x1} ${y1} H${xm} V${y2} H${c.termX - 6}`);
  const [a, b] = svg.querySelectorAll("circle");
  a?.setAttribute("cx", String(x1));
  a?.setAttribute("cy", String(y1));
  b?.setAttribute("cx", String(c.termX - 6));
  b?.setAttribute("cy", String(y2));
}

/** Devuelve la posición de la tarjeta elegida por el encuadre. */
export function useCamera(refs: CameraRefs, input: CameraInput): CardPos {
  const [notePos, setNotePos] = useState<CardPos>("top");
  const phoneY = useRef(0);
  const inputRef = useRef(input);
  const firstRun = useRef(true);

  const apply = useCallback(
    (instant: boolean) => {
      const els = worldEls(refs);
      const stage = refs.stage.current;
      if (!els || !stage) return;
      const current = inputRef.current;
      const quick = instant || prefersReducedMotion();
      stage.classList.toggle("no-anim", quick);
      stage.style.setProperty("--cam-ms", `${quick ? 0 : Math.max(MIN_CAM_MS, CAM_MS / Math.sqrt(current.speed))}ms`);
      phoneY.current = anchorPhone(els, current.shot, phoneY.current);
      if (refs.phone.current) refs.phone.current.style.top = `${phoneY.current}px`;
      const geo = shotGeometry(els, current.shot, current.rows, current.hasEve, phoneY.current);
      const viewport = { vw: stage.clientWidth, vh: stage.clientHeight, noteH: refs.note.current?.offsetHeight ?? 160 };
      const fit = bestFit(geo.rect, geo.cards, viewport, geo.max);
      els.world.style.transform = `translate(${fit.tx}px, ${fit.ty}px) scale(${fit.s})`;
      setNotePos(fit.card);
      placeBrackets(refs.brackets.current, geo.frame, fit, current);
      placeLink(refs.link.current, els, current);
      if (quick) requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.remove("no-anim")));
    },
    [refs],
  );

  useLayoutEffect(() => {
    inputRef.current = input;
    apply(firstRun.current);
    firstRun.current = false;
  });

  useLayoutEffect(() => {
    const stage = refs.stage.current;
    const inner = refs.termInner.current;
    if (!stage) return undefined;
    const onResize = new ResizeObserver(() => apply(true));
    onResize.observe(stage);
    const onTerm = new ResizeObserver(() => apply(false));
    if (inner) onTerm.observe(inner);
    void document.fonts?.ready.then(() => apply(true));
    return () => {
      onResize.disconnect();
      onTerm.disconnect();
    };
  }, [apply, refs]);

  return notePos;
}
