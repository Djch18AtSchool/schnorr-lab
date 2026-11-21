/**
 * Fuente real: los endpoints del banco (la Consola se sirve desde el propio banco en /consola/, así
 * que las rutas son relativas al origen) y el flujo SSE /events/stream.
 */
import { ApiError, api, listen } from "../../shared/api";
import type { Account, Alert, AuditEntry, BankEvent, BankMechanism, RequestRecord, TelemetrySummary, TestReport } from "../../shared/types";
import { buildLabResults, LAB_FILES, listedFiles, rawBody, type RawLabFile } from "../lib/labFiles";
import { parseOpenApi } from "../lib/results";
import { FALLBACK_ROUTES } from "./routes";
import type { ApiRoutes, ConsoleDataSource, LabFileKey, LabResults } from "./source";

/** Máximo que acepta GET /events por página (MAX_EVENTS_PAGE en api/app.py). */
const EVENTS_PAGE = 5000;

/** Mensaje legible de un fallo, con la ruta: "GET /telemetry/summary → 404 Not Found". */
export function describeFailure(method: string, url: string, error: unknown): string {
  const route = `${method} ${url.split("?")[0]}`;
  if (error instanceof ApiError) return `${route} → ${error.status} ${error.message.replace(/^\d{3}\s*/, "")}`.trim();
  if (error instanceof SyntaxError) return `${route} → la respuesta no es JSON`;
  if (error instanceof TypeError) return `${route} → sin conexión con el banco`;
  return `${route} → ${error instanceof Error ? error.message : String(error)}`;
}

async function call<T>(url: string, init?: { method: "POST"; body: unknown }): Promise<T> {
  try {
    return await api<T>(url, init);
  } catch (error: unknown) {
    throw new Error(describeFailure(init?.method ?? "GET", url, error), { cause: error });
  }
}

/** Lista JSON validada como arreglo (un 200 con otra forma es un error del servidor, no una lista vacía). */
async function list<T>(url: string): Promise<T[]> {
  const body = await call<unknown>(url);
  if (!Array.isArray(body)) throw new Error(`GET ${url.split("?")[0]} → no devolvió una lista`);
  return body as T[];
}

/** Un archivo de resultados que puede no existir todavía: ausente si da 404, error si no se puede leer. */
async function optionalJson(url: string): Promise<RawLabFile> {
  try {
    return rawBody(await api<unknown>(url));
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 404) return { kind: "missing" };
    return { kind: "error", detail: describeFailure("GET", url, error) };
  }
}

/** Nombres que lista GET /lab/results; null si no se pudo leer (entonces se piden todos). */
async function listResults(): Promise<ReadonlySet<string> | null> {
  try {
    return listedFiles(await api<unknown>("/lab/results"));
  } catch {
    return null;
  }
}

export class RealSource implements ConsoleDataSource {
  readonly kind = "real" as const;

  summary(windowS: number): Promise<TelemetrySummary> {
    return call<TelemetrySummary>(`/telemetry/summary?window=${windowS}`);
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
    return call<TestReport>("/lab/tests");
  }

  /** Solo pide los archivos que el banco lista (así un archivo sin generar no produce un 404). */
  async results(): Promise<LabResults> {
    const listed = await listResults();
    const raws = await Promise.all(LAB_FILES.map(async ({ key, file }): Promise<[LabFileKey, RawLabFile]> => {
      if (listed && !listed.has(file)) return [key, { kind: "missing" }];
      return [key, await optionalJson(`/results/${file}`)];
    }));
    return buildLabResults(Object.fromEntries(raws) as Record<LabFileKey, RawLabFile>);
  }

  events(since: number): Promise<BankEvent[]> {
    return list<BankEvent>(`/events?since=${since}&limit=${EVENTS_PAGE}`);
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
    await call<unknown>("/lab/reset", { method: "POST", body: {} });
  }

  stream(onEvent: (event: BankEvent) => void, onStatus: (online: boolean) => void): () => void {
    return listen<BankEvent>("/events/stream", onEvent, onStatus);
  }
}
