/**
 * Datos de las gráficas: escalas (lineal y logarítmica) y conversión de results/*.json a series. Funciones puras; el dibujo SVG vive en components/charts.
 */
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

/** Dominio logarítmico que cubre los valores, ajustado a potencias de 10. */
export function logDomain(values: readonly number[], pad = 0): [number, number] {
  const positive = values.filter((v) => v > 0 && Number.isFinite(v));
  if (!positive.length) return [1, 10];
  const lo = Math.floor(Math.log10(Math.min(...positive))) - pad;
  const hi = Math.ceil(Math.log10(Math.max(...positive))) + pad;
  return [10 ** lo, 10 ** (hi > lo ? hi : lo + 1)];
}

/** Potencias de 10 dentro del dominio, saltando de `step` en `step` exponentes. */
export function powerTicks([d0, d1]: readonly [number, number], step = 1): number[] {
  const lo = Math.ceil(Math.log10(d0) - 1e-9);
  const hi = Math.floor(Math.log10(d1) + 1e-9);
  return Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => 10 ** (lo + i * step));
}

/** Marcas lineales "redondas" de 0 a max (max ya pasado por niceMax). */
export function linearTicks(max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, i) => (max * i) / count);
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
