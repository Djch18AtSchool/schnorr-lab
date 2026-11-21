/**
 * Banco simulado: las rutas /zkp/... con la misma secuencia de decisiones que protocol/bank.py,
 * sobre el grupo de ejemplo. Devuelve status, cuerpo, eventos del registrador y señales para que el
 * observador deduzca alertas (como hace la telemetría del banco real).
 */
import { MAX_ATTEMPTS, NIZK_WINDOW_S, TOY, inSubgroup, nizkChallenge, stringify, verifyDetails, type VerifyDetails } from "./toy";

export interface LogDraft {
  kind: string;
  title: string;
  data: Record<string, unknown>;
}

export interface RouteResult {
  status: number;
  body: unknown;
  signal: string | null;
  logs: LogDraft[];
  user?: string;
  sid?: string;
  /** Sesión consumida con su s (para reconocer una respuesta repetida más tarde). */
  consume?: { sid: string; s: number; user: string };
  invalidSession?: string;
  lockedTry?: string;
  stale?: { user: string; delta: number };
  usedProof?: { user: string; t: number; s: number };
  failedUser?: string;
  succeededUser?: string;
  impostor?: { user: string; d: VerifyDetails | null; s: number; c: number; t: number };
}

export interface SimUser {
  y: number;
  created: number;
}

export interface Force {
  c?: number;
  sid?: string;
}

export interface Draws {
  challenge: () => number;
  sessionId: () => string;
}

const zkpLog = (kind: string, title: string, data: Record<string, unknown>, level?: string): LogDraft =>
  ({ kind, title, data: { logger: "banco.zkp", ...data, ...(level ? { level } : {}) } });

const shortSid = (sid: string): string => `${sid.slice(0, 8)}…`;

const decision = (accepted: boolean, reason: string, transcript: object | null, details: object, attemptsLeft: number | null): Record<string, unknown> =>
  ({ accepted, reason, transcript, details: stringify(details), attempts_left: attemptsLeft });

export class SimBank {
  readonly users = new Map<string, SimUser>();
  private readonly sessions = new Map<string, { user: string; t: number; c: number }>();
  private readonly open = new Map<string, string>();
  private readonly failures = new Map<string, number>();
  private readonly usedProofs = new Set<string>();

  attemptsLeft(user: string): number {
    return Math.max(0, MAX_ATTEMPTS - (this.failures.get(user) ?? 0));
  }

  isLocked(user: string): boolean {
    return (this.failures.get(user) ?? 0) >= MAX_ATTEMPTS;
  }

  y(user: string): number | null {
    return this.users.get(user)?.y ?? null;
  }

  isProofUsed(t: number, s: number): boolean {
    return this.usedProofs.has(`${t},${s}`);
  }

  private fail(user: string): void {
    this.failures.set(user, (this.failures.get(user) ?? 0) + 1);
  }

  reset(): void {
    this.users.clear();
    this.sessions.clear();
    this.open.clear();
    this.failures.clear();
    this.usedProofs.clear();
  }

  register(body: Record<string, unknown>, ts: number): RouteResult {
    const user = String(body.user_id);
    const y = Number(body.y);
    const reject = (reason: string): RouteResult => ({ status: 400, body: { reason }, signal: null, user,
      logs: [zkpLog("error", `Registro rechazado: ${reason}`, { user_id: user, y: body.y })] });
    if (this.users.has(user)) return reject("El usuario ya está registrado");
    if (y === 1) return reject("y = 1 no es una clave pública válida");
    if (!inSubgroup(y)) return reject("y no pertenece al subgrupo de orden q");
    this.users.set(user, { y, created: ts });
    return { status: 201, body: { user_id: user, stored: { y: String(y) } }, signal: null, user,
      logs: [zkpLog("registro", "register", { user, y, subgroup: "ok", stored: "{y}" })] };
  }

  commit(body: Record<string, unknown>, draws: Draws, force: Force | null): RouteResult {
    const user = String(body.user_id);
    const t = Number(body.t);
    if (!this.users.has(user)) {
      return { status: 404, body: { reason: "Usuario no registrado" }, signal: null, user,
        logs: [zkpLog("error", "challenge → 404", { user, reason: "Usuario no registrado" })] };
    }
    const logs: LogDraft[] = [];
    const abandoned = this.discardPending(user, logs);
    if (this.isLocked(user)) {
      return { status: 423, body: { reason: "Cuenta bloqueada" }, signal: "auth.locked", user, lockedTry: user,
        failedUser: abandoned ? user : undefined, logs: [...logs, zkpLog("error", "challenge → 423", { user, reason: "Cuenta bloqueada" })] };
    }
    if (!inSubgroup(t)) {
      this.fail(user);
      return { status: 400, body: { reason: "t no pertenece al subgrupo de orden q" }, signal: "auth.rejected", user, failedUser: user,
        logs: [...logs, zkpLog("error", "challenge", { user, t, subgroup: "fail", attempts_left: this.attemptsLeft(user) })] };
    }
    const c = force?.c ?? draws.challenge();
    const sid = force?.sid ?? draws.sessionId();
    this.sessions.set(sid, { user, t, c });
    this.open.set(user, sid);
    return { status: 200, body: { session_id: sid, c: String(c) }, signal: null, user, sid, failedUser: abandoned ? user : undefined,
      logs: [...logs, zkpLog("paso", "challenge", { user, t, subgroup: "ok", c, session: shortSid(sid) })] };
  }

