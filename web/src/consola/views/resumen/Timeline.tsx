/**
 * Línea de tiempo por petición: cada punto es una petición real (x = hora, y = latencia), con la
 * forma de su dispositivo y el color de su resultado. Las peticiones de un mismo intento se unen
 * con una línea fina. Clic en un punto abre esa petición en Actividad.
 */
import type { RequestRecord } from "../../../shared/types";
import { Marker } from "../../components/charts/marks";
import { tipHandlers, useTip } from "../../components/Tooltip";
import type { Attempt } from "../../lib/attempts";
import { linearScale, type Scale } from "../../lib/charts";
import { ACTOR_COLOR, deviceInfo } from "../../lib/devices";
import { fmtClockMs, fmtMsShort } from "../../lib/format";
import { requestOutcome, type Tone } from "../../lib/requests";
import { PAUSE_PX, buildAxis, pauseLabel, type AxisSegment, type Span } from "../../lib/timeAxis";
import { latencyTicks, niceCeil, tickLabel, timeStep, timeTicks } from "../../lib/timeline";
import { useWidth } from "../../state/hooks";

export const TONE_COLOR: Readonly<Record<Tone, string>> = { ok: "var(--ok)", bad: "var(--bad)", warn: "var(--warn)", neutral: "var(--ink-3)" };

const H = 280;
const M = { l: 46, r: 18, t: 22, b: 30 };
const HIT_R = 9;
/** Una marca de tiempo cada ~110 px y ninguna pegada al borde de su tramo. */
const PX_PER_TICK = 110;
const TICK_EDGE_PX = 22;
/** Ancho mínimo de un tramo para rotular su hora de inicio cuando no caben marcas redondas. */
const MIN_LABEL_PX = 72;
/** En pantallas angostas la pausa ocupa a lo sumo esta fracción del ancho. */
const PAUSE_FRACTION = 0.07;

interface TimelineProps {
  visible: readonly RequestRecord[];
  attempts: readonly Attempt[];
  spans: readonly Span[];
  onOpen: (id: number) => void;
}

function Tip({ r }: { r: RequestRecord }) {
  const outcome = requestOutcome(r);
  return (
    <>
      <b>{r.method} {r.path}</b>
      <div className="row"><span>{deviceInfo(r.device).label}</span><em>{fmtClockMs(r.timestamp)}</em></div>
      <div className="row"><span><i style={{ background: TONE_COLOR[outcome.tone] }} />{outcome.label}</span><em>{fmtMsShort(r.duration_ms)}</em></div>
      <div className="tip-hint">Clic para ver lo que hizo el banco</div>
    </>
  );
}

function Point({ r, sx, sy, onOpen }: { r: RequestRecord; sx: Scale; sy: Scale; onOpen: (id: number) => void }) {
  const tip = useTip();
  const [x, y] = [sx(r.timestamp), sy(r.duration_ms)];
  const info = deviceInfo(r.device);
  const tone = requestOutcome(r).tone;
  const label = `${r.method} ${r.path}, ${requestOutcome(r).label}, ${fmtMsShort(r.duration_ms)}, ${info.label}`;
  const open = (): void => {
    tip.hide(); // el punto desaparece al cambiar de sección: su tooltip no debe quedar flotando
    onOpen(r.id);
  };
  return (
    <g className="pt" role="button" tabIndex={0} aria-label={label} onClick={open}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") open(); }} {...tipHandlers(tip, <Tip r={r} />)}>
      <circle className="hit" cx={x} cy={y} r={HIT_R} />
      <Marker shape={info.shape} cx={x} cy={y} color={TONE_COLOR[tone]} hollow={tone === "neutral"} size={4.5} />
    </g>
  );
}

