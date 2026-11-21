/**
 * results/experimentos.json convertido a series y tablas: impostor frente a 1/q, transcripciones
 * reales frente a simuladas, extracción de x con r repetido y repetición de pruebas. Funciones puras.
 */
import type { ImpostorResults, NizkReplayResults, NonceReuseResults, ReplayCase, SimulatorResults } from "../data/labTypes";
import type { XY } from "./charts";
import type { BarRowData } from "./labComparison";

/** Tasa de éxito acumulada del impostor según el número de intentos (q fijo). */
export const impostorConvergence = (imp: ImpostorResults): XY[] => imp.convergence.map((c) => ({ x: c.n, y: c.rate }));

/** Tasa medida y 1/q para cada tamaño de q (solo tasas > 0: el eje es logarítmico). */
export function impostorByQ(imp: ImpostorResults): { measured: XY[]; expected: XY[] } {
  const rows = [...imp.byQ].sort((a, b) => a.q - b.q);
  return {
    measured: rows.filter((r) => r.rate > 0).map((r) => ({ x: r.q, y: r.rate, label: `q = ${r.q}` })),
    expected: rows.map((r) => ({ x: r.q, y: r.expected })),
  };
}

/** Probabilidad de acertar al menos una vez en `attempts` intentos con probabilidad 1/q cada uno. */
export const successWithin = (q: number, attempts: number): number => 1 - (1 - 1 / q) ** attempts;

/** Una fila por compromiso t: cuántas transcripciones reales y simuladas lo tienen. */
export function simulatorBars(sim: SimulatorResults): BarRowData[] {
  return sim.byT.map((b) => ({ key: String(b.t), label: `t = ${b.t}`, emphasis: false, values: { real: b.real, simulada: b.simulated } }));
}

/** ¿Coinciden las dos distribuciones fila a fila? */
export const sameDistribution = (sim: SimulatorResults): boolean => sim.byT.length > 0 && sim.byT.every((b) => b.real === b.simulated);

const mod = (a: number, q: number): number => ((a % q) + q) % q;

/** Inverso modular por búsqueda (solo para mostrar el ejemplo del escrito, con q de pocos dígitos). */
export function smallInverse(a: number, q: number): number | null {
  const r = mod(a, q);
  for (let k = 1; k < q; k += 1) if ((r * k) % q === 1) return k;
  return null;
}

export interface NonceSteps {
  ds: number;
  dc: number;
  inverse: number;
  x: number;
}

/** Los pasos de x = (s1 − s2)·(c1 − c2)⁻¹ mod q con los números del ejemplo (null si falta algo). */
export function nonceSteps(nonce: NonceReuseResults, q: number): NonceSteps | null {
  const e = nonce.example;
  if (!e || q < 2) return null;
  const ds = mod(e.s1 - e.s2, q);
  const dc = mod(e.c1 - e.c2, q);
  const inverse = smallInverse(dc, q);
  return inverse === null ? null : { ds, dc, inverse, x: mod(ds * inverse, q) };
}

type ReplayTiming = Pick<NizkReplayResults, "window" | "replayDelay" | "staleDelay">;

export const REPLAY_CASE_TEXT: Readonly<Record<ReplayCase["id"], { title: string; detail: (r: ReplayTiming) => string }>> = {
  "sin-proteccion": { title: "Sin protección", detail: (r) => `la misma prueba se reenvía ${r.replayDelay} s después a un verificador que no recuerda pruebas` },
  "con-proteccion": { title: "Con protección", detail: (r) => `la misma prueba se reenvía ${r.replayDelay} s después; el banco recuerda las pruebas de los últimos ${r.window} s` },
  vieja: { title: "m vieja", detail: (r) => `una prueba con marca de tiempo de hace ${r.staleDelay} s, fuera de la ventana de ${r.window} s` },
};
