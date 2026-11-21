/**
 * Validación de results/comparacion.json y results/experimentos.json (datos externos: no se confía
 * en su forma). Cada función devuelve null si el bloque no trae lo mínimo para dibujarse.
 */
import type {
  ArithmeticResults, ComparisonResults, ComparisonRow, ExperimentResults, GuessCost, ImpostorResults, NetworkCost,
  NizkReplayResults, NonceReuseResults, QualitativeEntry, RandomnessResults, ReplayAttempt, ReplayCase, SimulatorResults, StolenDatabase,
} from "../data/labTypes";
import { asRecord } from "./requests";

type Rec = Record<string, unknown>;

export const isNum = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isStr = (value: unknown): value is string => typeof value === "string";
const isBool = (value: unknown): value is boolean => typeof value === "boolean";
const num = (value: unknown, fallback = 0): number => (isNum(value) ? value : fallback);
const str = (value: unknown, fallback = ""): string => (isStr(value) ? value : value == null ? fallback : String(value));
const numOrNull = (value: unknown): number | null => (isNum(value) ? value : null);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter(isStr) : []);

/** Elementos de una lista que pasan un parser (los mal formados se descartan). */
function listOf<T>(value: unknown, parse: (item: Rec) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.map(asRecord).flatMap((item) => {
    const parsed = item ? parse(item) : null;
    return parsed === null ? [] : [parsed];
  });
}

function booleans(value: unknown): Record<string, boolean> {
  const r = asRecord(value) ?? {};
  return Object.fromEntries(Object.entries(r).filter((entry): entry is [string, boolean] => isBool(entry[1])));
}

// ------------------------------------------------------------------ comparacion.json

function network(value: unknown): NetworkCost {
  const r = asRecord(value) ?? {};
  return { round_trips: num(r.round_trips), posts: num(r.posts), sent_bytes: num(r.sent_bytes), received_bytes: num(r.received_bytes), paths: strings(r.paths) };
}

function attempt(value: unknown): ReplayAttempt | null {
  const r = asRecord(value);
  return r && isBool(r.accepted) ? { accepted: r.accepted, reason: str(r.reason) } : null;
}

function comparisonRow(r: Rec): ComparisonRow | null {
  if (!isStr(r.key) || !isStr(r.label) || !isNum(r.login_ms) || !isNum(r.register_ms)) return null;
  const stored = asRecord(r.stored) ?? {};
  const secrets = asRecord(r.secrets_on_wire) ?? {};
  const replay = asRecord(r.replay) ?? {};
  return {
    key: r.key, label: r.label, mechanism: str(r.mechanism, r.key), group: str(r.group), securityBits: str(r.security_bits, "—"),
    registerMs: r.register_ms, loginMs: r.login_ms, loginWithoutParamsMs: num(r.login_without_params_ms, r.login_ms),
    login: network(r.login_network), register: network(r.register_network),
    stored: { fields: strings(stored.fields), bytes: num(stored.bytes) },
    secrets: { login: booleans(secrets.login), register: booleans(secrets.register) },
    replay: { accepted: replay.accepted === true, verbatim: attempt(replay.verbatim), newSession: attempt(replay.sesion_nueva) },
    dictionaryLog10Years: numOrNull(r.offline_dictionary_log10_years),
    random8Log10Years: numOrNull(r.offline_random8_log10_years),
  };
}

function guess(value: unknown): GuessCost | null {
  const r = asRecord(value);
  if (!r || !isNum(r.dictionary_log10_years) || !isNum(r.random8_log10_years)) return null;
  return { secondsPerGuess: num(r.seconds_per_guess), dictionaryLog10Years: r.dictionary_log10_years, random8Log10Years: r.random8_log10_years };
}

/** Costos por mecanismo: password, totp y srp-<aritmética> (SRP se midió con varias aritméticas). */
function guesses(r: Rec): Record<string, GuessCost> {
  const srp = asRecord(r.srp) ?? {};
  const entries: Array<[string, GuessCost | null]> = [
    ["password", guess(r.password)], ["totp", guess(r.totp)],
    ...Object.entries(srp).map(([backend, value]): [string, GuessCost | null] => [`srp-${backend}`, guess(value)]),
  ];
  return Object.fromEntries(entries.filter((entry): entry is [string, GuessCost] => entry[1] !== null));
}

function stolenDatabase(value: unknown): StolenDatabase | null {
  const r = asRecord(value);
  if (!r) return null;
  const zkp = asRecord(r.zkp) ?? {};
  const groups = asRecord(zkp.groups) ?? {};
  const bsgs = Object.entries(groups).flatMap(([group, item]) => {
    const g = asRecord(item);
    return g && isNum(g.bsgs_log10_years) ? [{ group, qBits: num(g.q_bits), log10Years: g.bsgs_log10_years }] : [];
  });
  return {
    dictionarySize: num(r.dictionary_size, 1e6), randomSpace: str(r.random_space, "94^8"), guesses: guesses(r),
    totpSecondFactor: str(asRecord(r.totp)?.second_factor), bsgsSecondsPerOperation: num(zkp.bsgs_seconds_per_operation),
    bsgs, zkpDictionary: str(zkp.dictionary),
  };
}

function qualitative(value: unknown): Record<string, QualitativeEntry> {
  const r = asRecord(value) ?? {};
  return Object.fromEntries(Object.entries(r).flatMap(([key, item]) => {
    const q = asRecord(item);
    if (!q || !isStr(q.phishing) || !isStr(q.online_bruteforce)) return [];
    return [[key, { phishing: q.phishing, phishingWhy: str(q.phishing_why), online: q.online_bruteforce, onlineWhy: str(q.online_why) }]];
  }));
}

