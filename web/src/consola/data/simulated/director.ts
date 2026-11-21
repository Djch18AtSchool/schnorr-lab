/**
 * Director de la simulación: recorre los actos del Escenario en orden, uno tras otro, con pausas
 * de segundos entre ellos. Arranca con unos minutos de historial y sigue en vivo.
 */
import type { SimEngine } from "./engine";
import type { Rng } from "./rng";
import { Scenes, type Scene } from "./scenes";

/** Los actos en el orden del Escenario (el registro solo ocurre la primera vez). */
const ACTS: ReadonlyArray<(s: Scenes) => Scene> = [
  (s) => s.register(),
  (s) => s.login(),
  (s) => s.nizk(),
  (s) => [...s.login(), ...s.replay("respond")],
  (s) => s.impostor(3),
  (s) => s.lockedThenUnlock(),
  (s) => [...s.nizk(), ...s.replay("nizk")],
  (s) => s.repeatedR(),
];

const HISTORY_MS = 5 * 60 * 1000;
/** El último acto del historial empieza antes de esto (el más largo dura unos 25 s). */
const LAST_ACT_MARGIN_MS = 40_000;
/** Pausa entre actos (quien presenta explica antes de seguir). */
export const ACT_GAP_MS: readonly [number, number] = [6000, 14000];

/** Ejecuta una escena al instante con marcas de tiempo pasadas; devuelve la hora final (ms). */
export function runInstant(scene: Scene, t0: number): number {
  return scene.reduce((ts, s) => {
    const at = ts + s.delayMs;
    s.run(at);
    return at;
  }, t0);
}

export class Director {
  private readonly scenes: Scenes;
  private index = 0;

  constructor(engine: SimEngine, private readonly rng: Rng) {
    this.scenes = new Scenes(engine, rng);
  }

  /** El acto siguiente que tenga algo que hacer (se arma justo antes de correrlo). */
  next(): Scene {
    for (let tries = 0; tries < ACTS.length; tries += 1) {
      const scene = ACTS[this.index % ACTS.length](this.scenes);
      this.index += 1;
      if (scene.length) return scene;
    }
    return [];
  }

  gap(): number {
    return this.rng.int(ACT_GAP_MS[0], ACT_GAP_MS[1]);
  }

  /** Historial de los últimos minutos, terminando unos segundos antes de ahora. */
  backfill(nowMs: number): void {
    let t = nowMs - HISTORY_MS;
    while (t < nowMs - LAST_ACT_MARGIN_MS) t = runInstant(this.next(), t) + this.gap();
  }
}
