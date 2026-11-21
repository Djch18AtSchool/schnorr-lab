/**
 * Escenas de tráfico: lo que hacen los clientes (Ana, otros clientes, Eve, el laboratorio). El
 * banco simulado solo ve las peticiones que resultan; nunca sabe qué escena las produjo.
 */
import type { Flow, Origin, SimEngine } from "./engine";
import type { Rng } from "./rng";
import { TOY, modInv, modPow, nizkChallenge } from "./toy";

export interface Step {
  delayMs: number;
  run: (ts: number) => void;
}

export type Scene = Step[];

export const UA = {
  app: "BancoLab/2.3 (Android 14; okhttp/4.12)",
  escenario: "BancoLab-Escenario/0.9 python-httpx/0.28.1",
  consola: "BancoLab-Consola/0.1 (EventSource)",
  httpx: "python-httpx/0.28.1",
  curl: "curl/8.5.0",
  swagger: "Mozilla/5.0 (X11; Linux x86_64) Chrome/131 · Swagger UI",
} as const;

export const EVE: Origin = { ip: "192.168.1.66", ua: UA.httpx };
export const LAB: Origin = { ip: "127.0.0.1", ua: UA.escenario };

interface Device extends Origin {
  x: number;
}

export interface LoginForce {
  r?: number;
  c?: number;
  sid?: string;
}

const MAX_PROOF_TRIES = 60;
const step = (delayMs: number, run: (ts: number) => void): Step => ({ delayMs, run });
const sec = (ts: number): number => ts / 1000;

/** Fábrica de escenas: guarda los dispositivos (con su x) fuera del banco. */
export class Scenes {
  private readonly devices = new Map<string, Device>();

  constructor(private readonly engine: SimEngine, private readonly rng: Rng) {}

  hasDevice(user: string): boolean {
    return this.devices.has(user);
  }

  private originOf(user: string): Origin {
    return this.devices.get(user) ?? LAB;
  }

  private send(method: string, path: string, body: Record<string, unknown> | null, flow: Flow, ts: number, malformed: string | null = null): ReturnType<SimEngine["http"]> {
    return this.engine.http(method, path, body, flow, sec(ts), malformed);
  }

  register(user: string, x: number, ipLast: number): Scene {
    const device: Device = { ip: `192.168.1.${ipLast}`, ua: UA.app, x };
    this.devices.set(user, device);
    const flow = this.engine.newFlow(device);
    return [
      step(0, (ts) => this.send("GET", "/zkp/params", null, flow, ts)),
      step(this.rng.int(300, 800), (ts) => this.send("POST", "/zkp/register", { user_id: user, y: String(modPow(TOY.g, x, TOY.p)) }, flow, ts)),
    ];
  }

  login(user: string, force: LoginForce | null = null): Scene {
    const device = this.devices.get(user);
    if (!device) return [];
    const flow = this.engine.newFlow(device, force);
    const r = force?.r ?? this.rng.int(1, TOY.q - 1);
    const issued: { sid: string | null; c: number } = { sid: null, c: 0 };
    return [
      step(0, (ts) => this.send("GET", "/zkp/params", null, flow, ts)),
      step(this.rng.int(220, 600), (ts) => {
        const rec = this.send("POST", "/zkp/login/commit", { user_id: user, t: String(modPow(TOY.g, r, TOY.p)) }, flow, ts);
        const body = rec.response_body as { session_id?: string; c?: string } | null;
        if (rec.status === 200 && body?.session_id) Object.assign(issued, { sid: body.session_id, c: Number(body.c) });
      }),
      step(this.rng.int(320, 900), (ts) => {
        if (!issued.sid) return;
        this.send("POST", "/zkp/login/respond", { session_id: issued.sid, s: String((r + issued.c * device.x) % TOY.q) }, flow, ts);
      }),
    ];
  }

  abandon(user: string): Scene {
    const flow = this.engine.newFlow(this.originOf(user));
    return [
      step(0, (ts) => this.send("GET", "/zkp/params", null, flow, ts)),
      step(this.rng.int(200, 500), (ts) => this.send("POST", "/zkp/login/commit", { user_id: user, t: String(modPow(TOY.g, this.rng.int(1, 10), TOY.p)) }, flow, ts)),
    ];
  }

  /** Prueba no interactiva; con `forcedC` busca un m que dé ese reto (para el guion del brief). */
  nizk(user: string, forcedC: number | null = null, forcedR: number | null = null): Scene {
    const device = this.devices.get(user);
    if (!device) return [];
    const flow = this.engine.newFlow(device);
    return [step(0, (ts) => {
      const y = this.engine.bank.y(user) ?? modPow(TOY.g, device.x, TOY.p);
      const proof = this.findProof(user, y, device.x, Math.floor(sec(ts)), forcedC, forcedR);
      this.send("POST", "/zkp/login/nizk", { user_id: user, t: String(proof.t), s: String(proof.s), m: String(proof.m) }, flow, ts);
    })];
  }