export function parseComparison(value: unknown): ComparisonResults | null {
  const r = asRecord(value);
  if (!r) return null;
  const rows = listOf(r.rows, comparisonRow);
  if (!rows.length) return null;
  return {
    python: str(r.python), reps: num(r.reps), backend: str(r.backend), notes: strings(r.notes), rows,
    stolen: stolenDatabase(r.stolen_database), qualitative: qualitative(r.qualitative),
  };
}

// ------------------------------------------------------------------ experimentos.json

function impostor(value: unknown): ImpostorResults | null {
  const r = asRecord(value);
  if (!r || !isNum(r.q) || !isNum(r.expected)) return null;
  const convergence = listOf(r.convergence, (c) => (isNum(c.n) && isNum(c.rate) ? { n: c.n, rate: c.rate } : null));
  const byQ = listOf(r.by_q, (b) => (isNum(b.q) && isNum(b.rate) && b.q > 0
    ? { p: num(b.p), q: b.q, qBits: num(b.q_bits), trials: num(b.trials), rate: b.rate, expected: num(b.expected, 1 / b.q) } : null));
  if (!convergence.length && !byQ.length) return null;
  return { q: r.q, trials: num(r.trials), expected: r.expected, beforeLockout: num(r.before_lockout), maxAttempts: num(r.max_attempts, 3), convergence, byQ };
}

function simulator(value: unknown): SimulatorResults | null {
  const r = asRecord(value);
  if (!r || !isNum(r.real) || !isNum(r.simulated)) return null;
  const ex = asRecord(r.example);
  return {
    q: num(r.q), x: num(r.x), y: num(r.y), real: r.real, simulated: r.simulated, identical: r.identical === true,
    allVerify: r.all_simulated_verify === true,
    example: ex && isNum(ex.t) && isNum(ex.c) && isNum(ex.s) ? { t: ex.t, c: ex.c, s: ex.s } : null,
    byT: listOf(r.by_t, (b) => (isNum(b.t) && isNum(b.real) && isNum(b.simulated) ? { t: b.t, real: b.real, simulated: b.simulated } : null)),
  };
}

function nonceReuse(value: unknown): NonceReuseResults | null {
  const r = asRecord(value);
  if (!r) return null;
  const e = asRecord(r.example);
  const rnd = asRecord(r.random);
  const example = e && isNum(e.x_real) && isNum(e.x_extracted)
    ? { t: num(e.t), c1: num(e.c1), s1: num(e.s1), c2: num(e.c2), s2: num(e.s2), xReal: e.x_real, xExtracted: e.x_extracted,
        recovered: e.recovered === true, bothAccepted: e.both_accepted === true }
    : null;
  const random = rnd && isNum(rnd.trials) && isNum(rnd.recovered)
    ? { group: str(rnd.group), qBits: num(rnd.q_bits), trials: rnd.trials, recovered: rnd.recovered } : null;
  return example || random ? { example, random } : null;
}

function replayCases(r: Rec): ReplayCase[] {
  const cases: Array<ReplayCase | null> = [
    isBool(r.accepted_without_protection) ? { id: "sin-proteccion", originalAccepted: isBool(r.original_accepted_without_protection) ? r.original_accepted_without_protection : null,
      accepted: r.accepted_without_protection, reason: str(r.reason_without_protection) } : null,
    isBool(r.accepted_with_protection) ? { id: "con-proteccion", originalAccepted: isBool(r.original_accepted_with_protection) ? r.original_accepted_with_protection : null,
      accepted: r.accepted_with_protection, reason: str(r.reason_with_protection) } : null,
    isBool(r.accepted_stale) ? { id: "vieja", originalAccepted: null, accepted: r.accepted_stale, reason: str(r.reason_stale) } : null,
  ];
  return cases.filter((c): c is ReplayCase => c !== null);
}

function nizkReplay(value: unknown): NizkReplayResults | null {
  const r = asRecord(value);
  if (!r) return null;
  const cases = replayCases(r);
  if (!cases.length) return null;
  return { window: num(r.window, 30), replayDelay: num(r.replay_delay), staleDelay: num(r.stale_delay), cases, victimLocked: r.victim_locked === true };
}

function randomness(value: unknown): RandomnessResults | null {
  const r = asRecord(value);
  if (!r || !isNum(r.logins) || !isNum(r.distinct_t) || !isNum(r.distinct_c)) return null;
  return { group: str(r.group), qBits: num(r.q_bits), logins: r.logins, accepted: num(r.accepted), distinctT: r.distinct_t, distinctC: r.distinct_c };
}

function arithmetic(value: unknown): ArithmeticResults | null {
  const r = asRecord(value);
  if (!r || !isNum(r.cases) || !isNum(r.mod_pow_matches) || !isNum(r.mod_inverse_matches)) return null;
  const examples = Object.entries(asRecord(r.examples) ?? {}).flatMap(([expr, v]) => (isNum(v) ? [{ expr, value: v }] : []));
  return { cases: r.cases, bits: num(r.bits), modPowMatches: r.mod_pow_matches, modInverseMatches: r.mod_inverse_matches, examples };
}

export function parseExperiments(value: unknown): ExperimentResults | null {
  const r = asRecord(value);
  if (!r) return null;
  const parsed: ExperimentResults = {
    python: str(r.python), generatedAt: numOrNull(r.generated_at),
    impostor: impostor(r.impostor), simulator: simulator(r.simulador), nonceReuse: nonceReuse(r.r_repetido),
    replay: nizkReplay(r.repeticion), randomness: randomness(r.aleatoriedad), arithmetic: arithmetic(r.aritmetica),
  };
  const blocks = [parsed.impostor, parsed.simulator, parsed.nonceReuse, parsed.replay, parsed.randomness, parsed.arithmetic];
  return blocks.some((b) => b !== null) ? parsed : null;
}
