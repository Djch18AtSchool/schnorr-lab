/** Aritmética del grupo de ejemplo del escrito (p = 23, q = 11, g = 4): la misma que protocol/bank.py. */

export const TOY = { name: "toy-23", p: 23, q: 11, g: 4, bits: 5, qBits: 4 } as const;
export const MAX_ATTEMPTS = 3;
export const NIZK_WINDOW_S = 30;

export function modPow(base: number, exp: number, mod: number): number {
  let result = 1;
  let b = base % mod;
  let e = exp;
  while (e > 0) {
    if (e & 1) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1;
  }
  return result;
}

/** Inverso modular con el algoritmo extendido de Euclides. */
export function modInv(a: number, m: number): number {
  let [r0, r1, t0, t1] = [m, a % m, 0, 1];
  while (r1 !== 0) {
    const k = Math.floor(r0 / r1);
    [r0, r1] = [r1, r0 - k * r1];
    [t0, t1] = [t1, t0 - k * t1];
  }
  return ((t0 % m) + m) % m;
}

export const inSubgroup = (v: number): boolean => Number.isInteger(v) && v > 0 && v < TOY.p && modPow(v, TOY.q, TOY.p) === 1;

/** Sustituto didáctico de SHA-256(p‖g‖y‖t‖id‖m) mod q (FNV-1a), solo para la simulación. */
export function nizkChallenge(y: number, t: number, id: string, m: number): number {
  const text = `${TOY.p}|${TOY.g}|${y}|${t}|${id}|${m}`;
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % TOY.q;
}

export interface VerifyDetails {
  gs: number;
  yc: number;
  tyc: number;
  yc_inv: number;
  t_rec: number;
}

/** g^s y t·y^c (mod p), y la recuperación t = g^s·(y^c)^-1. */
export function verifyDetails(y: number, t: number, c: number, s: number): VerifyDetails {
  const gs = modPow(TOY.g, s, TOY.p);
  const yc = modPow(y, c, TOY.p);
  const ycInv = modInv(yc, TOY.p);
  return { gs, yc, tyc: (t * yc) % TOY.p, yc_inv: ycInv, t_rec: (gs * ycInv) % TOY.p };
}

export const stringify = (details: object): Record<string, string> =>
  Object.fromEntries(Object.entries(details).map(([k, v]) => [k, String(v)]));
