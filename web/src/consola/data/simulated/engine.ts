/**
 * Servidor simulado completo: recibe una petición HTTP, la atiende con el banco simulado y deja el
 * mismo rastro que el banco real (RequestRecord, eventos «acceso» y del mecanismo, auditoría y
 * alertas deducidas). Todo lo que sale de aquí cumple el contrato de shared/types.ts.
 */
import type { Alert, AuditEntry, BankEvent, EventSource, RequestRecord } from "../../../shared/types";
import { SimBank, TOY_PARAMS, type Force, type RouteResult } from "./bank";
import { Observer, type AlertDraft } from "./observer";
import type { Rng } from "./rng";
import { TOY } from "./toy";

export interface Origin {
  ip: string;
  ua: string;
}

export interface Flow {
  origin: Origin;
  port: number;
  id: string;
  step: number;
  force: Force | null;
}

const AUDITED = new Set(["/zkp/register", "/zkp/login/commit", "/zkp/login/respond", "/zkp/login/nizk"]);
const BASE_LATENCY: Readonly<Record<string, readonly [number, number]>> = {
  "/zkp/params": [1.1, 2.4], "/zkp/register": [2.4, 4.8], "/zkp/login/commit": [2.9, 5.6], "/zkp/login/respond": [3.4, 6.8],
  "/zkp/login/nizk": [3.8, 7.4], "/bank/users": [1.4, 2.9], "/audit/log": [1.9, 5.5], "/mechanisms": [1.3, 2.6], "/lab/reset": [5.2, 9.1],
};
const SPIKE_PROBABILITY = 0.035;
const MAX_REQUESTS = 3000;
const MAX_EVENTS = 6000;

type Listener = (event: BankEvent) => void;

function deviceOf(ua: string): string {
  if (ua.startsWith("BancoLab/")) return "celular (app Banco Lab)";
  if (ua.startsWith("python-httpx")) return "script python-httpx";
  if (ua.startsWith("BancoLab-Escenario")) return "Escenario del laboratorio";
  if (ua.includes("Swagger")) return "navegador (Swagger UI)";
  if (ua.startsWith("curl")) return "curl";
  return "desconocido";
}

export class SimEngine {
  readonly bank = new SimBank();
  readonly requests: RequestRecord[] = [];
  readonly events: BankEvent[] = [];
  readonly audit: AuditEntry[] = [];
  readonly alerts: Alert[] = [];
  readonly lastLogin = new Map<string, number>();
  startedAt = 0;
  private subscribers = 0;
  private readonly observer = new Observer();
  private readonly listeners = new Set<Listener>();

  constructor(private readonly rng: Rng) {}

