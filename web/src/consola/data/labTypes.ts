/**
 * Tipos de los archivos nuevos del laboratorio: results/comparacion.json (ZKP frente a contraseña,
 * TOTP y SRP) y results/experimentos.json (ataques, simulador y verificaciones). Solo describen lo
 * que la Consola dibuja; los parsers de lib/labParse.ts los construyen desde datos no confiables.
 */

/** Lo que cuesta un flujo en la red: idas y vueltas y bytes de los cuerpos JSON. */
export interface NetworkCost {
  round_trips: number;
  posts: number;
  sent_bytes: number;
  received_bytes: number;
  paths: readonly string[];
}

export interface ReplayAttempt {
  accepted: boolean;
  reason: string;
}

/** Una fila de comparacion.json: un mecanismo (o una variante del ZKP) medido de punta a punta. */
export interface ComparisonRow {
  key: string;
  label: string;
  mechanism: string;           // password | totp | srp | zkp
  group: string;
  securityBits: string;
  registerMs: number;
  loginMs: number;
  loginWithoutParamsMs: number;
  login: NetworkCost;
  register: NetworkCost;
  stored: { fields: readonly string[]; bytes: number };
  /** Por flujo, cada secreto y si viaja por la red. */
  secrets: { login: Readonly<Record<string, boolean>>; register: Readonly<Record<string, boolean>> };
  replay: { accepted: boolean; verbatim: ReplayAttempt | null; newSession: ReplayAttempt | null };
  dictionaryLog10Years: number | null;
  random8Log10Years: number | null;
}

/** Ataque fuera de línea con la base robada, para un mecanismo con contraseña. */
export interface GuessCost {
  secondsPerGuess: number;
  dictionaryLog10Years: number;
  random8Log10Years: number;
}

export interface StolenDatabase {
  dictionarySize: number;
  randomSpace: string;
  /** Costo por mecanismo con contraseña; las claves son password, totp, srp-propia, srp-gmpy2… */
  guesses: Readonly<Record<string, GuessCost>>;
  totpSecondFactor: string;
  bsgsSecondsPerOperation: number;
  bsgs: ReadonlyArray<{ group: string; qBits: number; log10Years: number }>;
  zkpDictionary: string;
}

export interface QualitativeEntry {
  phishing: string;
  phishingWhy: string;
  online: string;
  onlineWhy: string;
}

export interface ComparisonResults {
  python: string;
  reps: number;
  backend: string;
  notes: readonly string[];
  rows: readonly ComparisonRow[];
  stolen: StolenDatabase | null;
  qualitative: Readonly<Record<string, QualitativeEntry>>;
}

// ------------------------------------------------------------------ experimentos.json

export interface ImpostorResults {
  q: number;
  trials: number;
  expected: number;
  beforeLockout: number;
  maxAttempts: number;
  convergence: ReadonlyArray<{ n: number; rate: number }>;
  byQ: ReadonlyArray<{ p: number; q: number; qBits: number; trials: number; rate: number; expected: number }>;
}

export interface SimulatorResults {
  q: number;
  x: number;
  y: number;
  real: number;
  simulated: number;
  identical: boolean;
  allVerify: boolean;
  example: { t: number; c: number; s: number } | null;
  byT: ReadonlyArray<{ t: number; real: number; simulated: number }>;
}

export interface NonceReuseResults {
  example: { t: number; c1: number; s1: number; c2: number; s2: number; xReal: number; xExtracted: number; recovered: boolean; bothAccepted: boolean } | null;
  random: { group: string; qBits: number; trials: number; recovered: number } | null;
}

export interface ReplayCase {
  id: "sin-proteccion" | "con-proteccion" | "vieja";
  originalAccepted: boolean | null;
  accepted: boolean;
  reason: string;
}

export interface NizkReplayResults {
  window: number;
  replayDelay: number;
  staleDelay: number;
  cases: readonly ReplayCase[];
  victimLocked: boolean;
}

export interface RandomnessResults {
  group: string;
  qBits: number;
  logins: number;
  accepted: number;
  distinctT: number;
  distinctC: number;
}

export interface ArithmeticResults {
  cases: number;
  bits: number;
  modPowMatches: number;
  modInverseMatches: number;
  examples: ReadonlyArray<{ expr: string; value: number }>;
}

/** Cada bloque se valida por separado: uno mal formado no oculta los demás. */
export interface ExperimentResults {
  python: string;
  generatedAt: number | null;
  impostor: ImpostorResults | null;
  simulator: SimulatorResults | null;
  nonceReuse: NonceReuseResults | null;
  replay: NizkReplayResults | null;
  randomness: RandomnessResults | null;
  arithmetic: ArithmeticResults | null;
}
