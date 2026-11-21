/**
 * Agrupa las peticiones en intentos: lo que un dispositivo quiso hacer de principio a fin.
 *
 * - Un inicio de sesión interactivo son las peticiones con la misma sesión (tags.session) desde el
 *   mismo dispositivo: commit → respond. Si otro dispositivo reenvía esa respuesta, es otro intento.
 * - Un GET /zkp/params se pega al intento siguiente del mismo dispositivo si llega a tiempo.
 * - Registro, prueba no interactiva, acción de soporte o consulta: un intento cada uno.
 * Funciones puras: no dependen de los actos del Escenario, solo de lo que vio el banco.
 */
import type { RequestRecord } from "../../shared/types";
import { requestOutcome, userOf, type RequestOutcome } from "./requests";

export type AttemptKind = "interactivo" | "no_interactivo" | "registro" | "soporte" | "consulta";

export interface Attempt {
  key: string;
  kind: AttemptKind;
  title: string;
  requests: readonly RequestRecord[];
  user: string | null;
  device: string;
  client: string;
  start: number;
  end: number;
  /** Desde que salió la primera petición hasta que el banco respondió la última. */
  durationMs: number;
  outcome: RequestOutcome;
}

/** Un GET /zkp/params forma parte del intento que empieza a lo sumo este tiempo después. */
export const PARAMS_WINDOW_S = 60;

interface Draft {
  key: string;
  kind: AttemptKind;
  requests: RequestRecord[];
}

const MS_PER_S = 1000;

function kindOf(r: RequestRecord): AttemptKind | "params" {
  const path = r.path;
  if (path.startsWith("/admin/")) return "soporte";
  if (path.endsWith("/login/nizk")) return "no_interactivo";
  if (path.includes("/login/")) return "interactivo";
  if (path.endsWith("/register")) return "registro";
  if (r.method === "GET" && path.endsWith("/params")) return "params";
  return "consulta";
}

const READ_TITLES: Readonly<Record<string, string>> = {
  "/bank/users": "Lectura de las claves públicas guardadas",
  "/zkp/params": "Parámetros públicos",
};

function titleOf(kind: AttemptKind, requests: readonly RequestRecord[]): string {
  const last = requests[requests.length - 1];
  switch (kind) {
    case "interactivo": return "Inicio de sesión";
    case "no_interactivo": return "Inicio de sesión no interactivo";
    case "registro": return "Registro de cuenta";
    case "soporte": return last.method === "DELETE" ? "Soporte da de baja la cuenta" : "Soporte desbloquea la cuenta";
    case "consulta": return READ_TITLES[last.path] ?? `${last.method} ${last.path}`;
  }
}

/** El resultado del intento: el de su última petición decisiva (un reto sin respuesta queda pendiente). */
function outcomeOf(kind: AttemptKind, requests: readonly RequestRecord[]): RequestOutcome {
  const decisive = [...requests].reverse().find((r) => kindOf(r) !== "params") ?? requests[requests.length - 1];
  const outcome = requestOutcome(decisive);
  const awaiting = kind === "interactivo" && decisive.path.endsWith("/login/commit") && decisive.status < 300;
  return awaiting ? { label: "Reto sin responder", tone: "neutral" } : outcome;
}

function finish(draft: Draft): Attempt {
  const requests = draft.requests;
  const first = requests[0];
  const last = requests[requests.length - 1];
  return {
    key: draft.key,
    kind: draft.kind,
    title: titleOf(draft.kind, requests),
    requests,
    user: requests.map(userOf).find((u) => u !== null) ?? null,
    device: last.device,
    client: last.client,
    start: first.timestamp,
    end: last.timestamp,
    durationMs: (last.timestamp - first.timestamp) * MS_PER_S + first.duration_ms,
    outcome: outcomeOf(draft.kind, requests),
  };
}

/** Intentos en orden de inicio (el más antiguo primero). */
export function groupAttempts(requests: readonly RequestRecord[]): Attempt[] {
  const drafts: Draft[] = [];
  const bySession = new Map<string, Draft>();
  const pendingParams = new Map<string, RequestRecord>();
  const single = (r: RequestRecord): Draft => ({ key: `r${r.id}`, kind: "consulta", requests: [r] });
  const takeParams = (r: RequestRecord): RequestRecord[] => {
    const params = pendingParams.get(r.device);
    if (!params) return [];
    pendingParams.delete(r.device);
    if (r.timestamp - params.timestamp <= PARAMS_WINDOW_S) return [params];
    drafts.push(single(params));
    return [];
  };
  for (const r of [...requests].sort((a, b) => a.id - b.id)) {
    const kind = kindOf(r);
    if (kind === "params") {
      const previous = pendingParams.get(r.device);
      if (previous) drafts.push(single(previous));
      pendingParams.set(r.device, r);
      continue;
    }
    const sessionKey = r.tags.session ? `s:${r.tags.session}:${r.device}` : null;
    const open = sessionKey ? bySession.get(sessionKey) : undefined;
    if (open) {
      open.requests.push(r);
      continue;
    }
    const lead = kind === "consulta" || kind === "soporte" ? [] : takeParams(r);
    const draft: Draft = { key: sessionKey ?? `r${r.id}`, kind, requests: [...lead, r] };
    drafts.push(draft);
    if (sessionKey) bySession.set(sessionKey, draft);
  }
  pendingParams.forEach((params) => drafts.push(single(params)));
  return drafts.map(finish).sort((a, b) => a.requests[0].id - b.requests[0].id);
}

/** Índice petición → intento (para abrir el intento de una petición elegida en otra sección). */
export function attemptIndex(attempts: readonly Attempt[]): ReadonlyMap<number, Attempt> {
  return new Map(attempts.flatMap((a) => a.requests.map((r): [number, Attempt] => [r.id, a])));
}
