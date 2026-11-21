/**
 * Observador de la simulación: recuerda lo que vio (sesiones consumidas, orígenes, fallos) y deduce
 * alertas solo a partir de las peticiones, como la telemetría del banco real. No conoce los actos.
 */
import type { Alert } from "../../../shared/types";
import type { RouteResult } from "./bank";
import { MAX_ATTEMPTS, NIZK_WINDOW_S, TOY } from "./toy";
import { ago } from "../../lib/format";

export interface Seen {
  id: number;
  ts: number;
  ip: string;
  agent: string;
  path: string;
}

export type AlertDraft = Omit<Alert, "id" | "timestamp">;

interface Consumed extends Seen {
  s: number;
  user: string;
}

const agentName = (ua: string): string => ua.split(" ")[0];
const shortSid = (sid: string): string => `${sid.slice(0, 8)}…`;

export class Observer {
  private readonly consumed = new Map<string, Consumed>();
  private readonly commitOf = new Map<string, number>();
  private readonly failures = new Map<string, number[]>();
  private readonly origins = new Map<string, Set<string>>();

  reset(): void {
    this.consumed.clear();
    this.commitOf.clear();
    this.failures.clear();
    this.origins.clear();
  }

  /** Registra la petición y devuelve las alertas que se deducen de ella. */
  observe(seen: Seen, r: RouteResult, locked: (user: string) => boolean, attemptsLeft: (user: string) => number): AlertDraft[] {
    if (r.sid && seen.path.endsWith("/login/commit") && r.status === 200) this.commitOf.set(r.sid, seen.id);
    const alerts = this.instantAlerts(seen, r);
    if (r.consume) this.consumed.set(r.consume.sid, { ...seen, s: r.consume.s, user: r.consume.user });
    if (r.succeededUser) this.remember(r.succeededUser, seen.ip);
    if (!r.failedUser) return alerts.map((a) => ({ ...a, evidence: [...a.evidence, seen.id] }));
    const user = r.failedUser;
    const list = [...(this.failures.get(user) ?? []), seen.id];
    this.failures.set(user, list);
    if (locked(user)) return [this.lockAlert(user, seen, list)];
    const impostor = r.impostor ? [this.impostorAlert(seen, r, attemptsLeft(user))] : [];
    return [...alerts, ...impostor].map((a) => ({ ...a, evidence: [...a.evidence, seen.id] }));
  }

  private remember(user: string, ip: string): void {
    this.failures.set(user, []);
    this.origins.set(user, new Set([...(this.origins.get(user) ?? []), ip]));
  }

  private instantAlerts(seen: Seen, r: RouteResult): AlertDraft[] {
    if (r.invalidSession) return [this.replayAlert(seen, r.invalidSession)];
    if (r.lockedTry) {
      return [{ severity: "media", kind: "locked_attempt", title: `Intento sobre una cuenta bloqueada: ${r.lockedTry}`, user_id: r.lockedTry, evidence: [],
        detail: `El banco no emite reto. Origen \`${seen.ip}\` (${agentName(seen.agent)}).` }];
    }
    if (r.stale) {
      return [{ severity: "media", kind: "stale_proof", title: `Prueba no interactiva vieja para ${r.stale.user}`, user_id: r.stale.user, evidence: [],
        detail: `m es de hace ${r.stale.delta} s (ventana: ${NIZK_WINDOW_S} s). Patrón típico de una prueba capturada y reenviada. Origen \`${seen.ip}\`.` }];
    }
    if (r.usedProof) {
      const { user, t, s } = r.usedProof;
      return [{ severity: "media", kind: "replay", title: `Prueba no interactiva repetida para ${user}`, user_id: user, evidence: [],
        detail: `El par (t = ${t}, s = ${s}) ya se había aceptado. Origen \`${seen.ip}\`.` }];
    }
    return [];
  }

  private replayAlert(seen: Seen, sid: string): AlertDraft {
    const prev = this.consumed.get(sid);
    if (!prev) {
      return { severity: "baja", kind: "unknown_session", title: "Respuesta para una sesión desconocida", user_id: null, evidence: [],
        detail: `La sesión \`${shortSid(sid)}\` nunca fue emitida por este banco.` };
    }
    const origin = prev.ip === seen.ip ? "Mismo origen."
      : `Origen distinto: \`${seen.ip}\` (${agentName(seen.agent)}) frente a \`${prev.ip}\` (${agentName(prev.agent)}).`;
    return { severity: "alta", kind: "replay", title: "Respuesta repetida rechazada", user_id: prev.user, evidence: [prev.id],
      detail: `La sesión \`${shortSid(sid)}\` de \`${prev.user}\` ya se había usado ${ago(prev.ts, seen.ts)} con s = ${prev.s}. ${origin}` };
  }

  private lockAlert(user: string, seen: Seen, failures: readonly number[]): AlertDraft {
    return { severity: "alta", kind: "lockout", title: `Cuenta bloqueada: ${user}`, user_id: user, evidence: [...failures],
      detail: `${MAX_ATTEMPTS} pruebas inválidas seguidas. Último origen \`${seen.ip}\` (${agentName(seen.agent)}). La cuenta no recibe más retos hasta reiniciar el banco.` };
  }

  private impostorAlert(seen: Seen, r: RouteResult, left: number): AlertDraft {
    const imp = r.impostor;
    const user = r.failedUser ?? "?";
    const fresh = !this.origins.get(user)?.has(seen.ip);
    const commitId = r.sid ? this.commitOf.get(r.sid) : undefined;
    const where = fresh ? ` El origen \`${seen.ip}\` nunca había accedido a esta cuenta.` : "";
    const detail = imp?.d
      ? `g^s = ${TOY.g}^${imp.s} mod ${TOY.p} = ${imp.d.gs}, pero t·y^c mod ${TOY.p} = ${imp.d.tyc} (t = ${imp.t}, c = ${imp.c}). Intentos restantes: ${left}.${where}`
      : `s fuera de rango. Intentos restantes: ${left}.${where}`;
    return { severity: "media", kind: "invalid_proof", title: `Prueba inválida para ${user}`, user_id: user, evidence: commitId ? [commitId] : [], detail };
  }
}
