/**
 * Barras horizontales por fila, agrupadas (una barra por serie) o apiladas (segmentos de una barra),
 * con el valor escrito al final de cada barra y una nota opcional por fila. Eje lineal desde 0.
 */
import type { ReactNode } from "react";
import { linearScale, linearTicks, niceMax, type Scale } from "../../lib/charts";
import type { BarRowData } from "../../lib/labComparison";
import { useWidth } from "../../state/hooks";
import { tipHandlers, useTip } from "../Tooltip";
import type { SeriesStyle } from "./marks";

export interface BarRowsProps<R extends BarRowData> {
  aria: string;
  rows: readonly R[];
  series: readonly SeriesStyle[];
  mode: "grouped" | "stacked";
  title: string;
  value: (v: number) => string;
  /** Formato de las marcas del eje (por omisión, el mismo que el de los valores). */
  tick?: (v: number) => string;
  tip: (row: R, series: SeriesStyle) => ReactNode;
  note?: (row: R) => ReactNode;
  labelWidth?: number;
  /** Filas densas: barras finas sin el valor escrito (la nota de la fila lo resume). */
  dense?: boolean;
}

const BAR = 11;
const DENSE_BAR = 8;
const DENSE_PAD = 8;
const GAP = 2;
const STACK_BAR = 16;
const ROW_PAD = 16;
const COMPACT_BELOW = 620;
const COMPACT_LABEL_H = 18;
const COMPACT_NOTE_H = 16;

interface Geometry {
  W: number;
  compact: boolean;
  bar: number;
  pad: number;
  m: { l: number; r: number; t: number; b: number };
  rowH: number;
  sx: Scale;
}

function geometry<R extends BarRowData>(width: number, p: BarRowsProps<R>, max: number): Geometry {
  const W = Math.max(300, width);
  const compact = W < COMPACT_BELOW;
  const bar = p.dense ? DENSE_BAR : BAR;
  const pad = p.dense ? DENSE_PAD : ROW_PAD;
  const bars = p.mode === "grouped" ? p.series.length * (bar + GAP) - GAP : STACK_BAR;
  const m = { l: compact ? 10 : p.labelWidth ?? 210, r: compact ? 56 : p.note ? 190 : 64, t: 8, b: 40 };
  const noteLine = compact && p.note && p.mode === "stacked" ? COMPACT_NOTE_H : 0;
  return { W, compact, bar, pad, m, rowH: bars + pad + noteLine + (compact ? COMPACT_LABEL_H : 0), sx: linearScale([0, max], [m.l, W - m.r]) };
}

/** Rectángulo con el extremo de datos redondeado (el inicio queda anclado al eje). */
function barPath(x0: number, x1: number, y: number, h: number, round: boolean): string {
  const r = round ? Math.min(4, (x1 - x0) / 2, h / 2) : 0;
  return `M${x0},${y}H${x1 - r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 - r},${y + h}H${x0}Z`;
}

interface PartProps<R extends BarRowData> {
  row: R;
  top: number;
  g: Geometry;
  p: BarRowsProps<R>;
}

function Grouped<R extends BarRowData>({ row, top, g, p }: PartProps<R>) {
  const tip = useTip();
  const ends = p.series.map((s) => Math.max(g.m.l + 1, g.sx(row.values[s.key] ?? 0)));
  const height = p.series.length * (g.bar + GAP) - GAP;
  return (
    <>
      {p.series.map((s, j) => {
        const y = top + j * (g.bar + GAP);
        return (
          <g key={s.key} {...tipHandlers(tip, p.tip(row, s))}>
            <rect className="hit" x={g.m.l} y={y - 1} width={g.W - g.m.r - g.m.l} height={g.bar + 2} />
            <path d={barPath(g.m.l, ends[j], y, g.bar, true)} fill={s.color} />
            {p.dense ? null : <text className="val" x={ends[j] + 5} y={y + g.bar - 2}>{p.value(row.values[s.key] ?? 0)}</text>}
          </g>
        );
      })}
      {p.note && p.dense ? <text className="val" x={Math.max(...ends) + 8} y={top + height / 2 + 4}>{p.note(row)}</text> : null}
    </>
  );
}

