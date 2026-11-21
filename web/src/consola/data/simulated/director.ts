/**
 * Director de la simulación: arma el historial de los últimos ~16 minutos (con el guion del brief
 * para Ana) y elige escenas nuevas en vivo. Lo que Eve "captura" sale de lo que viajó por la red.
 */
import type { RequestRecord } from "../../../shared/types";
import type { SimEngine } from "./engine";
import type { Rng } from "./rng";
import { LAB, Scenes, UA, type Scene } from "./scenes";

const NAMES_INITIAL = ["carla", "diego", "elena", "bruno", "fabian", "gabriela", "hector"];
const NAMES_LATER = ["ines", "jorge", "karla", "luis", "marta", "nicolas"];
const HISTORY_MS = 15 * 60 * 1000 + 50 * 1000;
const RECENT_CAPTURE_MS = 5 * 60 * 1000;

const accepted = (path: string) => (r: RequestRecord): boolean =>
  r.path === path && (r.response_body as { accepted?: boolean } | null)?.accepted === true;

/** Ejecuta una escena al instante con marcas de tiempo pasadas; devuelve la hora final (ms). */
export function runInstant(scene: Scene, t0: number): number {
  return scene.reduce((ts, s) => {
    const at = ts + s.delayMs;
    s.run(at);
    return at;
  }, t0);
}

export class Director {
  readonly scenes: Scenes;
  private laterIndex = 0;

  constructor(private readonly engine: SimEngine, private readonly rng: Rng) {
    this.scenes = new Scenes(engine, rng);
  }

  private activeUsers(): string[] {
    return [...this.engine.bank.users.keys()].filter((u) => this.scenes.hasDevice(u) && !this.engine.bank.isLocked(u));
  }

  private captured(path: string, sinceMs: number | null): Array<Record<string, unknown>> {
    return this.engine.requests
      .filter((r) => accepted(path)(r) && (sinceMs === null || r.timestamp * 1000 >= sinceMs))
      .map((r) => r.request_body as Record<string, unknown>);
  }

  /** Una escena al azar, con pesos parecidos a un banco tranquilo con algún ataque ocasional. */
  randomScene(live: boolean, nowMs: number): Scene {
    const users = this.activeUsers();
    if (!users.length) return this.scenes.reads();
    const locked = [...this.engine.bank.users.keys()].filter((u) => this.engine.bank.isLocked(u));
    const responses = this.captured("/zkp/login/respond", live ? nowMs - RECENT_CAPTURE_MS : null);
    const proofs = this.captured("/zkp/login/nizk", null);
    const kind = this.rng.weighted([
      ["login", 34], ["nizk", 15], ["reads", 14], ["abandon", 3], ["unknown", 3], ["malformed", live ? 1.5 : 1],
      ["register", this.laterIndex < NAMES_LATER.length ? (live ? 3 : 1) : 0],
      ["impostor", live ? 5 : 0], ["replay", live && responses.length ? 6 : 0], ["nizkReplay", live && proofs.length ? 3 : 0],
      ["locked", live && locked.length ? 3 : 0],
    ] as const);
    const who = (): string => (this.rng.next() < 0.3 && users.includes("ana") ? "ana" : this.rng.pick(users));
    const others = users.filter((u) => u !== "ana");
    switch (kind) {
      case "login": return this.scenes.login(who());
      case "nizk": return this.scenes.nizk(who());
      case "abandon": return this.scenes.abandon(others.length ? this.rng.pick(others) : who());
      case "unknown": return this.scenes.unknownUser();
      case "malformed": return this.scenes.malformed(others.length ? this.rng.pick(others) : "diego");
      case "register": return this.registerLater();
      case "impostor": return this.impostor(users, locked.length);
      case "replay": return this.scenes.replay(this.rng.pick(responses.slice(-4)));
      case "nizkReplay": return this.scenes.nizkReplay(this.rng.pick(proofs.slice(-3)));
      case "locked": return this.scenes.lockedTry(this.rng.pick(locked));
      default: return this.scenes.reads();
    }
  }

  private registerLater(): Scene {
    const name = NAMES_LATER[this.laterIndex];
    this.laterIndex += 1;
    return this.scenes.register(name, this.rng.int(1, 10), 40 + this.laterIndex);
  }

