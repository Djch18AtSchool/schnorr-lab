/**
 * Servidor simulado: atiende una petición con el banco simulado y deja el mismo rastro que el banco
 * real: RequestRecord con etiquetas, eventos con request_id (log, función, cálculos, acceso),
 * auditoría, alertas y dispositivos por cuenta. Todo cumple el contrato de shared/types.ts.
 */
import type { Account, Alert, AuditEntry, BankEvent, RequestDetail, RequestRecord } from "../../../shared/types";
import { isAuditedPath } from "../../lib/audit";
import { SimBank, type RouteResult } from "./bank";
import { deduceAlerts } from "./observer";
import type { Rng } from "./rng";
import { TOY } from "./toy";

export interface Origin {
  device: string;
  ip: string;
  ua: string;
}

export interface Send {
  method: "GET" | "POST" | "DELETE";
  path: string;
  body: Record<string, unknown> | null;
  origin: Origin;
  ts: number;
  correlation: string;
  forcedC?: number;
}

const LATENCY_MS: Readonly<Record<string, readonly [number, number]>> = {
  params: [0.4, 1.1], register: [1.8, 3.2], commit: [0.8, 1.6], respond: [0.6, 1.5], nizk: [1.0, 1.9], users: [0.7, 1.3], admin: [1.9, 3.1],
};
const SPIKE_PROBABILITY = 0.04;
const MAX_KEPT = 5000;

type Listener = (event: BankEvent) => void;

interface SeenDevice {
  device: string;
  client: string;
  last_seen: number;
  requests: number;
}

export class SimEngine {
  readonly bank = new SimBank();
  readonly requests: RequestRecord[] = [];
  readonly events: BankEvent[] = [];
  readonly audit: AuditEntry[] = [];
  readonly alerts: Alert[] = [];
  private readonly lastLogin = new Map<string, number>();
  private readonly devices = new Map<string, Map<string, SeenDevice>>();
  private readonly listeners = new Set<Listener>();

  constructor(private readonly rng: Rng) {}

  onEvent(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  http(send: Send): RequestRecord {
    const result = this.route(send);
    const id = (this.requests[this.requests.length - 1]?.id ?? 0) + 1;
    const record: RequestRecord = {
      id, timestamp: send.ts, method: send.method, path: send.path, route: send.path, status: result.status, duration_ms: this.latency(send.path),
      client: send.origin.ip, user_agent: send.origin.ua, device: send.origin.device, correlation_id: send.correlation,
      mechanism: send.path.startsWith("/zkp/") || send.path.startsWith("/admin/") ? "zkp" : null, request_body: send.body, response_body: result.body,
      signal: result.signals[result.signals.length - 1] ?? null, tags: result.tags,
    };
    keep(this.requests, record);
    if (isAuditedPath(send.method, send.path)) this.audit.push({ endpoint: send.path, mechanism: "zkp", valid: true, body: send.body, timestamp: record.timestamp, request_id: record.id });
    result.logs.forEach((l) => this.publish(record, l.kind, l.title, l.data));
    this.publish(record, "acceso", `"${record.method} ${record.path} HTTP/1.1" ${record.status}`, {
      method: record.method, path: record.path, status: record.status, duration_ms: record.duration_ms, client: record.client,
      user_agent: record.user_agent, device: record.device, request_id: record.id,
    });
    this.track(record, result.signals);
    deduceAlerts(record, result.signals, result.evidence, this.requests).forEach((draft) => {
      const alert: Alert = { ...draft, id: this.alerts.length + 1, timestamp: record.timestamp };
      this.alerts.push(alert);
      this.publish(record, "alerta", alert.title, { ...alert });
    });
    return record;
  }

  detail(id: number): RequestDetail | null {
    const request = this.requests.find((r) => r.id === id);
    return request ? { request, events: this.events.filter((e) => e.request_id === id) } : null;
  }

  accounts(): Account[] {
    return [...this.bank.users].map(([user_id, u]) => ({
      mechanism: "zkp", user_id, stored: { y: String(u.y) }, status: this.bank.isLocked(user_id) ? "bloqueada" : "activa",
      attempts_left: this.bank.attemptsLeft(user_id), created_at: u.created, last_login_at: this.lastLogin.get(user_id) ?? null,
      devices: [...(this.devices.get(user_id)?.values() ?? [])].sort((a, b) => b.last_seen - a.last_seen),
    }));
  }

  private route(send: Send): RouteResult {
    const body = send.body ?? {};
    const draws = { challenge: () => this.rng.int(0, TOY.q - 1), sessionId: () => this.rng.hex(8) };
    if (send.path.startsWith("/admin/accounts/zkp/")) {
      const user = send.path.split("/")[4] ?? "";
      return this.bank.admin(user, send.method === "DELETE" ? "remove" : "unlock");
    }
    switch (`${send.method} ${send.path}`) {
      case "GET /zkp/params": return this.bank.params();
      case "POST /zkp/register": return this.bank.register(body, send.ts);
      case "POST /zkp/login/commit": return this.bank.commit(body, draws, send.forcedC ?? null);
      case "POST /zkp/login/respond": return this.bank.respond(body);
      case "POST /zkp/login/nizk": return this.bank.nizk(body, send.ts);
      case "GET /bank/users": {
        const zkp = Object.fromEntries([...this.bank.users].map(([user, u]) => [user, { y: String(u.y) }]));
        return { status: 200, body: { zkp, password: {}, totp: {}, srp: {} }, signals: [], tags: {}, logs: [] };
      }
      default: return { status: 404, body: { detail: "Not Found" }, signals: [], tags: {}, logs: [] };
    }
  }

  /** Dispositivos por cuenta y último acceso, como Telemetry._track_accounts. */
  private track(record: RequestRecord, signals: readonly string[]): void {
    const user = record.tags.user;
    if (!user || !signals.length) return;
    const seen = this.devices.get(user) ?? new Map<string, SeenDevice>();
    const previous = seen.get(record.device);
    seen.set(record.device, { device: record.device, client: record.client, last_seen: record.timestamp, requests: (previous?.requests ?? 0) + 1 });
    this.devices.set(user, seen);
    if (signals.includes("auth.ok")) this.lastLogin.set(user, record.timestamp);
  }

  private publish(record: RequestRecord, kind: string, title: string, data: Record<string, unknown>): void {
    const event: BankEvent = {
      id: (this.events[this.events.length - 1]?.id ?? 0) + 1, timestamp: record.timestamp, source: "banco", kind, title,
      mechanism: record.mechanism, correlation_id: record.correlation_id, data, request_id: record.id,
    };
    keep(this.events, event);
    this.listeners.forEach((listener) => listener(event));
  }

  private latency(path: string): number {
    const key = path.startsWith("/admin/") ? "admin" : path.split("/").pop() ?? "";
    const [lo, hi] = LATENCY_MS[key] ?? [0.6, 1.4];
    const spike = this.rng.next() < SPIKE_PROBABILITY ? this.rng.range(2, 3.5) : 1;
    return Math.round(this.rng.range(lo, hi) * spike * 100) / 100;
  }
}

function keep<T>(list: T[], item: T): void {
  list.push(item);
  if (list.length > MAX_KEPT) list.splice(0, list.length - MAX_KEPT);
}
