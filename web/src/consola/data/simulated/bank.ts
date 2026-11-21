/**
 * Banco simulado: las rutas /zkp/... y /admin/... con las mismas decisiones, señales, etiquetas y
 * líneas de log que el banco real (mechanisms/zkp/server.py) sobre el grupo de ejemplo p = 23.
 */
import { challengeSpan, decideSpan, registerSpan } from "./spans";
import { MAX_ATTEMPTS, NIZK_WINDOW_S, TOY, inSubgroup, modPow, nizkChallenge, stringify, verifyDetails } from "./toy";

export interface LogDraft {
  kind: string;
  title: string;
  data: Record<string, unknown>;
}

export interface RouteResult {
  status: number;
  body: unknown;
  signals: string[];
  tags: Record<string, string>;
  logs: LogDraft[];
  /** Campos del cuerpo que delatan una repetición (para buscar el mensaje original). */
  evidence?: Record<string, string>;
}

export interface Draws {
  challenge: () => number;
  sessionId: () => string;
}

const { p, q, g } = TOY;

const subgroupMath = (name: string, v: number): string => `${name}^q mod p = ${v}^${q} mod ${p} = ${modPow(v, q, p)} → ${inSubgroup(v) ? "∈" : "∉"} subgrupo`;

function log(kind: string, title: string, event: string, fields: Record<string, unknown>, extra: Record<string, unknown> = {}): LogDraft {
  const level = kind === "error" || fields.accepted === "false" ? "WARN" : "INFO";
  return { kind, title, data: { logger: "banco.zkp", event, level, ...fields, ...extra } };
}

const fail = (status: number, reason: string, signals: string[], tags: Record<string, string>, logs: LogDraft[]): RouteResult =>
  ({ status, body: { reason }, signals, tags, logs });

export class SimBank {
  readonly users = new Map<string, { y: number; created: number }>();
  private readonly sessions = new Map<string, { user: string; t: number; c: number }>();
  private readonly consumed = new Map<string, string>();
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

  params(): RouteResult {
    return { status: 200, body: { name: TOY.name, p: String(p), q: String(q), g: String(g), bits: TOY.bits }, signals: [], tags: {},
      logs: [log("paso", "El banco entrega los parámetros públicos (p, q, g)", "params", { grupo: TOY.name, bits: String(TOY.bits) })] };
  }

  register(body: Record<string, unknown>, ts: number): RouteResult {
    const user = String(body.user_id);
    const y = Number(body.y);
    const tags = { user };
    const reason = this.users.has(user) ? "El usuario ya existe" : y === 1 ? "y = 1 no es válido" : inSubgroup(y) ? null : "y no pertenece al subgrupo";
    const fields = { user, y: String(y) };
    if (reason) {
      return fail(400, reason, ["account.rejected"], tags, [log("error", `Registro rechazado: ${reason}`, "register", { ...fields, accepted: "false", reason }, { math: [subgroupMath("y", y)] })]);
    }
    this.users.set(user, { y, created: ts });
    return { status: 201, body: { user_id: user, stored: { y: String(y) } }, signals: ["account.created"], tags,
      logs: [log("registro", "y ∈ subgrupo ✔ → el banco guarda (id, y)", "register", { ...fields, subgroup: "ok", stored: "solo y" },
        { span: registerSpan(), math: [subgroupMath("y", y)] })] };
  }

  commit(body: Record<string, unknown>, draws: Draws, forcedC: number | null): RouteResult {
    const user = String(body.user_id);
    const t = Number(body.t);
    const fields = { user, t: String(t) };
    if (!this.users.has(user)) return fail(404, "Usuario no registrado", [], { user }, [log("error", "Compromiso rechazado: Usuario no registrado", "challenge", fields)]);
    if (this.isLocked(user)) {
      return fail(423, "Cuenta bloqueada", ["auth.locked_attempt"], { user }, [log("error", "Compromiso rechazado: Cuenta bloqueada", "challenge",
        { ...fields, reason: "Cuenta bloqueada", attempts_left: "0" }, { span: challengeSpan(true), math: [subgroupMath("t", t)] })]);
    }
    const c = forcedC ?? draws.challenge();
    const session = draws.sessionId();
    this.sessions.set(session, { user, t, c });
    return { status: 200, body: { session_id: session, c: String(c) }, signals: ["auth.challenge"], tags: { session, user },
      logs: [log("paso", "t ∈ subgrupo ✔ → el banco elige el reto c al azar", "challenge", { ...fields, subgroup: "ok", c: String(c), session: `${session.slice(0, 8)}…` },
        { span: challengeSpan(false), math: [subgroupMath("t", t), `c = ${c} (al azar en [0, q − 1])`] })] };
  }