function Stacked<R extends BarRowData>({ row, top, g, p }: PartProps<R>) {
  const tip = useTip();
  const present = p.series.filter((s) => (row.values[s.key] ?? 0) > 0);
  const ends = present.reduce<number[]>((acc, s) => [...acc, (acc[acc.length - 1] ?? 0) + (row.values[s.key] ?? 0)], []);
  return (
    <>
      {present.map((s, j) => {
        const x0 = g.sx(j ? ends[j - 1] : 0) + (j ? GAP / 2 : 0);
        const x1 = Math.max(x0 + 1, g.sx(ends[j]) - (j < present.length - 1 ? GAP / 2 : 0));
        return <path key={s.key} d={barPath(x0, x1, top, STACK_BAR, j === present.length - 1)} fill={s.color} {...tipHandlers(tip, p.tip(row, s))} />;
      })}
      {p.note && g.compact ? <text className="val" x={g.m.l} y={top + STACK_BAR + 14}>{p.note(row)}</text> : null}
      {p.note && !g.compact ? <text className="val" x={g.sx(ends[ends.length - 1] ?? 0) + 8} y={top + STACK_BAR - 4}>{p.note(row)}</text> : null}
    </>
  );
}

export function BarRows<R extends BarRowData>(p: BarRowsProps<R>) {
  const [ref, width] = useWidth<HTMLDivElement>(640);
  const totals = p.rows.map((r) => (p.mode === "stacked" ? p.series.reduce((sum, s) => sum + (r.values[s.key] ?? 0), 0) : Math.max(0, ...p.series.map((s) => r.values[s.key] ?? 0))));
  const max = niceMax(Math.max(1, ...totals));
  const g = geometry(width, p, max);
  const H = g.m.t + p.rows.length * g.rowH + g.m.b;
  const bottom = H - g.m.b;
  return (
    <div ref={ref}>
      <svg className="chart" viewBox={`0 0 ${g.W} ${H}`} width={g.W} height={H} role="img" aria-label={p.aria}>
        <g className="grid">
          {linearTicks(max).map((v) => <g key={v}><line x1={g.sx(v)} x2={g.sx(v)} y1={g.m.t} y2={bottom} /><text x={g.sx(v)} y={bottom + 18} textAnchor="middle">{(p.tick ?? p.value)(v)}</text></g>)}
        </g>
        {p.rows.map((row, i) => {
          const top = g.m.t + i * g.rowH;
          const barTop = top + g.pad / 2 + (g.compact ? COMPACT_LABEL_H : 0);
          const mid = barTop + (p.mode === "grouped" ? (p.series.length * (g.bar + GAP) - GAP) / 2 : STACK_BAR / 2);
          return (
            <g key={row.key}>
              {row.emphasis ? <rect x={0} y={top + 1} width={g.W} height={g.rowH - 2} rx={5} className="band" /> : null}
              <text className={`rowlbl${row.emphasis ? " strong" : ""}`} x={g.compact ? g.m.l : 10} y={g.compact ? top + 17 : mid + 4.5}>{row.label}</text>
              {p.mode === "grouped" ? <Grouped row={row} top={barTop} g={g} p={p} /> : <Stacked row={row} top={barTop} g={g} p={p} />}
            </g>
          );
        })}
        <line className="axis" x1={g.m.l} x2={g.m.l} y1={g.m.t} y2={bottom} />
        <text className="lbl" x={g.m.l + (g.W - g.m.l - g.m.r) / 2} y={H - 4} textAnchor="middle">{p.title}</text>
      </svg>
    </div>
  );
}
