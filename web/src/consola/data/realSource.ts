/**
 * Fuente real: los endpoints del banco (la Consola se sirve desde el propio banco en /consola/, así
 * que las rutas son relativas al origen) y el flujo SSE /events/stream.
 */
import { api, listen } from "../../shared/api";
import type { Account, Alert, AuditEntry, BankEvent, BankMechanism, RequestRecord, TelemetrySummary, TestReport } from "../../shared/types";
import { parseBsgs, parseLatency, parseOpenApi } from "../lib/results";
import { FALLBACK_ROUTES } from "./routes";
import type { ApiRoutes, ConsoleDataSource, LabResults } from "./source";

/** Lista JSON validada como arreglo (un 200 con otra forma es un error del servidor, no una lista vacía). */
async function list<T>(url: string): Promise<T[]> {
  const body = await api<unknown>(url);
  if (!Array.isArray(body)) throw new Error(`${url} no devolvió una lista`);
  return body as T[];
}

/** Un archivo de resultados que puede no existir todavía: null si falta, error si está mal formado. */
async function optionalJson(url: string): Promise<unknown> {
  try {
    return await api<unknown>(url);
  } catch (error: unknown) {
    if (error instanceof Error && "status" in error && error.status === 404) return null;
    throw error;
  }
}

export class RealSource implements ConsoleDataSource {
  readonly kind = "real" as const;

  summary(windowS: number): Promise<TelemetrySummary> {
    return api<TelemetrySummary>(`/telemetry/summary?window=${windowS}`);
  }

  requests(since: number, limit: number): Promise<RequestRecord[]> {
    return list<RequestRecord>(`/telemetry/requests?since=${since}&limit=${limit}`);
  }

  alerts(): Promise<Alert[]> {
    return list<Alert>("/telemetry/alerts");
  }

  accounts(): Promise<Account[]> {
    return list<Account>("/bank/accounts");
  }

  audit(): Promise<AuditEntry[]> {
    return list<AuditEntry>("/audit/log");
  }

  mechanisms(): Promise<BankMechanism[]> {
    return list<BankMechanism>("/mechanisms");
  }

  tests(): Promise<TestReport> {
    return api<TestReport>("/lab/tests");
  }

  async results(): Promise<LabResults> {
    const [latency, bsgs] = await Promise.all([optionalJson("/results/latency.json"), optionalJson("/results/bsgs.json")]);
    return { latency: parseLatency(latency), bsgs: parseBsgs(bsgs) };
  }

  events(since: number): Promise<BankEvent[]> {
    return list<BankEvent>(`/events?since=${since}`);
  }

  /** Rutas de /openapi.json; si no está o no trae rutas, la lista conocida del banco. */
  async routes(): Promise<ApiRoutes> {
    const fallback: ApiRoutes = { routes: [...FALLBACK_ROUTES], origin: "respaldo" };
    try {
      const parsed = parseOpenApi(await api<unknown>("/openapi.json"));
      return parsed.length ? { routes: parsed, origin: "openapi" } : fallback;
    } catch {
      return fallback;
    }
  }

  async reset(): Promise<void> {
    await api<unknown>("/lab/reset", { method: "POST", body: {} });
  }

  stream(onEvent: (event: BankEvent) => void, onStatus: (online: boolean) => void): () => void {
    return listen<BankEvent>("/events/stream", onEvent, onStatus);
  }
}
