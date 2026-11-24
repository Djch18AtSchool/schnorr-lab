/** Cliente HTTP y de eventos en vivo, compartido por el Escenario y la Consola. */

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function reasonOf(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.reason === "string") return record.reason;
    if (typeof record.detail === "string") return record.detail;
  }
  return fallback;
}

/** GET/POST JSON; lanza ApiError con el motivo que explica el servidor. */
export async function api<T>(url: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : null;
  if (!response.ok) throw new ApiError(reasonOf(body, `${response.status} ${response.statusText}`), response.status);
  return body as T;
}

/**
 * Escucha un flujo SSE y entrega cada evento ya parseado. Reconecta solo (EventSource) y
 * reanuda desde el último id. Devuelve la función para cerrar la conexión.
 *
 * El servidor manda todos los eventos sin nombre (el tipo va en el JSON): así onerror solo
 * se dispara cuando de verdad se corta la conexión, y no con un evento de tipo «error».
 */
export function listen<T>(url: string, onEvent: (event: T) => void, onStatus?: (online: boolean) => void): () => void {
  const source = new EventSource(url);
  source.onmessage = (message: MessageEvent<string>) => onEvent(JSON.parse(message.data) as T);
  source.onopen = () => onStatus?.(true);
  source.onerror = () => onStatus?.(false);
  return () => source.close();
}
