/**
 * Eje x de la línea de tiempo con pausas comprimidas: los tramos con actividad usan una escala
 * lineal propia y cada pausa larga (sin peticiones) se dibuja como un corte angosto rotulado con su
 * duración. Así una ráfaga de medio segundo de hace 20 minutos se lee igual de bien que la de ahora,
 * sin inventar ni mover ningún punto. Funciones puras.
 */

export interface Span {
  kind: "activity" | "pause";
  start: number;
  end: number;
  /** Peticiones del tramo (0 en una pausa). */
  count: number;
}

export interface AxisSegment extends Span {
  x0: number;
  x1: number;
}

export interface TimeAxis {
  segments: readonly AxisSegment[];
  x: (ts: number) => number;
}

/** Más de esto sin peticiones es una pausa (se comprime). */
export const PAUSE_S = 30;
/** Ancho en píxeles de una pausa comprimida. */
export const PAUSE_PX = 36;
const MIN_PAD_S = 0.4;
const PAD_FRACTION = 0.06;

const padOf = (start: number, end: number): number => Math.max(MIN_PAD_S, (end - start) * PAD_FRACTION);

/** Tramos de actividad y pausas desde la primera petición hasta ahora (null si no hay peticiones). */
export function activitySpans(timestamps: readonly number[], now: number, pauseS = PAUSE_S): Span[] | null {
  if (!timestamps.length) return null;
  const sorted = [...timestamps].sort((a, b) => a - b);
  const groups = sorted.reduce<number[][]>((acc, ts) => {
    const last = acc[acc.length - 1];
    if (last && ts - last[last.length - 1] <= pauseS) return [...acc.slice(0, -1), [...last, ts]];
    return [...acc, [ts]];
  }, []);
  const spans = groups.flatMap((g, i): Span[] => {
    const pad = padOf(g[0], g[g.length - 1]);
    const activity: Span = { kind: "activity", start: g[0] - pad, end: g[g.length - 1] + pad, count: g.length };
    const next = groups[i + 1];
    return next ? [activity, { kind: "pause", start: activity.end, end: next[0] - padOf(next[0], next[next.length - 1]), count: 0 }] : [activity];
  });
  const last = spans[spans.length - 1];
  if (now - last.end > pauseS) return [...spans, { kind: "pause", start: last.end, end: now, count: 0 }];
  return [...spans.slice(0, -1), { ...last, end: Math.max(last.end, now) }];
}

/** Reparte el ancho: pausas fijas; tramos de actividad por mitades según duración y según peticiones. */
export function buildAxis(spans: readonly Span[], [px0, px1]: readonly [number, number], pausePx = PAUSE_PX): TimeAxis {
  const activity = spans.filter((s) => s.kind === "activity");
  const pauses = spans.length - activity.length;
  const free = Math.max(0, px1 - px0 - pauses * pausePx);
  const totalS = activity.reduce((sum, s) => sum + (s.end - s.start), 0) || 1;
  const totalN = activity.reduce((sum, s) => sum + s.count, 0) || 1;
  const widthOf = (s: Span): number => (s.kind === "pause" ? pausePx : free * (0.5 * ((s.end - s.start) / totalS) + 0.5 * (s.count / totalN)));
  const segments = spans.reduce<AxisSegment[]>((acc, s) => {
    const x0 = acc.length ? acc[acc.length - 1].x1 : px0;
    return [...acc, { ...s, x0, x1: x0 + widthOf(s) }];
  }, []);
  const x = (ts: number): number => {
    const seg = segments.find((s) => ts <= s.end) ?? segments[segments.length - 1];
    const span = seg.end - seg.start || 1;
    return seg.x0 + ((Math.min(Math.max(ts, seg.start), seg.end) - seg.start) / span) * (seg.x1 - seg.x0);
  };
  return { segments, x };
}

/** «45 s», «4 min», «1 h 20 min»: la duración de una pausa. */
export function pauseLabel(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 90) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
