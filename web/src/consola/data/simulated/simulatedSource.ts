/**
 * Fuente simulada (?fuente=simulada): el banco corriendo en el navegador con los actos del
 * Escenario. Arranca con unos minutos de historial y sigue con un acto nuevo cada pocos segundos
 * mientras alguien escucha el flujo. Devuelve exactamente los tipos del contrato.
 */
import type { Account, Alert, AuditEntry, BankEvent, BankMechanism, RequestDetail, RequestRecord, TestReport } from "../../../shared/types";
import { ApiError } from "../../../shared/api";
import { FALLBACK_ROUTES } from "../routes";
import type { ApiRoutes, ConsoleDataSource, LabResults } from "../source";
import { Director } from "./director";
import { SimEngine } from "./engine";
import { MECHANISMS } from "./fixtures";
import { LAB_RESULTS, TEST_REPORT } from "./labData";
import { createRng, type Rng } from "./rng";
import type { Scene } from "./scenes";

const DEFAULT_SEED = 20261124;
const NOT_FOUND = 404;

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

  async requests(since: number, limit: number): Promise<RequestRecord[]> {
    return this.engine.requests.filter((r) => r.id > since).slice(0, limit);
  }

  async requestDetail(id: number): Promise<RequestDetail> {
    const detail = this.engine.detail(id);
    if (!detail) throw new ApiError(`No hay registro de la petición ${id}.`, NOT_FOUND);
    return detail;
  }

  async alerts(): Promise<Alert[]> {
    return [...this.engine.alerts];
  }

  async accounts(): Promise<Account[]> {
    return this.engine.accounts();
  }

  async audit(): Promise<AuditEntry[]> {
    return [...this.engine.audit];
  }

  async mechanisms(): Promise<BankMechanism[]> {
    return MECHANISMS;
  }

  async tests(): Promise<TestReport> {
    return TEST_REPORT;
  }

  async results(): Promise<LabResults> {
    return LAB_RESULTS;
  }

  async routes(): Promise<ApiRoutes> {
    return { routes: [...FALLBACK_ROUTES], origin: "respaldo" };
  }

  stream(onEvent: (event: BankEvent) => void, onStatus: (online: boolean) => void): () => void {
    const stop = this.engine.onEvent(onEvent);
    this.listeners += 1;
    if (this.listeners === 1) this.scheduleNext(this.director.gap());
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

  /** El acto siguiente se arma cuando termina el anterior (lee el estado del banco en ese momento). */
  private scheduleNext(delayMs: number): void {
    this.later(delayMs, () => this.runLive(this.director.next(), 0));
  }

  private runLive(scene: Scene, index: number): void {
    const step = scene[index];
    if (!step) {
      this.scheduleNext(this.director.gap());
      return;
    }
    this.later(step.delayMs, () => {
      step.run(this.clock());
      this.runLive(scene, index + 1);
    });
  }
}
