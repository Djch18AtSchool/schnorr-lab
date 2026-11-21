/**
 * Validación de los archivos de resultados y del documento OpenAPI (datos externos: no se confía
 * en su forma). Devuelven null si el archivo no tiene lo mínimo para dibujar.
 */
import type { ApiRoute, BsgsResults, LatencyResults, LatencyRow } from "../data/source";
import { asRecord } from "./requests";

const isNum = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isStr = (value: unknown): value is string => typeof value === "string";

function latencyRow(value: unknown): LatencyRow | null {
  const r = asRecord(value);
  if (!r || !isStr(r.name) || !isStr(r.backend) || !isNum(r.bits_p) || !isNum(r.median_s)) return null;
  return {
    name: r.name,
    family: isStr(r.family) ? r.family : "safe",
    series: isStr(r.series) ? r.series : "",
    bits_p: r.bits_p,
    bits_q: isNum(r.bits_q) ? r.bits_q : r.bits_p - 1,
    security_bits: r.security_bits == null ? "–" : String(r.security_bits),
    backend: r.backend,
    reps: isNum(r.reps) ? r.reps : 0,
    median_s: r.median_s,
    previous: isStr(r.previous) ? r.previous : null,
    ratio: isNum(r.ratio) ? r.ratio : null,
    pred_k3: isNum(r.pred_k3) ? r.pred_k3 : null,
    pred_karatsuba: isNum(r.pred_karatsuba) ? r.pred_karatsuba : null,
    err_k3: isNum(r.err_k3) ? r.err_k3 : null,
    err_karatsuba: isNum(r.err_karatsuba) ? r.err_karatsuba : null,
  };
}

export function parseLatency(value: unknown): LatencyResults | null {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.rows)) return null;
  const rows = record.rows.map(latencyRow).filter((row): row is LatencyRow => row !== null);
  if (!rows.length) return null;
  return { python: isStr(record.python) ? record.python : "", platform: isStr(record.platform) ? record.platform : "", rows };
}

export function parseBsgs(value: unknown): BsgsResults | null {
  const record = asRecord(value);
  const fit = asRecord(record?.fit);
  if (!record || !fit || !Array.isArray(record.rows) || !Array.isArray(record.predictions) || !isNum(fit.seconds_per_operation)) return null;
  const rows = record.rows.map(asRecord).filter((r) => r && isNum(r.q_bits) && isNum(r.seconds) && isNum(r.operations));
  const predictions = record.predictions.map(asRecord).filter((p) => p && isNum(p.q_bits) && isNum(p.seconds) && isNum(p.years));
  const holdout = asRecord(record.holdout);
  return {
    rows: rows.map((r) => ({
      q_bits: Number(r?.q_bits), p_bits: Number(r?.p_bits ?? 0), operations: Number(r?.operations),
      seconds: Number(r?.seconds), x_real: Number(r?.x_real ?? 0), x_found: Number(r?.x_found ?? 0),
    })),
    fit: {
      seconds_per_operation: fit.seconds_per_operation,
      growth_exponent: isNum(fit.growth_exponent) ? fit.growth_exponent : 0.5,
      expected_growth_exponent: isNum(fit.expected_growth_exponent) ? fit.expected_growth_exponent : 0.5,
    },
    holdout: { q_bits: Number(holdout?.q_bits ?? 0), relative_error: Number(holdout?.relative_error ?? 0) },
    predictions: predictions.map((p) => ({ q_bits: Number(p?.q_bits), operations: Number(p?.operations ?? 0), seconds: Number(p?.seconds), years: Number(p?.years) })),
    universe_age_years: isNum(record.universe_age_years) ? record.universe_age_years : 13.8e9,
  };
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

/** Rutas de un documento OpenAPI 3 (paths → método, resumen y primera etiqueta). */
export function parseOpenApi(value: unknown): ApiRoute[] {
  const paths = asRecord(asRecord(value)?.paths);
  if (!paths) return [];
  return Object.entries(paths).flatMap(([path, item]) => {
    const operations = asRecord(item) ?? {};
    return HTTP_METHODS.filter((method) => asRecord(operations[method])).map((method) => {
      const op = asRecord(operations[method]) ?? {};
      const tags = Array.isArray(op.tags) ? op.tags.filter(isStr) : [];
      return { method: method.toUpperCase(), path, summary: isStr(op.summary) ? op.summary : "", tag: tags[0] ?? "" };
    });
  });
}
