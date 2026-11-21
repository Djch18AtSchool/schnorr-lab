/**
 * Datos de las gráficas: escalas (lineal y logarítmica), totales por intervalo y conversión de
 * results/*.json a series. Funciones puras; el dibujo SVG vive en components/charts.
 */
import type { SeriesPoint } from "../../shared/types";
import type { BsgsResults, LatencyResults, LatencyRow } from "../data/source";

export type Scale = (value: number) => number;

export function linearScale([d0, d1]: readonly [number, number], [r0, r1]: readonly [number, number]): Scale {
  const span = d1 - d0 || 1;
  return (value) => r0 + ((value - d0) / span) * (r1 - r0);
}

export function logScale([d0, d1]: readonly [number, number], [r0, r1]: readonly [number, number]): Scale {
  const a = Math.log10(d0);
  const span = Math.log10(d1) - a || 1;
  return (value) => r0 + ((Math.log10(value) - a) / span) * (r1 - r0);
}

/** Máximo "redondo" para el eje: 4, 10, 20, 50, 100... */
export function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const f = value / magnitude;
  return (f <= 2 ? 2 : f <= 5 ? 5 : 10) * magnitude;
}

export const pointTotal = (p: SeriesPoint): number => p.ok + p.rejected + p.other + p.error;

/** Agrupa la serie del resumen en minutos (para la mini gráfica de peticiones por minuto). */
export function perMinute(series: readonly SeriesPoint[], bucketS: number): number[] {
  const per = Math.max(1, Math.round(60 / Math.max(1, bucketS)));
  const groups = Math.ceil(series.length / per);
  return Array.from({ length: groups }, (_, i) => series.slice(i * per, (i + 1) * per).reduce((sum, p) => sum + pointTotal(p), 0));
}

/** Puntos de latencia con huecos donde no hubo peticiones (para no dibujar ceros falsos). */
export function latencyPoints(series: readonly SeriesPoint[]): Array<{ p50: number; p95: number } | null> {
  return series.map((p) => (pointTotal(p) > 0 ? { p50: p.p50_ms, p95: p.p95_ms } : null));
}

// ---------------------------------------------------------------- laboratorio

export interface XY {
  x: number;
  y: number;
  label?: string;
}

export interface LatencyGroup {
  name: string;
  family: string;
  bitsP: number;
  bitsQ: number;
  security: string;
  ms: Readonly<Record<string, number>>;
}

export const BACKENDS = ["propia", "nativa", "gmpy2"] as const;

/** Filas por grupo con la mediana en milisegundos de cada aritmética, en el orden del archivo. */
export function latencyGroups(results: LatencyResults): LatencyGroup[] {
  const order: string[] = [];
  const byName = new Map<string, LatencyRow[]>();
  for (const row of results.rows) {
    if (!byName.has(row.name)) order.push(row.name);
    byName.set(row.name, [...(byName.get(row.name) ?? []), row]);
  }
  return order.map((name) => {
    const rows = byName.get(name) ?? [];
    const first = rows[0];
    return {
      name,
      family: first.family,
      bitsP: first.bits_p,
      bitsQ: first.bits_q,
      security: first.security_bits,
      ms: Object.fromEntries(rows.map((r) => [r.backend, r.median_s * 1000])),
    };
  });
}

export interface LatencySeries {
  backend: string;
  safe: XY[];
  schnorr: XY[];
}

/** Una serie por aritmética: primos seguros (línea continua) y grupos de Schnorr (punteada). */
export function latencySeries(groups: readonly LatencyGroup[]): LatencySeries[] {
  const points = (family: (g: LatencyGroup) => boolean, backend: string): XY[] =>
    groups.filter((g) => family(g) && g.ms[backend] != null).map((g) => ({ x: g.bitsP, y: g.ms[backend], label: g.name }));
  return BACKENDS.map((backend) => ({
    backend,
    safe: points((g) => g.family !== "schnorr", backend),
    schnorr: points((g) => g.family === "schnorr", backend),
  }));
}

export interface BsgsSeries {
  measured: XY[];
  predicted: Array<XY & { years: number }>;
  fitSolid: XY[];
  fitDashed: XY[];
  secondsPerOp: number;
}

/** Pasos de BSGS ≈ 1.5·2^(q/2): el ajuste medido y su extrapolación hasta q = 256. */
export function bsgsSeries(results: BsgsResults): BsgsSeries {
  const perOp = results.fit.seconds_per_operation;
  const fit = (q: number): XY => ({ x: q, y: 1.5 * 2 ** (q / 2) * perOp });
  const measuredQ = results.rows.map((r) => r.q_bits);
  const lastMeasured = measuredQ.length ? Math.max(...measuredQ) : 40;
  const firstMeasured = measuredQ.length ? Math.min(...measuredQ) : 16;
  const lastPredicted = Math.max(lastMeasured, ...results.predictions.map((p) => p.q_bits));
  const between = [lastMeasured, 100, 160, 224, lastPredicted].filter((q, i, all) => q >= lastMeasured && q <= lastPredicted && all.indexOf(q) === i);
  return {
    measured: results.rows.map((r) => ({ x: r.q_bits, y: r.seconds })),
    predicted: results.predictions.map((p) => ({ x: p.q_bits, y: p.seconds, years: p.years })),
    fitSolid: [firstMeasured, (firstMeasured + lastMeasured) / 2, lastMeasured].map(fit),
    fitDashed: between.map(fit),
    secondsPerOp: perOp,
  };
}

/** Potencias de 10 entre dos valores, saltando de `step` en `step` exponentes. */
export function decadeTicks(min: number, max: number, step = 1): number[] {
  const from = Math.ceil(Math.log10(min));
  const to = Math.floor(Math.log10(max));
  const count = Math.max(0, Math.floor((to - from) / step) + 1);
  return Array.from({ length: count }, (_, i) => 10 ** (from + i * step));
}
