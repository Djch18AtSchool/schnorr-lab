/** Gráficas del resumen (SVG propio): peticiones apiladas por resultado, latencia p50/p95 y sparkline. */
import type { SeriesPoint } from "../../../shared/types";
import { latencyPoints, niceMax, pointTotal } from "../../lib/charts";
import { fmtClock, fmtHM } from "../../lib/format";
import { useWidth } from "../../state/hooks";
import { TipBody, tipHandlers, useTip } from "../Tooltip";

export const CATEGORIES = [
  { key: "other", label: "Otras (lecturas, retos, registros)", color: "var(--read)" },
  { key: "ok", label: "Acceso concedido", color: "var(--ok)" },
  { key: "rejected", label: "Acceso rechazado", color: "var(--bad)" },
  { key: "error", label: "Error 4xx", color: "var(--warn)" },
] as const;

const LABEL_EVERY = 10;

function roundTop(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function Grid({ left, right, top, height, max }: { left: number; right: number; top: number; height: number; max: number }) {
  return (
    <g className="grid">
      {[0, 0.5, 1].map((f) => {
        const y = top + height - f * height;
        return <g key={f}><line x1={left} x2={right} y1={y} y2={y} /><text x={left - 6} y={y + 3.5} textAnchor="end">{Math.round(max * f)}</text></g>;
      })}
    </g>
  );
}

function Bar({ point, x, width, scale, bottom }: { point: SeriesPoint; x: number; width: number; scale: (v: number) => number; bottom: number }) {
  const present = CATEGORIES.filter((c) => point[c.key] > 0);
  let acc = 0;
  return (
    <>
      {present.map((c, j) => {
        const h = scale(point[c.key]);
        const isTop = j === present.length - 1;
        const hh = Math.max(1, h - (isTop ? 0 : 2));
        const y = bottom - acc - h + (isTop ? 0 : 2);
        acc += h;
        return isTop
          ? <path key={c.key} d={roundTop(x, y, width, hh, Math.min(3, width / 2, hh))} fill={c.color} />
          : <rect key={c.key} x={x} y={y} width={width} height={hh} fill={c.color} />;
      })}
    </>
  );
}

export function RequestsChart({ series, bucketS }: { series: readonly SeriesPoint[]; bucketS: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(600);
  const tip = useTip();
  const W = Math.max(280, width);
  const H = 210;
  const m = { l: 30, r: 6, t: 8, b: 24 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const max = niceMax(Math.max(1, ...series.map(pointTotal)));
  const bw = iw / Math.max(1, series.length);
  const barW = Math.max(3, bw - Math.max(2, bw * 0.24));
  return (
    <div ref={ref}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Peticiones por intervalo de ${bucketS} segundos`}>
        <Grid left={m.l} right={W - m.r} top={m.t} height={ih} max={max} />
        {series.map((p, i) => (
          <g key={p.t}>
            <Bar point={p} x={m.l + i * bw + (bw - barW) / 2} width={barW} scale={(v) => (v / max) * ih} bottom={m.t + ih} />
            {i % LABEL_EVERY === 0 ? <text x={m.l + i * bw} y={H - 6}>{fmtHM(p.t)}</text> : null}
            <rect className="hit" x={m.l + i * bw} y={m.t} width={bw} height={ih} {...tipHandlers(tip,
              <TipBody title={`${fmtClock(p.t)} – ${fmtClock(p.t + bucketS)}`} rows={CATEGORIES.map((c) => ({ color: c.color, label: c.label, value: p[c.key] }))}
                footer={{ color: "", label: "Total", value: pointTotal(p) }} />)} />
          </g>
        ))}
        <text x={W - m.r} y={H - 6} textAnchor="end">ahora</text>
      </svg>
    </div>
  );
}

function linePath(points: ReadonlyArray<{ x: number; y: number } | null>): string {
  let pen = false;
  return points.map((p) => {
    if (!p) { pen = false; return ""; }
    const cmd = `${pen ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    pen = true;
    return cmd;
  }).join("");
}

export function LatencyChart({ series, bucketS }: { series: readonly SeriesPoint[]; bucketS: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(320);
  const tip = useTip();
  const W = Math.max(260, width);
  const H = 170;
  const m = { l: 34, r: 34, t: 10, b: 22 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const pts = latencyPoints(series);
  const max = Math.max(10, Math.ceil(Math.max(0, ...pts.map((p) => p?.p95 ?? 0)) / 5) * 5);
  const step = iw / Math.max(1, series.length);
  const x = (i: number): number => m.l + (i + 0.5) * step;
  const y = (v: number): number => m.t + ih - (v / max) * ih;
  const last = pts.reduce((found, p, i) => (p ? i : found), -1);
  const lastPoint = last >= 0 ? pts[last] : null;
  return (
    <div ref={ref}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Latencia p50 y p95 en milisegundos">
        <Grid left={m.l} right={W - m.r} top={m.t} height={ih} max={max} />
        <path d={linePath(pts.map((p, i) => (p ? { x: x(i), y: y(p.p95) } : null)))} fill="none" stroke="var(--s2)" strokeWidth={2} strokeLinejoin="round" />
        <path d={linePath(pts.map((p, i) => (p ? { x: x(i), y: y(p.p50) } : null)))} fill="none" stroke="var(--s1)" strokeWidth={2} strokeLinejoin="round" />
        {lastPoint ? (
          <g>
            <circle cx={x(last)} cy={y(lastPoint.p95)} r={3.5} fill="var(--s2)" stroke="var(--surface)" strokeWidth={2} />
            <circle cx={x(last)} cy={y(lastPoint.p50)} r={3.5} fill="var(--s1)" stroke="var(--surface)" strokeWidth={2} />
            <text className="lbl" x={x(last) + 8} y={y(lastPoint.p95) + 4}>p95</text>
            <text className="lbl" x={x(last) + 8} y={Math.max(y(lastPoint.p50), y(lastPoint.p95) + 13) + 4}>p50</text>
          </g>
        ) : null}
        {series.map((p, i) => {
          const pt = pts[i];
          const body = pt
            ? <TipBody title={`${fmtClock(p.t)} – ${fmtClock(p.t + bucketS)}`} rows={[{ color: "var(--s1)", label: "p50", value: `${pt.p50.toFixed(2)} ms` }, { color: "var(--s2)", label: "p95", value: `${pt.p95.toFixed(2)} ms` }]}
                footer={{ color: "", label: "Peticiones", value: pointTotal(p) }} />
            : <><b>{fmtClock(p.t)} – {fmtClock(p.t + bucketS)}</b><br />Sin peticiones</>;
          return (
            <g key={p.t}>
              {i % LABEL_EVERY === 0 ? <text x={m.l + i * step} y={H - 5}>{fmtHM(p.t)}</text> : null}
              <rect className="hit" x={m.l + i * step} y={m.t} width={step} height={ih} {...tipHandlers(tip, body)} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function Sparkline({ values, color }: { values: readonly number[]; color: string }) {
  const W = 120;
  const H = 26;
  const max = Math.max(1, ...values);
  const points = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * W},${H - 2 - (v / max) * (H - 4)}`).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
