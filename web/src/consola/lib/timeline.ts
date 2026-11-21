/**
 * Rangos y marcas de la línea de tiempo por petición (x = hora, y = latencia). El eje con pausas
 * comprimidas vive en timeAxis.ts. Funciones puras.
 */
export type RangeKey = "1m" | "5m" | "15m" | "todo";

export interface RangeOption {
  key: RangeKey;
  label: string;
  seconds: number | null;
}

export const RANGES: readonly RangeOption[] = [
  { key: "1m", label: "1 min", seconds: 60 },
  { key: "5m", label: "5 min", seconds: 300 },
  { key: "15m", label: "15 min", seconds: 900 },
  { key: "todo", label: "Todo", seconds: null },
];

const TIME_STEPS_S = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];
const NICE_FACTORS = [1, 2, 2.5, 5, 10];

/** Inicio del rango (epoch s) o null si es «todo». */
export function rangeStart(range: RangeKey, now: number): number | null {
  const seconds = RANGES.find((r) => r.key === range)?.seconds ?? null;
  return seconds === null ? null : now - seconds;
}

export function inRange<T extends { timestamp: number }>(items: readonly T[], range: RangeKey, now: number): T[] {
  const since = rangeStart(range, now);
  return since === null ? [...items] : items.filter((item) => item.timestamp >= since);
}

/** Paso de las marcas de tiempo para que entren unas `target` en el dominio. */
export function timeStep([t0, t1]: readonly [number, number], target = 6): number {
  const raw = (t1 - t0) / Math.max(1, target);
  return TIME_STEPS_S.find((step) => step >= raw) ?? TIME_STEPS_S[TIME_STEPS_S.length - 1];
}

export function timeTicks(domain: readonly [number, number], target = 6): number[] {
  const step = timeStep(domain, target);
  const first = Math.ceil(domain[0] / step) * step;
  const count = Math.floor((domain[1] - first) / step) + 1;
  return Array.from({ length: Math.max(0, count) }, (_, i) => Number((first + i * step).toFixed(3)));
}

/** Máximo «redondo» que cubre el valor, también para fracciones: 0.5, 1, 2, 2.5, 5, 10… */
export function niceCeil(value: number): number {
  if (!(value > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const factor = NICE_FACTORS.find((f) => f * magnitude >= value - 1e-12) ?? 10;
  return Number((factor * magnitude).toPrecision(6));
}

export function latencyTicks(max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, i) => Number(((max * i) / count).toPrecision(6)));
}

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** Etiqueta de una marca: con décimas si el paso es menor a un segundo, sin segundos si es de minutos. */
export function tickLabel(ts: number, step: number): string {
  const d = new Date(ts * 1000);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (step >= 60) return hm;
  const s = `${hm}:${pad(d.getSeconds())}`;
  return step < 1 ? `${s}.${Math.floor(d.getMilliseconds() / 100)}` : s;
}