  /** Eve ataca sin bloquear demasiadas cuentas: si ya hay dos bloqueadas, deja un intento libre. */
  private impostor(users: readonly string[], lockedCount: number): Scene {
    const target = this.rng.pick(users);
    const left = this.engine.bank.attemptsLeft(target);
    const attempts = Math.max(1, Math.min(lockedCount >= 2 ? left - 1 : left, this.rng.int(1, 2)));
    return this.scenes.impostor(target, attempts);
  }

  /** Historial: arranque, registros iniciales, el guion de Ana y tráfico de fondo hasta ahora. */
  backfill(nowMs: number): void {
    const t0 = nowMs - HISTORY_MS;
    this.engine.startedAt = (t0 - 4000) / 1000;
    this.boot(t0 - 4000);
    let t = runInstant(this.scenes.reset(), t0) + 4000;
    t = runInstant(this.scenes.stream(LAB), t) + 2500;
    t = runInstant(this.scenes.stream({ ip: "127.0.0.1", ua: UA.consola }), t) + 6000;
    NAMES_INITIAL.forEach((name, i) => {
      t = runInstant(this.scenes.register(name, this.rng.int(1, 10), 30 + i), t) + this.rng.int(5000, 12000);
    });
    const script = this.script(nowMs);
    let k = 0;
    while (t < nowMs - 3000) {
      if (k < script.length && script[k].at <= t) {
        t = runInstant(script[k].scene(), Math.max(t, script[k].at)) + this.rng.int(2500, 5000);
        k += 1;
        continue;
      }
      t = runInstant(this.randomScene(false, t), t) + this.rng.int(3500, 8500);
    }
  }

  private boot(ms: number): void {
    const s = ms / 1000;
    this.engine.publish(s, "sistema", "log", "Started server process [48213]", { logger: "uvicorn.error" });
    this.engine.publish(s + 0.2, "sistema", "log", "Grupo activo: toy-23 (p = 23, q = 11, g = 4). Mecanismos: zkp", { logger: "banco.lab" });
    this.engine.publish(s + 0.4, "sistema", "log", "Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)", { logger: "uvicorn.error" });
  }

  /** El guion del brief: registro (x = 7, y = 8), sesión 77991cce…, repetición de Eve, impostor... */
  private script(nowMs: number): Array<{ at: number; scene: () => Scene }> {
    const at = (minAgo: number): number => nowMs - minAgo * 60 * 1000;
    const firstProof = (): Record<string, unknown> => this.captured("/zkp/login/nizk", null)[0] ?? { user_id: "ana", t: "18", s: "9", m: "0" };
    return [
      { at: at(14.0), scene: () => this.scenes.register("ana", 7, 23) },
      { at: at(12.0), scene: () => this.scenes.login("ana", { r: 5, c: 3, sid: "77991cce63618a8e" }) },
      { at: at(11.3), scene: () => this.scenes.replay({ session_id: "77991cce63618a8e", s: "4" }) },
      { at: at(10.0), scene: () => this.scenes.nizk("ana", 4, 3) },
      { at: at(9.0), scene: () => this.scenes.impostor("ana", 1, 1, 6, 2) },
      { at: at(7.2), scene: () => this.scenes.login("ana") },
      { at: at(6.4), scene: () => this.scenes.impostor("bruno", 3) },
      { at: at(4.1), scene: () => this.scenes.login("bruno") },
      { at: at(3.0), scene: () => this.scenes.login("ana") },
      { at: at(2.4), scene: () => this.scenes.malformed("diego") },
      { at: at(1.5), scene: () => this.scenes.nizkReplay(firstProof()) },
      { at: at(0.7), scene: () => this.scenes.login("ana") },
    ];
  }

  /** Reinicio pedido desde la Consola: reset y algunos registros de nuevo. */
  resetScenes(): Scene[] {
    this.laterIndex = 0;
    const again: Array<[string, number, number]> = [["ana", 7, 23], ...NAMES_INITIAL.slice(0, 3).map((n, i): [string, number, number] => [n, this.rng.int(1, 10), 30 + i])];
    return [this.scenes.reset(), ...again.map(([name, x, ip]) => this.scenes.register(name, x, ip))];
  }
}
