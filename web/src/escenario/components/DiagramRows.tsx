/** Filas del diagrama: mensaje entre carriles, cálculo en un carril y actividad del banco. */
import { useLayoutEffect, useRef, type CSSProperties, type RefObject } from "react";
import type { DiagramRow, RowView } from "../model/types";
import { Icon } from "./icons";
import { isRightward, LANE_COLOR, LANE_INK, LANE_X, midX } from "./layout";
import { MathText } from "./MathText";
import { play, useMotionSettings } from "./motion";

type MsgRow = Extract<DiagramRow, { type: "msg" }>;
type LocalRow = Extract<DiagramRow, { type: "local" }>;
type SrvRow = Extract<DiagramRow, { type: "srv" }>;

const ARROW_DRAW_MS = 700;
const PACKET_MS = 800;
/** La cámara llega primero; después viaja el mensaje. */
const LEAD_MS = 450;

function rowClass(base: string, view: RowView, compact: boolean): string {
  return [base, compact ? "cpt" : "", view.dim ? "dim" : "", view.now ? "now" : ""].filter(Boolean).join(" ");
}

function crossesNet(row: MsgRow): boolean {
  const lo = Math.min(LANE_X[row.from], LANE_X[row.to]);
  const hi = Math.max(LANE_X[row.from], LANE_X[row.to]);
  return lo < LANE_X.net && hi > LANE_X.net;
}

function Arrow({ row }: { row: MsgRow }) {
  const left = Math.min(LANE_X[row.from], LANE_X[row.to]);
  const width = Math.abs(LANE_X[row.to] - LANE_X[row.from]);
  return (
    <div className="arrow" style={{ left, width }}>
      <span className="line" />
      <span className="src" />
      <span className={isRightward(row.from, row.to) ? "head-r" : "head-l"} />
    </div>
  );
}

function Packet({ row }: { row: MsgRow }) {
  return (
    <div className={`packet${row.copied ? " copied" : ""}`} style={{ left: midX(row.from, row.to) }}>
      <span className="badge">copiado por Eve</span>
      {row.verdict && (
        <div className={`verdict ${row.verdict.ok ? "ok" : "bad"}`}>
          <Icon name={row.verdict.ok ? "check" : "x"} />
          {row.verdict.text}
        </div>
      )}
      {row.body && row.body.length > 0 ? (
        <div className="kv">
          {row.body.map((kv) => (
            <span key={kv.key} className="kv-pair">
              <span className="k">{kv.key}</span>
              <span className="v">{kv.value}</span>
            </span>
          ))}
        </div>
      ) : (
        !row.verdict && <div className="empty">Sin cuerpo: solo pide datos públicos</div>
      )}
    </div>
  );
}

function useMessageReveal(ref: RefObject<HTMLDivElement | null>, row: MsgRow, fresh: boolean): void {
  const settings = useMotionSettings();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!fresh || !el) return undefined;
    const right = isRightward(row.from, row.to);
    const dx = LANE_X[row.from] - midX(row.from, row.to);
    const stops = [
      play(el.querySelector(".arrow"), { clipPath: [right ? "inset(0 100% 0 0)" : "inset(0 0 0 100%)", "inset(0 0 0 0)"] }, { ms: ARROW_DRAW_MS, delayMs: LEAD_MS, ease: [0.45, 0, 0.3, 1] }, settings),
      play(el.querySelector(".arrow-label, .c-label"), { opacity: [0, 1] }, { ms: 280, delayMs: LEAD_MS + 160 }, settings),
      play(el.querySelector(".xnet"), { transform: ["scale(0)", "scale(1)"] }, { ms: 220, delayMs: LEAD_MS + ARROW_DRAW_MS * 0.42 }, settings),
      play(el.querySelector(".packet"), { transform: [`translateX(calc(-50% + ${dx}px)) scale(.9)`, "translateX(-50%) scale(1)"], opacity: [0, 1, 1] }, { ms: PACKET_MS, delayMs: LEAD_MS }, settings),
      play(el.querySelector(".tapline"), { clipPath: ["inset(-6px 100% -6px 0)", "inset(-6px 0 -6px 0)"] }, { ms: 420, delayMs: LEAD_MS + ARROW_DRAW_MS * 0.45 }, settings),
      play(el.querySelector(".packet .badge"), { opacity: [0, 1], transform: ["translateY(4px)", "none"] }, { ms: 260, delayMs: LEAD_MS + PACKET_MS }, settings),
    ];
    return () => stops.forEach((stop) => stop());
  }, [ref, row, fresh, settings]);
}

