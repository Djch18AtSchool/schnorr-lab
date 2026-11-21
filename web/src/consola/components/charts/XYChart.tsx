/** Gráfica xy (ejes lineales o logarítmicos) para los resultados del laboratorio, con tooltip por punto. */
import type { ReactNode } from "react";
import { linearScale, logScale, type Scale, type XY } from "../../lib/charts";
import { useWidth } from "../../state/hooks";
import { tipHandlers, useTip } from "../Tooltip";
import { Marker, type Shape } from "./marks";

export type { Shape } from "./marks";

export interface XYSeries {
  key: string;
  color: string;
  points: ReadonlyArray<XY & { tip?: ReactNode }>;
  line?: boolean;
  dash?: string;
  shape?: Shape;
  hollow?: boolean;
}

export interface XYLabel {
  x: number;
  y: number;
  text: ReactNode;
  dx?: number;
  dy?: number;
  anchor?: "start" | "end" | "middle";
  strong?: boolean;
}

export interface Axis {
  domain: readonly [number, number];
  ticks: readonly number[];
  fmt: (value: number) => ReactNode;
  title: string;
  log?: boolean;
}

export interface XYChartProps {
  aria: string;
  height: number;
  margin: { l: number; r: number; t: number; b: number };
  x: Axis;
  y: Axis;
  series: readonly XYSeries[];
  labels?: readonly XYLabel[];
  refs?: ReadonlyArray<{ y: number; label: ReactNode }>;
}

/** Radio del área sensible al puntero alrededor de cada marcador (más grande que la marca). */
const HIT_R = 13;

const scaleFor = (axis: Axis, range: readonly [number, number]): Scale => (axis.log ? logScale : linearScale)(axis.domain, range);

function Points({ series, sx, sy }: { series: readonly XYSeries[]; sx: Scale; sy: Scale }) {
  const tip = useTip();
  return (
    <>
      {series.filter((s) => s.shape).map((s) => s.points.map((p) => (
        <g key={`m${s.key}${p.x}`} {...(p.tip ? tipHandlers(tip, p.tip) : {})}>
          {p.tip ? <circle className="hit" cx={sx(p.x)} cy={sy(p.y)} r={HIT_R} /> : null}
          <Marker shape={s.shape ?? "circle"} cx={sx(p.x)} cy={sy(p.y)} color={s.color} hollow={s.hollow} />
        </g>
      )))}
    </>
  );
}

export function XYChart({ aria, height, margin: m, x, y, series, labels = [], refs = [] }: XYChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>(480);
  const W = Math.max(280, width);
  const H = height;
  const sx = scaleFor(x, [m.l, W - m.r]);
  const sy = scaleFor(y, [H - m.b, m.t]);
  return (
    <div ref={ref}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={aria}>
        <g className="grid">
          {y.ticks.map((v) => <g key={`y${v}`}><line x1={m.l} x2={W - m.r} y1={sy(v)} y2={sy(v)} /><text x={m.l - 7} y={sy(v) + 4} textAnchor="end">{y.fmt(v)}</text></g>)}
          {x.ticks.map((v) => <text key={`x${v}`} x={sx(v)} y={H - m.b + 18} textAnchor="middle">{x.fmt(v)}</text>)}
        </g>
        <line className="axis" x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} />
        <text x={m.l + (W - m.l - m.r) / 2} y={H - 4} textAnchor="middle" className="lbl">{x.title}</text>
        <text x={4} y={m.t - 12} className="lbl">{y.title}</text>
        {refs.map((r, i) => (
          <g key={i}>
            <line x1={m.l} x2={W - m.r} y1={sy(r.y)} y2={sy(r.y)} stroke="var(--faint)" strokeWidth={1.2} strokeDasharray="2 4" />
            <text className="lbl" x={m.l + 6} y={sy(r.y) - 6}>{r.label}</text>
          </g>
        ))}
        {series.filter((s) => s.line !== false && s.points.length > 1).map((s) => (
          <path key={`l${s.key}`} d={s.points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("")}
            fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} strokeLinejoin="round" />
        ))}
        <Points series={series} sx={sx} sy={sy} />
        {labels.map((l, i) => (
          <text key={i} className={`lbl${l.strong ? " strong" : ""}`} x={sx(l.x) + (l.dx ?? 0)} y={sy(l.y) + (l.dy ?? 0)} textAnchor={l.anchor ?? "start"}>{l.text}</text>
        ))}
      </svg>
    </div>
  );
}
