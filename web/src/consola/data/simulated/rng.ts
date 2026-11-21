/** Generador pseudoaleatorio con semilla (mulberry32): la simulación es reproducible. */

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  range(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  hex(bytes: number): string;
  weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T;
}

const HEX = "0123456789abcdef";

export function createRng(seed: number): Rng {
  let state = seed | 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    range: (min, max) => min + next() * (max - min),
    pick: (items) => items[Math.floor(next() * items.length)],
    hex: (bytes) => Array.from({ length: bytes * 2 }, () => HEX[Math.floor(next() * 16)]).join(""),
    weighted: (entries) => {
      const total = entries.reduce((sum, [, w]) => sum + w, 0);
      let x = next() * total;
      for (const [value, w] of entries) {
        x -= w;
        if (x <= 0) return value;
      }
      return entries[entries.length - 1][0];
    },
  };
}