export function MessageRow({ view, compact }: { view: RowView; compact: boolean }) {
  const row = view.row as MsgRow;
  const ref = useRef<HTMLDivElement>(null);
  useMessageReveal(ref, row, view.fresh);
  const style = { "--c": LANE_COLOR[row.from], "--c-ink": LANE_INK[row.from] } as CSSProperties;
  const dir = isRightward(row.from, row.to) ? "dir-r" : "dir-l";
  const isStatus = /^\d+$/.test(row.lead);
  const tag = row.tag ? <span className="tag">{row.tag}</span> : null;
  const mid = midX(row.from, row.to);
  const showCard = !compact && (row.body !== null || row.verdict !== null);
  return (
    <div ref={ref} className={rowClass(`row msg ${dir}${showCard ? "" : " nocard"}`, view, compact)} style={style} data-row={row.id}>
      {row.tap && <span className="tapline" />}
      <Arrow row={row} />
      {crossesNet(row) && <span className="xnet" />}
      {compact ? (
        <div className="c-label" style={{ left: mid }}>
          <b>{row.lead}</b> <MathText text={row.short} />
          {tag}
        </div>
      ) : (
        <div className="arrow-label" style={{ left: mid }}>
          <span className={isStatus ? (row.verdict?.ok === false || Number(row.lead) >= 400 ? "st bad" : "st") : "verb"}>{row.lead}</span> {row.label}
          {tag}
        </div>
      )}
      {showCard && <Packet row={row} />}
    </div>
  );
}

export function LocalRowView({ view, compact }: { view: RowView; compact: boolean }) {
  const row = view.row as LocalRow;
  const ref = useRef<HTMLDivElement>(null);
  const settings = useMotionSettings();
  useLayoutEffect(() => {
    if (!view.fresh) return undefined;
    return play(ref.current?.querySelector(".mark, .c-side") ?? null, { opacity: [0, 1], transform: ["translateY(-6px)", "none"] }, { ms: 340, delayMs: LEAD_MS }, settings);
  }, [view.fresh, settings]);
  const style = { "--c": LANE_COLOR[row.at], "--c-ink": LANE_INK[row.at] } as CSSProperties;
  return (
    <div ref={ref} className={rowClass("row local", view, compact)} style={style} data-row={row.id}>
      {compact ? (
        <div className={`c-side at-${row.at}`}>
          <i />
          <MathText text={row.short} />
        </div>
      ) : (
        <div className={`mark at-${row.at}`}>
          <Icon name={row.icon} />
          {row.label}
          {row.fact && row.fact !== row.label && <b>{row.fact}</b>}
        </div>
      )}
    </div>
  );
}

export function ServerRowView({ view, compact, linked }: { view: RowView; compact: boolean; linked: boolean }) {
  const row = view.row as SrvRow;
  const ref = useRef<HTMLDivElement>(null);
  const settings = useMotionSettings();
  useLayoutEffect(() => {
    if (!view.fresh || !ref.current) return undefined;
    const stops = [
      play(ref.current.querySelector(".activation"), { transform: ["scaleY(0)", "scaleY(1)"] }, { ms: 300, delayMs: LEAD_MS }, settings),
      play(ref.current.querySelector(".c-side"), { opacity: [0, 1] }, { ms: 300, delayMs: LEAD_MS + 120 }, settings),
    ];
    return () => stops.forEach((stop) => stop());
  }, [view.fresh, settings]);
  const style = { "--c": row.bad ? "var(--bad)" : "var(--bank)" } as CSSProperties;
  const cls = `row srv cpt${compact ? "" : " open"}${row.bad ? " is-bad" : ""}${linked ? " linked" : ""}`;
  return (
    <div ref={ref} className={rowClass(cls, view, false)} style={style} data-row={row.id}>
      <span className="activation" />
      <div className="c-side at-bank">
        <MathText text={row.short} />
        <i />
      </div>
    </div>
  );
}
