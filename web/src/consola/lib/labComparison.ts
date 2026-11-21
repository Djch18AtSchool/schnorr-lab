/**
 * results/comparacion.json convertido a filas de las gráficas y tablas de la comparación del ZKP con
 * contraseña (Argon2id), contraseña + TOTP y SRP-6a. Funciones puras.
 */
import type { ComparisonResults, ComparisonRow, QualitativeEntry } from "../data/labTypes";

export interface BarRowData {
  key: string;
  label: string;
  emphasis: boolean;
  values: Readonly<Record<string, number>>;
}

const isZkp = (row: ComparisonRow): boolean => row.mechanism === "zkp";

/** Registro, inicio de sesión e inicio sin descargar los parámetros públicos (ms, mediana). */
export function latencyBars(c: ComparisonResults): BarRowData[] {
  return c.rows.map((r) => ({
    key: r.key, label: r.label, emphasis: isZkp(r),
    values: { registro: r.registerMs, inicio: r.loginMs, sinParametros: r.loginWithoutParamsMs },
  }));
}

export type Flow = "login" | "register";

export interface NetworkRowData extends BarRowData {
  roundTrips: number;
  totalBytes: number;
  paths: readonly string[];
}

/** Bytes enviados y recibidos por flujo, con idas y vueltas y las rutas que se llamaron. */
export function networkBars(c: ComparisonResults, flow: Flow): NetworkRowData[] {
  return c.rows.map((r) => {
    const net = flow === "login" ? r.login : r.register;
    return {
      key: r.key, label: r.label, emphasis: isZkp(r), values: { enviados: net.sent_bytes, recibidos: net.received_bytes },
      roundTrips: net.round_trips, totalBytes: net.sent_bytes + net.received_bytes, paths: net.paths,
    };
  });
}

export type AttackKind = "diccionario" | "aleatoria" | "bsgs";

export interface StolenRow {
  key: string;
  label: string;
  emphasis: boolean;
  /** log10 de los años que tarda cada ataque con la base robada (un núcleo de este equipo). */
  log10Years: Partial<Record<AttackKind, number>>;
}

function stolenFromRow(r: ComparisonRow): StolenRow {
  const years: Partial<Record<AttackKind, number>> = isZkp(r)
    ? (r.random8Log10Years == null ? {} : { bsgs: r.random8Log10Years })
    : {
        ...(r.dictionaryLog10Years == null ? {} : { diccionario: r.dictionaryLog10Years }),
        ...(r.random8Log10Years == null ? {} : { aleatoria: r.random8Log10Years }),
      };
  return { key: r.key, label: isZkp(r) && r.group ? `ZKP · ${r.group}` : r.label, emphasis: isZkp(r), log10Years: years };
}

/**
 * Una fila por lo que se puede atacar: cada mecanismo con contraseña, SRP también con gmpy2 y cada
 * grupo del ZKP una sola vez (el interactivo y Fiat-Shamir guardan la misma y).
 */
export function stolenRows(c: ComparisonResults): StolenRow[] {
  const seenGroups = new Set<string>();
  const rows = c.rows.filter((r) => {
    if (!isZkp(r)) return true;
    if (seenGroups.has(r.group)) return false;
    seenGroups.add(r.group);
    return true;
  }).map(stolenFromRow);
  const gmpy2 = c.stolen?.guesses["srp-gmpy2"];
  if (!gmpy2) return rows;
  const extra: StolenRow = { key: "srp-gmpy2", label: "SRP-6a con gmpy2", emphasis: false,
    log10Years: { diccionario: gmpy2.dictionaryLog10Years, aleatoria: gmpy2.random8Log10Years } };
  const srpIndex = rows.findIndex((r) => r.key === "srp");
  return srpIndex < 0 ? [...rows, extra] : [...rows.slice(0, srpIndex + 1), extra, ...rows.slice(srpIndex + 1)];
}

export type Tone = "ok" | "warn" | "bad";

/** Tono del veredicto cualitativo según sus palabras (Vulnerable, Parcial, Limitado, Resistente…). */
export function verdictTone(verdict: string): Tone {
  const v = verdict.toLowerCase();
  if (v.startsWith("vulnerable")) return "bad";
  if (v.startsWith("parcial") || v.startsWith("limitado")) return "warn";
  return "ok";
}

const MECHANISM_ORDER = ["password", "totp", "srp", "zkp"] as const;
const MECHANISM_NAME: Readonly<Record<string, string>> = { zkp: "ZKP de Schnorr" };

export interface QualitativeRow extends QualitativeEntry {
  key: string;
  label: string;
}

/** La tabla cualitativa en el orden contraseña, TOTP, SRP, ZKP (y luego cualquier otra clave). */
export function qualitativeRows(c: ComparisonResults): QualitativeRow[] {
  const keys = [...MECHANISM_ORDER.filter((k) => k in c.qualitative), ...Object.keys(c.qualitative).filter((k) => !(MECHANISM_ORDER as readonly string[]).includes(k))];
  return keys.map((key) => ({
    key, label: MECHANISM_NAME[key] ?? c.rows.find((r) => r.mechanism === key)?.label ?? key, ...c.qualitative[key],
  }));
}

/** ¿Viaja por la red algún secreto en este flujo? */
export const secretTravels = (secrets: Readonly<Record<string, boolean>>): boolean => Object.values(secrets).some(Boolean);

/** Secretos de un mecanismo con lo que pasa en cada flujo (la clave de TOTP solo viaja al registrarse). */
export function secretList(row: ComparisonRow): Array<{ name: string; login: boolean; register: boolean }> {
  const names = [...new Set([...Object.keys(row.secrets.register), ...Object.keys(row.secrets.login)])];
  return names.map((name) => ({ name, login: row.secrets.login[name] === true, register: row.secrets.register[name] === true }));
}

/** La fila del ZKP de referencia para las conclusiones: schnorr-2048 interactivo si existe. */
export function referenceZkp(c: ComparisonResults): ComparisonRow | undefined {
  return c.rows.find((r) => r.key === "zkp-schnorr-2048") ?? c.rows.find(isZkp);
}

export const rowByKey = (c: ComparisonResults, key: string): ComparisonRow | undefined => c.rows.find((r) => r.key === key);