  respond(body: Record<string, unknown>): RouteResult {
    const session = String(body.session_id);
    const s = Number(body.s);
    const open = this.sessions.get(session);
    if (!open) {
      const owner = this.consumed.get(session);
      const tags: Record<string, string> = owner ? { session, user: owner } : { session };
      return { status: 200, body: { accepted: false, reason: "Sesión inválida", transcript: null, details: {}, attempts_left: null },
        signals: owner ? ["auth.replay"] : [], tags, evidence: owner ? { session_id: session } : undefined,
        logs: [log("verificacion", "Rechazado: Sesión inválida", "verify", { session: `${session.slice(0, 8)}…`, user: owner ?? "?", s: String(s), accepted: "false", reason: "Sesión inválida" })] };
    }
    this.sessions.delete(session);
    this.consumed.set(session, open.user);
    return this.decide(open.user, open.t, open.c, s, "verify", { session: `${session.slice(0, 8)}…` }, { session, user: open.user });
  }

  nizk(body: Record<string, unknown>, nowS: number): RouteResult {
    const user = String(body.user_id);
    const [t, s, m] = [Number(body.t), Number(body.s), Number(body.m)];
    const fields = { user, t: String(t), s: String(s), m: String(m) };
    const deny = (reason: string, signal: string, evidence?: Record<string, string>): RouteResult => ({
      status: 200, body: { accepted: false, reason, transcript: null, details: {}, attempts_left: null }, signals: [signal], tags: { user }, evidence,
      logs: [log("verificacion", `Rechazado: ${reason}`, "verify_nizk", { ...fields, accepted: "false", reason }, { math: ["c = SHA-256(p ‖ g ‖ y ‖ t ‖ id ‖ m) mod q"] })] });
    if (Math.abs(Math.floor(nowS) - m) > NIZK_WINDOW_S) return deny("Marca de tiempo fuera de la ventana permitida", "auth.stale");
    if (this.usedProofs.has(`${t},${s}`)) return deny("Prueba ya utilizada", "auth.replay", { t: String(t), s: String(s) });
    const y = this.y(user);
    if (y === null) return fail(404, "Usuario no registrado", [], { user }, []);
    if (this.isLocked(user)) return deny("Cuenta bloqueada", "auth.locked_attempt");
    const c = nizkChallenge(y, t, user, m);
    const result = this.decide(user, t, c, s, "verify_nizk", { m: String(m), c: String(c) }, { user }, [`c = SHA-256(p ‖ g ‖ y ‖ t ‖ id ‖ m) mod q = ${c}`]);
    if (result.signals.includes("auth.ok")) this.usedProofs.add(`${t},${s}`);
    return result;
  }

  admin(user: string, action: "unlock" | "remove"): RouteResult {
    if (!this.users.has(user)) return fail(404, `No existe la cuenta «${user}» en zkp.`, [], {}, []);
    if (action === "unlock") this.failures.delete(user);
    else this.users.delete(user);
    const title = action === "unlock" ? `Soporte desbloqueó la cuenta ${user}` : `Soporte dio de baja la cuenta ${user}`;
    return { status: 200, body: { mechanism: "zkp", user_id: user, action }, signals: [`admin.${action}`], tags: { user },
      logs: [log("log", title, action, { user })] };
  }

  /** La misma verificación que Bank._decide: rango de s, congruencia y recuperación de t. */
  private decide(user: string, t: number, c: number, s: number, event: string, extra: Record<string, string>, tags: Record<string, string>, prefix: string[] = []): RouteResult {
    const y = this.y(user) ?? 1;
    const d = verifyDetails(y, t, c, s);
    const accepted = s >= 0 && s < q && d.gs === d.tyc && d.t_rec === t;
    if (accepted) this.failures.set(user, 0);
    else this.failures.set(user, (this.failures.get(user) ?? 0) + 1);
    const locked = !accepted && this.isLocked(user);
    const reason = accepted ? "Acceso concedido" : "La congruencia no se cumple";
    const math = [...prefix, `g^s = ${g}^${s} mod ${p} = ${d.gs}`, `t·y^c = ${t}·${y}^${c} mod ${p} = ${d.tyc}  (${d.gs === d.tyc ? "=" : "≠"} g^s)`,
      `(y^c)^-1 = ${d.yc}^-1 mod ${p} = ${d.yc_inv}  (Euclides extendido)`, `g^s·(y^c)^-1 = ${d.gs}·${d.yc_inv} mod ${p} = ${d.t_rec} ${accepted ? "= t ✔" : "≠ t ✘"}`];
    const fields = { ...extra, user, s: String(s), ...stringify(d), accepted: String(accepted), reason, attempts_left: String(this.attemptsLeft(user)) };
    return {
      status: 200,
      body: { accepted, reason, transcript: { t: String(t), c: String(c), s: String(s) }, details: stringify(d), attempts_left: this.attemptsLeft(user) },
      signals: accepted ? ["auth.ok"] : locked ? ["auth.rejected", "auth.lockout"] : ["auth.rejected"],
      tags,
      logs: [log("verificacion", accepted ? "ACCESO CONCEDIDO" : `Rechazado: ${reason}`, event, fields, { span: decideSpan(accepted), math })],
    };
  }
}
