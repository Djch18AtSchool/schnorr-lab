/**
 * Grupo activo del ZKP a partir de GET /mechanisms (server: {group, bits, q_bits, p, q, g}) y las
 * comprobaciones públicas que la Consola puede repetir en el navegador con BigInt.
 */
import type { BankMechanism } from "../../shared/types";

export interface GroupInfo {
  name: string;
  bits: number;
  qBits: number;
  p: string;
  q: string;
  g: string;
  maxAttempts: number;
}

export const DEFAULT_MAX_ATTEMPTS = 3;
const DIGITS = /^\d+$/;

const text = (value: unknown): string | null => (typeof value === "string" || typeof value === "number" ? String(value) : null);

export function groupOf(mechanisms: readonly BankMechanism[]): GroupInfo | null {
  const server = mechanisms.find((m) => m.id === "zkp")?.server ?? mechanisms[0]?.server;
  if (!server) return null;
  const p = text(server.p);
  const q = text(server.q);
  const g = text(server.g);
  if (!p || !q || !g || !DIGITS.test(p) || !DIGITS.test(q) || !DIGITS.test(g)) return null;
  const maxAttempts = typeof server.max_attempts === "number" ? server.max_attempts : DEFAULT_MAX_ATTEMPTS;
  return {
    name: text(server.group) ?? "?",
    bits: Number(server.bits ?? p.length),
    qBits: Number(server.q_bits ?? 0),
    p, q, g, maxAttempts,
  };
}

/** Exponenciación modular rápida con BigInt (la misma idea que core/modular.py). */
export function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return result;
}

export interface GroupChecks {
  safePrime: boolean;      // p = 2q + 1
  qDividesP1: boolean;     // q | p − 1 (grupos de Schnorr)
  generatorOrder: boolean; // g^q ≡ 1 (mod p) y g ≠ 1
}

export function checkGroup(group: GroupInfo): GroupChecks {
  const p = BigInt(group.p);
  const q = BigInt(group.q);
  const g = BigInt(group.g);
  return {
    safePrime: p === 2n * q + 1n,
    qDividesP1: q > 0n && (p - 1n) % q === 0n,
    generatorOrder: g !== 1n && modPow(g, q, p) === 1n,
  };
}

/** ¿Es el grupo de ejemplo del escrito (sin seguridad real)? */
export const isToyGroup = (group: GroupInfo): boolean => group.bits < 64;