function SegmentTicks({ seg, x }: { seg: AxisSegment; x: Scale }) {
  const domain: [number, number] = [seg.start, seg.end];
  const target = Math.max(1, Math.round((seg.x1 - seg.x0) / PX_PER_TICK));
  const step = timeStep(domain, target);
  const ticks = timeTicks(domain, target).filter((t) => x(t) - seg.x0 > TICK_EDGE_PX && seg.x1 - x(t) > TICK_EDGE_PX);
  if (!ticks.length) {
    if (seg.x1 - seg.x0 < MIN_LABEL_PX) return null;
    // Tramo demasiado angosto para marcas redondas: se rotula su hora de inicio.
    return <text x={(seg.x0 + seg.x1) / 2} y={H - M.b + 19} textAnchor="middle">{tickLabel(seg.start, 1)}</text>;
  }
  return <>{ticks.map((t) => <text key={t} x={x(t)} y={H - M.b + 19} textAnchor="middle">{tickLabel(t, step)}</text>)}</>;
}

function Pause({ seg }: { seg: AxisSegment }) {
  const mid = (seg.x0 + seg.x1) / 2;
  const zig = `M${mid - 4},${H - M.b - 5}l4,5l4,-5`;
  return (
    <g className="pause">
      <title>{`Sin peticiones durante ${pauseLabel(seg.end - seg.start)}`}</title>
      <rect x={seg.x0 + 3} y={M.t} width={seg.x1 - seg.x0 - 6} height={H - M.t - M.b} rx={6} />
      <path d={zig} />
      <text x={mid} y={H - M.b + 19} textAnchor="middle">{pauseLabel(seg.end - seg.start)}</text>
    </g>
  );
}

function Axes({ segments, x, maxMs, sy, width }: { segments: readonly AxisSegment[]; x: Scale; maxMs: number; sy: Scale; width: number }) {
  return (
    <g className="grid">
      {latencyTicks(maxMs).map((v) => (
        <g key={`y${v}`}><line x1={M.l} x2={width - M.r} y1={sy(v)} y2={sy(v)} /><text x={M.l - 8} y={sy(v) + 4} textAnchor="end">{v === 0 ? "0" : `${Number(v.toFixed(2))}`}</text></g>
      ))}
      <text x={M.l - 8} y={M.t - 10} textAnchor="end" className="unit">ms</text>
      {segments.map((seg) => (seg.kind === "pause" ? <Pause key={seg.start} seg={seg} /> : <SegmentTicks key={seg.start} seg={seg} x={x} />))}
      <text x={width - M.r} y={M.t - 10} textAnchor="end" className="unit">ahora</text>
      <line className="now" x1={width - M.r} x2={width - M.r} y1={M.t} y2={H - M.b} />
    </g>
  );
}

export function Timeline({ visible, attempts, spans, onOpen }: TimelineProps) {
  const [ref, measured] = useWidth<HTMLDivElement>(720);
  const width = Math.max(300, measured);
  const maxMs = niceCeil(Math.max(...visible.map((r) => r.duration_ms)) * 1.1);
  const axis = buildAxis(spans, [M.l, width - M.r], Math.min(PAUSE_PX, width * PAUSE_FRACTION));
  const sx = axis.x;
  const sy = linearScale([0, maxMs], [H - M.b, M.t]);
  const ids = new Set(visible.map((r) => r.id));
  const links = attempts.map((a) => ({ a, pts: a.requests.filter((r) => ids.has(r.id)) })).filter(({ pts }) => pts.length > 1);
  return (
    <div ref={ref} className="timeline">
      <svg className="chart" viewBox={`0 0 ${width} ${H}`} width={width} height={H} role="group" aria-label="Peticiones en el tiempo: latencia de cada una">
        <Axes segments={axis.segments} x={sx} maxMs={maxMs} sy={sy} width={width} />
        <line className="axis" x1={M.l} x2={width - M.r} y1={H - M.b} y2={H - M.b} />
        {links.map(({ a, pts }) => (
          <polyline key={a.key} className="link" points={pts.map((r) => `${sx(r.timestamp).toFixed(1)},${sy(r.duration_ms).toFixed(1)}`).join(" ")}
            stroke={ACTOR_COLOR[deviceInfo(a.device).actor]} />
        ))}
        {visible.map((r) => <Point key={r.id} r={r} sx={sx} sy={sy} onOpen={onOpen} />)}
      </svg>
    </div>
  );
}
