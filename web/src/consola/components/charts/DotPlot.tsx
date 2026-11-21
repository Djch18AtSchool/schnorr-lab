/**
 * Gráfica de puntos por fila (Cleveland): una fila por categoría y un marcador por serie sobre un eje
 * común, lineal o logarítmico. Los valores fuera del eje se dibujan en el borde con su valor escrito.
 */
import type { ReactNode } from "react";
import { linearScale, logScale, type Scale } from "../../lib/charts";
import { useWidth } from "../../state/hooks";
import { tipHandlers, useTip } from "../Tooltip";
import { Marker, type SeriesStyle } from "./marks";
import type { Axis } from "./XYChart";

export interface DotPoint {
  series: string;
  value: number;
  tip?: ReactNode;
}

export interface DotRow {
  key: string;
  label: string;
  emphasis?: boolean;
  points: readonly DotPoint[];
}

export interface DotPlotProps {
  aria: string;
  rows: readonly DotRow[];
  series: readonly SeriesStyle[];
  x: Axis;
  refs?: ReadonlyArray<{ x: number; label: ReactNode }>;
  /** Texto junto a un punto que se sale del eje (p. ej. «10²⁹⁴ años →»). */
  clipLabel?: (value: number) => ReactNode;
  /** Une el menor y el mayor punto de cada fila (para ver la distancia entre series). */
  connect?: boolean;
  labelWidth?: number;
}

const ROW_H = 34;
const COMPACT_BELOW = 620;
const COMPACT_LABEL_H = 18;
const HIT_R = 13;

interface Layout {
  W: number;
  m: { l: number; r: number; t: number; b: number };
  rowH: number;
  compact: boolean;
}

function layoutFor(width: number, labelWidth: number, hasRefs: boolean): Layout {
  const W = Math.max(300, width);
  const compact = W < COMPACT_BELOW;
  return {
    W, compact, rowH: compact ? ROW_H + COMPACT_LABEL_H : ROW_H,
    m: { l: compact ? 10 : labelWidth, r: compact ? 18 : 28, t: hasRefs ? 30 : 10, b: 44 },
  };
}

function RowMarks({ row, cy, sx, x, series, clipLabel, connect }: { row: DotRow; cy: number; sx: Scale; x: Axis; series: readonly SeriesStyle[]; clipLabel?: (v: number) => ReactNode; connect?: boolean }) {
  const tip = useTip();
  const [lo, hi] = x.domain;
  const clamp = (v: number): number => sx(Math.min(hi, Math.max(lo, v)));
  const xs = row.points.map((p) => clamp(p.value));
  return (
    <>
      {connect && xs.length > 1 ? <line x1={Math.min(...xs)} x2={Math.max(...xs)} y1={cy} y2={cy} stroke="var(--faint)" strokeWidth={2} /> : null}
      {row.points.map((p) => {
        const style = series.find((s) => s.key === p.series);
        const cx = clamp(p.value);
        const clipped = p.value > hi;
        return (
          <g key={p.series} {...(p.tip ? tipHandlers(tip, p.tip) : {})}>
            {p.tip ? <circle className="hit" cx={cx} cy={cy} r={HIT_R} /> : null}
            <Marker shape={clipped ? "arrow" : style?.shape ?? "circle"} cx={cx} cy={cy} color={style?.color ?? "var(--fg)"} hollow={style?.hollow} />
            {clipped && clipLabel ? <text className="lbl strong" x={cx - 12} y={cy - 9} textAnchor="end">{clipLabel(p.value)}</text> : null}
          </g>
        );
      })}
    </>
  );
}

function Rows({ rows, L, sx, x, series, clipLabel, connect }: { rows: readonly DotRow[]; L: Layout; sx: Scale; x: Axis; series: readonly SeriesStyle[]; clipLabel?: (v: number) => ReactNode; connect?: boolean }) {
  const { m, W, rowH, compact } = L;
  return (
    <>
      {rows.map((row, i) => {
        const top = m.t + i * rowH;
        const cy = top + rowH - ROW_H / 2;
        return (
          <g key={row.key}>
            {row.emphasis ? <rect x={0} y={top + 1} width={W} height={rowH - 2} rx={5} className="band" /> : null}
            <line className="guide" x1={m.l} x2={W - m.r} y1={cy} y2={cy} />
            <text className={`rowlbl${row.emphasis ? " strong" : ""}`} x={compact ? m.l : 10} y={compact ? top + 15 : cy + 4.5}>{row.label}</text>
            <RowMarks row={row} cy={cy} sx={sx} x={x} series={series} clipLabel={clipLabel} connect={connect} />
          </g>
        );
      })}
    </>
  );
}

export function DotPlot({ aria, rows, series, x, refs = [], clipLabel, connect, labelWidth = 210 }: DotPlotProps) {
  const [ref, width] = useWidth<HTMLDivElement>(640);
  const L = layoutFor(width, labelWidth, refs.length > 0);
  const { W, m, rowH } = L;
  const H = m.t + rows.length * rowH + m.b;
  const sx = (x.log ? logScale : linearScale)(x.domain, [m.l + 6, W - m.r]);
  const bottom = H - m.b;
  return (
    <div ref={ref}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={aria}>
        <g className="grid">
          {x.ticks.map((v) => <g key={v}><line x1={sx(v)} x2={sx(v)} y1={m.t} y2={bottom} /><text x={sx(v)} y={bottom + 18} textAnchor="middle">{x.fmt(v)}</text></g>)}
        </g>
        {refs.map((r, i) => (
          <g key={i}>
            <line x1={sx(r.x)} x2={sx(r.x)} y1={m.t - 4} y2={bottom} stroke="var(--muted)" strokeWidth={1.2} strokeDasharray="3 4" />
            <text className="lbl" x={sx(r.x)} y={m.t - 10} textAnchor="middle">{r.label}</text>
          </g>
        ))}
        <Rows rows={rows} L={L} sx={sx} x={x} series={series} clipLabel={clipLabel} connect={connect} />
        <line className="axis" x1={m.l} x2={W - m.r} y1={bottom} y2={bottom} />
        <text className="lbl" x={m.l + (W - m.l - m.r) / 2} y={H - 4} textAnchor="middle">{x.title}</text>
      </svg>
    </div>
  );
}
