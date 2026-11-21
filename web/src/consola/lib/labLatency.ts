/**
 * results/latency.json convertido a lo que dibuja el Laboratorio: latencia por familia de grupos,
 * comparación de aritméticas y razón medida frente a la predicha (k³ y k^2.585). Funciones puras.
 */
import type { LatencyResults } from "../data/source";
import type { LatencyGroup, XY } from "./charts";

export type Backend = "propia" | "nativa" | "gmpy2";
export type FamilyKey = "seguro" | "ffdhe" | "schnorr";

export const FAMILIES: ReadonlyArray<{ key: FamilyKey; label: string }> = [
  { key: "seguro", label: "primo seguro (safe y RFC 3526)" },
  { key: "ffdhe", label: "ffdhe (RFC 7919)" },
  { key: "schnorr", label: "grupo de Schnorr (q pequeño)" },
];

/** safe y rfc son primos seguros (p = 2q + 1); ffdhe también, pero de otro estándar. */
export function familyOf(family: string): FamilyKey {
  if (family === "schnorr") return "schnorr";
  if (family === "ffdhe") return "ffdhe";
  return "seguro";
}

export interface FamilySeries {
  family: FamilyKey;
  points: ReadonlyArray<XY & { group: LatencyGroup }>;
}

/** Una serie por familia (solo las que tienen datos) con la mediana en ms de la aritmética elegida. */
export function familySeries(groups: readonly LatencyGroup[], backend: Backend): FamilySeries[] {
  return FAMILIES.map(({ key }) => ({
    family: key,
    points: groups
      .filter((g) => familyOf(g.family) === key && g.ms[backend] != null)
      .map((g) => ({ x: g.bitsP, y: g.ms[backend], label: g.name, group: g })),
  })).filter((s) => s.points.length > 0);
}

/** Cuántas veces más rápida es la aritmética `fast` que `slow` en un grupo (null si falta alguna). */
export function speedup(group: LatencyGroup | undefined, slow: Backend, fast: Backend): number | null {
  const a = group?.ms[slow];
  const b = group?.ms[fast];
  return a != null && b != null && b > 0 ? a / b : null;
}

export interface RatioRow {
  key: string;
  label: string;
  family: FamilyKey;
  measured: number;
  predK3: number;
  predKaratsuba: number;
  errK3: number;
  errKaratsuba: number;
}

const relErr = (measured: number, predicted: number): number => Math.abs(measured - predicted) / predicted;

/** Cada paso de tamaño (grupo anterior → grupo) con su razón medida y las dos predichas. */
export function ratioRows(results: LatencyResults, backend: Backend): RatioRow[] {
  return results.rows.flatMap((r) => {
    if (r.backend !== backend || r.previous == null || r.ratio == null || r.pred_k3 == null || r.pred_karatsuba == null) return [];
    return [{
      key: `${r.previous}-${r.name}`, label: `${r.previous} → ${r.name}`, family: familyOf(r.family), measured: r.ratio,
      predK3: r.pred_k3, predKaratsuba: r.pred_karatsuba,
      errK3: r.err_k3 ?? relErr(r.ratio, r.pred_k3), errKaratsuba: r.err_karatsuba ?? relErr(r.ratio, r.pred_karatsuba),
    }];
  });
}

/** Error relativo medio de cada modelo sobre las filas dadas (null si no hay filas). */
export function meanErrors(rows: readonly RatioRow[]): { k3: number; karatsuba: number } | null {
  if (!rows.length) return null;
  const mean = (pick: (r: RatioRow) => number): number => rows.reduce((sum, r) => sum + pick(r), 0) / rows.length;
  return { k3: mean((r) => r.errK3), karatsuba: mean((r) => r.errKaratsuba) };
}
