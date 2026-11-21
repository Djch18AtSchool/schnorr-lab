/**
 * Fuente simulada (?fuente=simulada): el banco del boceto D corriendo en el navegador. Arranca con
 * ~16 minutos de historial y agrega una escena nueva cada 2–4 s mientras alguien escucha el flujo.
 * Devuelve exactamente los tipos del contrato.
 */
import type { Account, Alert, AuditEntry, BankEvent, BankMechanism, RequestRecord, TelemetrySummary, TestReport } from "../../../shared/types";
import { summarize } from "../../lib/telemetry";
import { FALLBACK_ROUTES } from "../routes";
import type { ApiRoutes, ConsoleDataSource, LabResults } from "../source";
import { Director } from "./director";
import { SimEngine } from "./engine";
import { BSGS, LATENCY, MECHANISMS, testReport } from "./fixtures";
import { createRng, type Rng } from "./rng";
import type { Scene } from "./scenes";
import { MAX_ATTEMPTS } from "./toy";

const DEFAULT_SEED = 20261124;
const BUCKET_S = 30;
const SCENE_GAP_MS: readonly [number, number] = [2200, 4300];
const RESET_GAP_MS = 2200;

export interface SimulatedOptions {
  seed?: number;
  nowMs?: number;
  clock?: () => number;
}

export class SimulatedSource implements ConsoleDataSource {
  readonly kind = "simulada" as const;
  private readonly rng: Rng;
  private readonly engine: SimEngine;
  private readonly director: Director;
  private readonly clock: () => number;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private listeners = 0;

  constructor(options: SimulatedOptions = {}) {
    this.clock = options.clock ?? (() => Date.now());
    this.rng = createRng(options.seed ?? DEFAULT_SEED);
    this.engine = new SimEngine(this.rng);
    this.director = new Director(this.engine, this.rng);
    this.director.backfill(options.nowMs ?? this.clock());
  }

  private nowS(): number {
    return this.clock() / 1000;
  }

  async summary(windowS: number): Promise<TelemetrySummary> {
    const locked = [...this.engine.bank.users.keys()].filter((u) => this.engine.bank.isLocked(u)).length;
    return summarize({ requests: this.engine.requests, now: this.nowS(), startedAt: this.engine.startedAt, windowS, bucketS: BUCKET_S, lockedAccounts: locked });
  }

  async requests(since: number, limit: number): Promise<RequestRecord[]> {
    const fresh = this.engine.requests.filter((r) => r.id > since);
    return fresh.slice(Math.max(0, fresh.length - limit));
  }

  async alerts(): Promise<Alert[]> {
    return [...this.engine.alerts];
  }

  async accounts(): Promise<Account[]> {
    const bank = this.engine.bank;
    return [...bank.users].map(([user_id, u]) => ({
      mechanism: "zkp", user_id, stored: { y: String(u.y) },
      status: bank.isLocked(user_id) ? "bloqueada" : "activa",
      attempts_left: bank.attemptsLeft(user_id), created_at: u.created, last_login_at: this.engine.lastLogin.get(user_id) ?? null,
    }));
  }

  async audit(): Promise<AuditEntry[]> {
    return [...this.engine.audit];
  }

  async mechanisms(): Promise<BankMechanism[]> {
    return MECHANISMS.map((m) => ({ ...m, server: { ...m.server, max_attempts: MAX_ATTEMPTS } }));
  }

  async tests(): Promise<TestReport> {
    return testReport(this.nowS());
  }

  async results(): Promise<LabResults> {
    return { latency: LATENCY, bsgs: BSGS };
  }

  async events(since: number): Promise<BankEvent[]> {
    return this.engine.events.filter((e) => e.id > since);
  }

  async routes(): Promise<ApiRoutes> {
    return { routes: [...FALLBACK_ROUTES], origin: "respaldo" };
  }

  async reset(): Promise<void> {
    this.director.resetScenes().forEach((scene, i) => this.later(i * RESET_GAP_MS, () => this.runLive(scene)));
  }

  stream(onEvent: (event: BankEvent) => void, onStatus: (online: boolean) => void): () => void {
    const stop = this.engine.onEvent(onEvent);
    this.listeners += 1;
    if (this.listeners === 1) this.scheduleNext();
    this.later(0, () => onStatus(true));
    return () => {
      stop();
      this.listeners -= 1;
      if (this.listeners === 0) this.stopAll();
    };
  }

  private later(ms: number, run: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      run();
    }, ms);
    this.timers.add(timer);
  }

  private stopAll(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
  }

  private scheduleNext(): void {
    this.later(this.rng.int(SCENE_GAP_MS[0], SCENE_GAP_MS[1]), () => {
      this.runLive(this.director.randomScene(true, this.clock()));
      this.scheduleNext();
    });
  }

  private runLive(scene: Scene, index = 0): void {
    const step = scene[index];
    if (!step) return;
    this.later(step.delayMs, () => {
      step.run(this.clock());
      this.runLive(scene, index + 1);
    });
  }
}