  private findProof(user: string, y: number, x: number, now: number, forcedC: number | null, forcedR: number | null): { t: number; s: number; m: number } {
    const proofFor = (r: number, m: number): { t: number; s: number; m: number; c: number } => {
      const t = modPow(TOY.g, r, TOY.p);
      const c = nizkChallenge(y, t, user, m);
      return { t, s: (r + c * x) % TOY.q, m, c };
    };
    let proof = proofFor(forcedR ?? this.rng.int(1, TOY.q - 1), now);
    for (let tries = 0; tries < MAX_PROOF_TRIES; tries += 1) {
      if (forcedC !== null && proof.c !== forcedC) proof = proofFor(forcedR ?? this.rng.int(1, TOY.q - 1), proof.m - 1);
      else if (this.engine.bank.isProofUsed(proof.t, proof.s)) proof = proofFor(this.rng.int(1, TOY.q - 1), proof.m);
      else break;
    }
    return proof;
  }

  /** Eve adivina c' y fabrica t = g^s·(y^c')^-1; el banco elige otro c y la prueba falla. */
  impostor(target: string, attempts: number, guess: number | null = null, forcedS: number | null = null, forcedC: number | null = null): Scene {
    const flow = this.engine.newFlow(EVE);
    return Array.from({ length: attempts }, (_, i) => this.impostorTry(flow, target, i === 0, guess, forcedS, forcedC)).flat();
  }

  private impostorTry(flow: Flow, target: string, first: boolean, guess: number | null, forcedS: number | null, forcedC: number | null): Step[] {
    const pending: { sid: string | null; s: number } = { sid: null, s: 0 };
    return [
      step(first ? 0 : this.rng.int(900, 1800), (ts) => {
        const y = this.engine.bank.y(target);
        if (y === null) return;
        const cGuess = guess ?? this.rng.int(0, TOY.q - 1);
        const s = forcedS ?? this.rng.int(0, TOY.q - 1);
        const t = (modPow(TOY.g, s, TOY.p) * modInv(modPow(y, cGuess, TOY.p), TOY.p)) % TOY.p;
        const drawn = forcedC ?? this.rng.int(0, TOY.q - 1);
        const cBank = drawn === cGuess ? (drawn + 1 + this.rng.int(0, TOY.q - 3)) % TOY.q : drawn;
        flow.force = { c: cBank };
        const rec = this.send("POST", "/zkp/login/commit", { user_id: target, t: String(t) }, flow, ts);
        flow.force = null;
        const body = rec.response_body as { session_id?: string } | null;
        Object.assign(pending, { sid: rec.status === 200 ? body?.session_id ?? null : null, s });
      }),
      step(this.rng.int(250, 600), (ts) => {
        if (pending.sid) this.send("POST", "/zkp/login/respond", { session_id: pending.sid, s: String(pending.s) }, flow, ts);
      }),
    ];
  }

  replay(captured: Record<string, unknown>): Scene {
    const flow = this.engine.newFlow(EVE);
    return [step(0, (ts) => this.send("POST", "/zkp/login/respond", { ...captured }, flow, ts))];
  }

  nizkReplay(captured: Record<string, unknown>): Scene {
    const flow = this.engine.newFlow(EVE);
    return [step(0, (ts) => this.send("POST", "/zkp/login/nizk", { ...captured }, flow, ts))];
  }

  malformed(user: string): Scene {
    const flow = this.engine.newFlow(this.originOf(user));
    const [path, body, reason] = this.rng.pick([
      ["/zkp/login/commit", { user_id: user, t: 12 }, "t: debe ser una cadena (los enteros viajan como cadenas decimales)"],
      ["/zkp/login/respond", { session_id: this.rng.hex(8) }, "s: falta el campo"],
      ["/zkp/register", { user_id: `${user} 2`, y: "9" }, "user_id: formato inválido"],
    ] as const);
    return [step(0, (ts) => this.send("POST", path, { ...body }, flow, ts, reason))];
  }

  unknownUser(): Scene {
    const flow = this.engine.newFlow({ ip: `192.168.1.${this.rng.int(80, 99)}`, ua: UA.app });
    const name = this.rng.pick(["anna", "brunno", "invitado", "test"]);
    return [step(0, (ts) => this.send("POST", "/zkp/login/commit", { user_id: name, t: "12" }, flow, ts))];
  }

  reads(): Scene {
    const flow = this.engine.newFlow(this.rng.next() < 0.8 ? LAB : { ip: "127.0.0.1", ua: UA.swagger });
    const path = this.rng.weighted([["/bank/users", 4], ["/audit/log", 3], ["/mechanisms", 2], ["/zkp/params", 2]] as const);
    return [step(0, (ts) => this.send("GET", path, null, flow, ts))];
  }

  lockedTry(user: string): Scene {
    const flow = this.engine.newFlow(this.originOf(user));
    return [
      step(0, (ts) => this.send("GET", "/zkp/params", null, flow, ts)),
      step(300, (ts) => this.send("POST", "/zkp/login/commit", { user_id: user, t: "16" }, flow, ts)),
    ];
  }

  stream(origin: Origin): Scene {
    const flow = this.engine.newFlow(origin);
    return [step(0, (ts) => this.send("GET", "/events/stream", null, flow, ts))];
  }

  reset(): Scene {
    const flow = this.engine.newFlow({ ip: "127.0.0.1", ua: UA.curl });
    return [step(0, (ts) => this.send("POST", "/lab/reset", {}, flow, ts))];
  }
}
