/**
 * Escenas de la simulación: los mismos actos del Escenario (Ana, Eve y soporte del banco), paso a
 * paso con pausas de segundos, como cuando alguien los recorre en clase. El banco simulado solo ve
 * las peticiones; nunca sabe qué escena las produjo.
 */
import type { RequestRecord } from "../../../shared/types";
import { bodyField } from "../../lib/requests";
import type { Origin, SimEngine } from "./engine";
import type { Rng } from "./rng";
import { TOY, modInv, modPow, nizkChallenge } from "./toy";

export interface Step {
  delayMs: number;
  run: (tsMs: number) => void;
}

export type Scene = Step[];

export const ANA: Origin = { device: "celular de Ana", ip: "192.168.1.23", ua: "BancoLab-iOS/3.2 (iPhone; iOS 18)" };
export const EVE: Origin = { device: "laptop de Eve", ip: "192.168.1.66", ua: "python-httpx/0.28 (Linux x86_64)" };
export const SUPPORT: Origin = { device: "soporte del banco", ip: "10.0.0.5", ua: "BancoLab-Backoffice/1.0" };

const USER = "ana";
const ANA_X = 7;
/** Pausa entre pasos de un acto (quien presenta avanza con un clic). */
const STEP_MS: readonly [number, number] = [900, 2200];

export class Scenes {
  private act = 0;
  private lastRespond: Record<string, unknown> | null = null;
  private lastProof: Record<string, unknown> | null = null;

  constructor(private readonly engine: SimEngine, private readonly rng: Rng) {}

  private step(run: (ts: number, corr: string) => void, first = false): Step {
    const corr = `${this.rng.hex(5)}:${this.act}`;
    return { delayMs: first ? 0 : this.rng.int(STEP_MS[0], STEP_MS[1]), run: (ms) => run(ms / 1000, corr) };
  }

  private send(origin: Origin, method: "GET" | "POST" | "DELETE", path: string, body: Record<string, unknown> | null, ts: number, correlation: string, forcedC?: number): RequestRecord {
    return this.engine.http({ method, path, body, origin, ts, correlation, forcedC });
  }

  private params(origin: Origin, first = true): Step {
    return this.step((ts, corr) => this.send(origin, "GET", "/zkp/params", null, ts, corr), first);
  }

  private begin(): void {
    this.act += 1;
  }

  register(): Scene {
    this.begin();
    if (this.engine.bank.y(USER) !== null) return [];
    return [this.params(ANA), this.step((ts, c) => this.send(ANA, "POST", "/zkp/register", { user_id: USER, y: String(modPow(TOY.g, ANA_X, TOY.p)) }, ts, c))];
  }

  /** Inicio de sesión interactivo desde un origen que conoce x (Ana, o Eve si la despejó). */
  login(origin: Origin = ANA, x = ANA_X, r = this.rng.int(1, TOY.q - 1)): Scene {
    this.begin();
    const issued = { session: "", c: 0 };
    return [
      this.params(origin),
      this.step((ts, corr) => {
        const rec = this.send(origin, "POST", "/zkp/login/commit", { user_id: USER, t: String(modPow(TOY.g, r, TOY.p)) }, ts, corr);
        Object.assign(issued, { session: bodyField(rec.response_body, "session_id") ?? "", c: Number(bodyField(rec.response_body, "c") ?? 0) });
      }),
      this.step((ts, corr) => {
        if (!issued.session) return;
        const body = { session_id: issued.session, s: String((r + issued.c * x) % TOY.q) };
        if (origin === ANA) this.lastRespond = body;
        this.send(origin, "POST", "/zkp/login/respond", body, ts, corr);
      }),
    ];
  }

  nizk(): Scene {
    this.begin();
    return [this.params(ANA), this.step((ts, corr) => {
      const r = this.rng.int(1, TOY.q - 1);
      const t = modPow(TOY.g, r, TOY.p);
      const m = Math.floor(ts);
      const c = nizkChallenge(modPow(TOY.g, ANA_X, TOY.p), t, USER, m);
      this.lastProof = { user_id: USER, t: String(t), s: String((r + c * ANA_X) % TOY.q), m: String(m) };
      this.send(ANA, "POST", "/zkp/login/nizk", { ...this.lastProof }, ts, corr);
    })];
  }

  /** Eve reenvía la última respuesta o prueba de Ana que capturó en la red. */
  replay(kind: "respond" | "nizk"): Scene {
    this.begin();
    return [this.step((ts, corr) => {
      const captured = kind === "respond" ? this.lastRespond : this.lastProof;
      if (captured) this.send(EVE, "POST", `/zkp/login/${kind}`, { ...captured }, ts, corr);
    })];
  }

  /** Eve lee las claves públicas y fabrica t = g^s·(y^c')^-1 adivinando el reto; el banco elige otro. */
  impostor(tries: number): Scene {
    this.begin();
    const steal = this.step((ts, corr) => this.send(EVE, "GET", "/bank/users", null, ts, corr));
    const attempt = (): Step[] => {
      const pending = { session: "", s: 0 };
      return [
        this.step((ts, corr) => {
          const y = this.engine.bank.y(USER) ?? 1;
          const guess = this.rng.int(0, TOY.q - 1);
          const s = this.rng.int(0, TOY.q - 1);
          const t = (modPow(TOY.g, s, TOY.p) * modInv(modPow(y, guess, TOY.p), TOY.p)) % TOY.p;
          const c = (guess + 1 + this.rng.int(0, TOY.q - 2)) % TOY.q;
          const rec = this.send(EVE, "POST", "/zkp/login/commit", { user_id: USER, t: String(t) }, ts, corr, c);
          Object.assign(pending, { session: bodyField(rec.response_body, "session_id") ?? "", s });
        }),
        this.step((ts, corr) => {
          if (pending.session) this.send(EVE, "POST", "/zkp/login/respond", { session_id: pending.session, s: String(pending.s) }, ts, corr);
        }),
      ];
    };
    return [this.params(EVE), steal, ...Array.from({ length: tries }, attempt).flat()];
  }

  /** Ana intenta entrar a su cuenta bloqueada y soporte la desbloquea. */
  lockedThenUnlock(): Scene {
    this.begin();
    if (!this.engine.bank.isLocked(USER)) return [];
    return [
      this.params(ANA),
      this.step((ts, corr) => this.send(ANA, "POST", "/zkp/login/commit", { user_id: USER, t: "6" }, ts, corr)),
      this.step((ts, corr) => this.send(SUPPORT, "POST", `/admin/accounts/zkp/${USER}/unlock`, null, ts, corr)),
    ];
  }

  /** Celular defectuoso: dos inicios con el mismo r; Eve despeja x y entra con él. */
  repeatedR(): Scene {
    const r = this.rng.int(1, TOY.q - 1);
    return [...this.login(ANA, ANA_X, r), ...this.login(ANA, ANA_X, r), ...this.login(EVE, ANA_X)];
  }
}