  /** Una sesión pendiente se descarta al pedir otra y cuenta como intento fallido. */
  private discardPending(user: string, logs: LogDraft[]): boolean {
    const pending = this.open.get(user);
    if (!pending) return false;
    this.sessions.delete(pending);
    this.open.delete(user);
    this.fail(user);
    logs.push(zkpLog("error", `sesión pendiente ${shortSid(pending)} descartada (intento abandonado)`, { user, attempts_left: this.attemptsLeft(user) }));
    return true;
  }

  respond(body: Record<string, unknown>): RouteResult {
    const sid = String(body.session_id);
    const s = Number(body.s);
    const session = this.sessions.get(sid);
    if (!session) {
      return { status: 200, body: decision(false, "Sesión inválida", null, {}, null), signal: "auth.replay", sid, invalidSession: sid,
        logs: [zkpLog("verificacion", "verify → rechazado", { session: shortSid(sid), reason: "Sesión inválida", signal: "auth.replay" })] };
    }
    this.sessions.delete(sid);
    this.open.delete(session.user);
    const user = session.user;
    if (this.isLocked(user)) {
      return { status: 200, body: decision(false, "Cuenta bloqueada", null, {}, 0), signal: "auth.locked", user, sid,
        logs: [zkpLog("verificacion", "verify → rechazado", { user, reason: "Cuenta bloqueada", signal: "auth.locked" })] };
    }
    return { ...this.decide(user, session.t, session.c, s, "verify", { session: shortSid(sid) }), sid, consume: { sid, s, user } };
  }

  nizk(body: Record<string, unknown>, nowS: number): RouteResult {
    const user = String(body.user_id);
    const [t, s, m] = [Number(body.t), Number(body.s), Number(body.m)];
    const left = this.users.has(user) ? this.attemptsLeft(user) : null;
    const deny = (reason: string, signal: string | null, extra: Partial<RouteResult> = {}): RouteResult => ({
      status: 200, body: decision(false, reason, null, {}, left), signal, user, ...extra,
      logs: [zkpLog("verificacion", "nizk → rechazado", { user, reason, ...(signal ? { signal } : {}) }, "WARNING")] });
    const delta = Math.floor(nowS) - m;
    if (Math.abs(delta) > NIZK_WINDOW_S) return deny("Marca de tiempo fuera de la ventana permitida", "auth.stale", { stale: { user, delta } });
    if (this.usedProofs.has(`${t},${s}`)) return deny("Prueba ya utilizada", "auth.replay", { usedProof: { user, t, s } });
    const y = this.y(user);
    if (y === null) return deny("Usuario no registrado", null);
    if (this.isLocked(user)) return deny("Cuenta bloqueada", "auth.locked");
    const c = nizkChallenge(y, t, user, m);
    const result = this.decide(user, t, c, s, "nizk", { "c=H(p‖g‖y‖t‖id‖m) mod q": c });
    if (result.succeededUser) this.usedProofs.add(`${t},${s}`);
    return result;
  }

  /** Misma secuencia que Bank._decide: rango de s, congruencia y recuperación de t. */
  private decide(user: string, t: number, c: number, s: number, step: string, extra: Record<string, unknown>): RouteResult {
    const transcript = { t: String(t), c: String(c), s: String(s) };
    if (!(Number.isInteger(s) && s >= 0 && s <= TOY.q - 1)) {
      this.fail(user);
      return { status: 200, body: decision(false, "s fuera de rango", transcript, {}, this.attemptsLeft(user)), signal: "auth.rejected", user,
        failedUser: user, impostor: { user, d: null, s, c, t },
        logs: [zkpLog("verificacion", `${step} → rechazado`, { user, ...extra, reason: "s fuera de rango", signal: "auth.rejected" })] };
    }
    const d = verifyDetails(this.y(user) ?? 1, t, c, s);
    if (d.gs === d.tyc && d.t_rec === t) {
      this.failures.set(user, 0);
      return { status: 200, body: decision(true, "Acceso concedido", transcript, d, this.attemptsLeft(user)), signal: "auth.ok", user, succeededUser: user,
        logs: [zkpLog("verificacion", `${step} → ACCESO CONCEDIDO`, { user, ...extra, gs: d.gs, tyc: d.tyc, t_rec: d.t_rec, signal: "auth.ok" })] };
    }
    this.fail(user);
    return { status: 200, body: decision(false, "La congruencia no se cumple", transcript, d, this.attemptsLeft(user)), signal: "auth.rejected", user,
      failedUser: user, impostor: { user, d, s, c, t },
      logs: [zkpLog("verificacion", `${step} → rechazado`, { user, ...extra, gs: d.gs, tyc: d.tyc, reason: "La congruencia no se cumple",
        attempts_left: this.attemptsLeft(user), signal: "auth.rejected" })] };
  }
}

export const TOY_PARAMS = { name: TOY.name, p: String(TOY.p), q: String(TOY.q), g: String(TOY.g), bits: TOY.bits };