  onEvent(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  newFlow(origin: Origin, force: Force | null = null): Flow {
    return { origin, port: this.rng.int(40000, 64000), id: this.rng.hex(6), step: 0, force };
  }

  publish(ts: number, source: EventSource, kind: string, title: string, data: Record<string, unknown>, corr: string | null = null, mechanism: string | null = null): BankEvent {
    const event: BankEvent = { id: (this.events[this.events.length - 1]?.id ?? 0) + 1, timestamp: ts, source, kind, title, mechanism, correlation_id: corr, data };
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    this.listeners.forEach((listener) => listener(event));
    return event;
  }

  /** Una petición HTTP completa; `malformed` simula un cuerpo que la validación rechaza (422). */
  http(method: string, path: string, body: Record<string, unknown> | null, flow: Flow, ts: number, malformed: string | null = null): RequestRecord {
    flow.step += 1;
    const corr = `${flow.id}:${flow.step}`;
    const result = malformed
      ? { status: 422, body: { reason: malformed }, signal: null, logs: [{ kind: "error", title: `422 ${path}`, data: { logger: "api.validation", reason: malformed } }] }
      : this.route(method, path, body ?? {}, flow, ts);
    const rec = this.record(method, path, body, flow, ts, corr, result);
    this.trace(rec, result, malformed);
    const seen = { id: rec.id, ts, ip: flow.origin.ip, agent: flow.origin.ua, path };
    const drafts = this.observer.observe(seen, result, (u) => this.bank.isLocked(u), (u) => this.bank.attemptsLeft(u));
    const malformedAlert: AlertDraft[] = malformed
      ? [{ severity: "baja", kind: "malformed", title: "Cuerpo mal formado (422)", user_id: null, evidence: [rec.id], detail: `\`${malformed}\`. El cuerpo queda en la auditoría como inválido.` }]
      : [];
    [...malformedAlert, ...drafts].forEach((draft) => this.raise(draft, ts));
    if (result.succeededUser) this.lastLogin.set(result.succeededUser, ts);
    return rec;
  }

  private record(method: string, path: string, body: unknown, flow: Flow, ts: number, corr: string, result: RouteResult | { status: number; body: unknown; signal: string | null }): RequestRecord {
    const rec: RequestRecord = {
      id: (this.requests[this.requests.length - 1]?.id ?? 0) + 1, timestamp: ts, method, path, route: path, status: result.status,
      duration_ms: this.latency(path, result.status), client: `${flow.origin.ip}:${flow.port}`, user_agent: flow.origin.ua,
      device: deviceOf(flow.origin.ua), correlation_id: corr, mechanism: path.startsWith("/zkp/") ? "zkp" : null,
      request_body: body, response_body: result.body, signal: result.signal,
    };
    this.requests.push(rec);
    if (this.requests.length > MAX_REQUESTS) this.requests.splice(0, this.requests.length - MAX_REQUESTS);
    return rec;
  }

  /** Eventos que deja la petición: acceso, cuerpo auditado, decisiones del mecanismo y SSE. */
  private trace(rec: RequestRecord, result: { logs: ReadonlyArray<{ kind: string; title: string; data: Record<string, unknown> }> }, malformed: string | null): void {
    const corr = rec.correlation_id;
    this.publish(rec.timestamp, "banco", "acceso", `${rec.method} ${rec.path}`, {
      method: rec.method, path: rec.path, status: rec.status, duration_ms: rec.path.endsWith("/events/stream") ? null : rec.duration_ms,
      client: rec.client, user_agent: rec.user_agent, device: rec.device,
    }, corr, rec.mechanism);
    if (AUDITED.has(rec.path)) {
      this.audit.push({ endpoint: rec.path, mechanism: "zkp", valid: !malformed, body: rec.request_body });
      const fields = Object.keys((rec.request_body as Record<string, unknown> | null) ?? {}).join(",");
      this.publish(rec.timestamp, "banco", "log", "body", { logger: "banco.audit", level: "DEBUG", endpoint: rec.path, valid: !malformed, fields }, corr);
    }
    result.logs.forEach((log) => this.publish(rec.timestamp, "banco", log.kind, log.title, log.data, corr, rec.mechanism));
  }

  private raise(draft: AlertDraft, ts: number): void {
    const alert: Alert = { ...draft, id: this.alerts.length + 1, timestamp: ts };
    this.alerts.push(alert);
    this.publish(ts, "banco", "alerta", alert.title, { ...alert });
  }

  private latency(path: string, status: number): number {
    if (path.endsWith("/events/stream")) return 0;
    if (status === 422) return this.rng.range(0.9, 2.2);
    const [a, b] = BASE_LATENCY[path] ?? [1, 3];
    const spike = this.rng.next() < SPIKE_PROBABILITY ? this.rng.range(2.2, 3.6) : 1;
    return this.rng.range(a, b) * spike;
  }

  private route(method: string, path: string, body: Record<string, unknown>, flow: Flow, ts: number): RouteResult {
    const ok = (payload: unknown, logs: RouteResult["logs"] = []): RouteResult => ({ status: 200, body: payload, signal: null, logs });
    const draws = { challenge: () => this.rng.int(0, TOY.q - 1), sessionId: () => this.rng.hex(8) };
    switch (`${method} ${path}`) {
      case "GET /zkp/params": return ok(TOY_PARAMS);
      case "POST /zkp/register": return this.bank.register(body, ts);
      case "POST /zkp/login/commit": return this.bank.commit(body, draws, flow.force);
      case "POST /zkp/login/respond": return this.bank.respond(body);
      case "POST /zkp/login/nizk": return this.bank.nizk(body, ts);
      case "GET /bank/users": return ok({ zkp: Object.fromEntries([...this.bank.users].map(([id, u]) => [id, { y: String(u.y) }])) });
      case "GET /audit/log": return ok(this.audit.slice(-50));
      case "GET /mechanisms": return ok([{ id: "zkp", server: { group: TOY.name, bits: TOY.bits } }]);
      case "GET /events/stream": return this.openStream();
      case "POST /lab/reset": return this.resetBank(ts);
      default: return { status: 404, body: { detail: "Not Found" }, signal: null, logs: [] };
    }
  }

  private openStream(): RouteResult {
    this.subscribers += 1;
    return { status: 200, body: "event: log\ndata: {\"title\":\"Conexión establecida\"}\n\n…", signal: null,
      logs: [{ kind: "log", title: `nuevo suscriptor (${this.subscribers} activos)`, data: { logger: "banco.sse", level: "DEBUG" } }] };
  }

  private resetBank(ts: number): RouteResult {
    this.bank.reset();
    this.observer.reset();
    this.audit.splice(0, this.audit.length);
    this.lastLogin.clear();
    this.publish(ts, "sistema", "log", `Banco reiniciado con el grupo ${TOY.name}: usuarios, sesiones y auditoría borrados`, { logger: "banco.lab" });
    return { status: 200, body: [{ id: "zkp", server: { group: TOY.name } }], signal: null, logs: [] };
  }
}
