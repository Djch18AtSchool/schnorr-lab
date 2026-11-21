/**
 * Agregaciones de telemetría: el mismo cálculo que hace el banco en /telemetry/summary (la fuente
 * simulada lo usa para devolver el contrato) y textos derivados para los indicadores.
 */
import type { RequestRecord, RouteStats, SeriesPoint, TelemetrySummary } from "../../shared/types";
import { outcomeOf } from "./requests";

export function quantile(values: readonly number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Los flujos SSE quedan abiertos: no cuentan para la latencia. */
const isTimed = (r: RequestRecord): boolean => !r.path.endsWith("/events/stream");

function seriesPoint(t: number, rows: readonly RequestRecord[]): SeriesPoint {
  const lat = rows.filter(isTimed).map((r) => r.duration_ms);
  const count = (kind: string): number => rows.filter((r) => outcomeOf(r) === kind).length;
  return { t, ok: count("granted"), rejected: count("denied"), other: count("other"), error: count("error"),
    p50_ms: quantile(lat, 0.5), p95_ms: quantile(lat, 0.95) };
}

export function bucketize(rows: readonly RequestRecord[], now: number, windowS: number, bucketS: number): SeriesPoint[] {
  const n = Math.round(windowS / bucketS);
  const start = Math.floor((now - windowS) / bucketS) * bucketS + bucketS;
  const groups = Array.from({ length: n }, () => [] as RequestRecord[]);
  for (const r of rows) {
    const i = Math.floor((r.timestamp - start) / bucketS);
    if (i >= 0 && i < n) groups[i].push(r);
  }
  return groups.map((group, i) => seriesPoint(start + i * bucketS, group));
}

function routeStats(rows: readonly RequestRecord[]): RouteStats[] {
  const keys = [...new Set(rows.map((r) => `${r.method} ${r.route}`))];
  return keys.map((key) => {
    const group = rows.filter((r) => `${r.method} ${r.route}` === key);
    const lat = group.filter(isTimed).map((r) => r.duration_ms);
    return { method: group[0].method, route: group[0].route, count: group.length,
      errors: group.filter((r) => r.status >= 400).length, p50_ms: quantile(lat, 0.5), p95_ms: quantile(lat, 0.95) };
  });
}

function countSignals(rows: readonly RequestRecord[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, r) => (r.signal ? { ...acc, [r.signal]: (acc[r.signal] ?? 0) + 1 } : acc), {});
}

export interface SummaryInput {
  requests: readonly RequestRecord[];
  now: number;
  startedAt: number;
  windowS: number;
  bucketS: number;
  lockedAccounts: number;
}

export function summarize(input: SummaryInput): TelemetrySummary {
  const { now, windowS, bucketS } = input;
  const win = input.requests.filter((r) => r.timestamp >= now - windowS && r.timestamp <= now);
  const lat = win.filter(isTimed).map((r) => r.duration_ms);
  const outcomes = win.map(outcomeOf);
  return {
    now, started_at: input.startedAt, window_s: windowS, bucket_s: bucketS,
    requests_per_min: win.filter((r) => r.timestamp >= now - 60).length,
    p50_ms: quantile(lat, 0.5), p95_ms: quantile(lat, 0.95),
    totals: {
      requests: win.length,
      auth_ok: outcomes.filter((o) => o === "granted").length,
      auth_rejected: outcomes.filter((o) => o === "denied").length,
      locked_accounts: input.lockedAccounts,
      errors_4xx: win.filter((r) => r.status >= 400 && r.status < 500).length,
      errors_5xx: win.filter((r) => r.status >= 500).length,
    },
    signals: countSignals(win),
    series: bucketize(win, now, windowS, bucketS),
    routes: routeStats(win),
  };
}

const SIGNAL_LABELS: Readonly<Record<string, string>> = {
  "auth.rejected": "congruencia",
  "auth.replay": "repetidas",
  "auth.locked": "bloqueadas",
  "auth.stale": "m vencida",
};

/** "4 congruencia, 2 repetidas": las dos causas de rechazo más frecuentes. */
export function rejectionText(signals: Readonly<Record<string, number>>): string {
  return Object.entries(signals)
    .filter(([signal, n]) => SIGNAL_LABELS[signal] && n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([signal, n]) => `${n} ${SIGNAL_LABELS[signal]}`)
    .join(", ");
}
