/**
 * Filtros de Actividad y los enlaces que llegan desde otras secciones: cada número de la Consola
 * abre Actividad con exactamente las peticiones que lo forman. Funciones puras.
 */
import type { Alert } from "../../shared/types";
import type { Attempt } from "./attempts";
import { hostOf } from "./requests";

export type OutcomeFilter = "todos" | "concedido" | "rechazado" | "otros";

export interface ActivityQuery {
  device: string | null;
  outcome: OutcomeFilter;
  user: string | null;
  search: string;
  /** Solo estas peticiones (la evidencia de una alerta). */
  ids: readonly number[] | null;
  /** Solo intentos que terminaron desde este instante (epoch s). */
  since: number | null;
  /** Qué representa el filtro cuando viene de un enlace: «Evidencia: Cuenta bloqueada: ana». */
  label: string | null;
}

export const EMPTY_QUERY: ActivityQuery = { device: null, outcome: "todos", user: null, search: "", ids: null, since: null, label: null };

export const isFiltered = (q: ActivityQuery): boolean =>
  q.device !== null || q.outcome !== "todos" || q.user !== null || q.search.trim() !== "" || q.ids !== null || q.since !== null;

function matchesOutcome(attempt: Attempt, outcome: OutcomeFilter): boolean {
  const isAuth = attempt.kind === "interactivo" || attempt.kind === "no_interactivo";
  if (outcome === "concedido") return isAuth && attempt.outcome.tone === "ok";
  if (outcome === "rechazado") return attempt.outcome.tone === "bad";
  if (outcome === "otros") return attempt.outcome.tone === "neutral" || attempt.outcome.tone === "warn" || (!isAuth && attempt.outcome.tone === "ok");
  return true;
}

function haystack(attempt: Attempt): string[] {
  return [attempt.title, attempt.user, attempt.device, hostOf(attempt.client), attempt.outcome.label,
    ...attempt.requests.flatMap((r) => [r.path, String(r.status), r.tags.session ?? null])]
    .filter((value): value is string => value !== null)
    .map((value) => value.toLowerCase());
}

export function matchesAttempt(attempt: Attempt, q: ActivityQuery): boolean {
  if (q.ids && !attempt.requests.some((r) => q.ids?.includes(r.id))) return false;
  if (q.since !== null && attempt.end < q.since) return false;
  if (q.device !== null && attempt.device !== q.device) return false;
  if (q.user !== null && attempt.user !== q.user) return false;
  if (!matchesOutcome(attempt, q.outcome)) return false;
  const needle = q.search.trim().toLowerCase();
  return !needle || haystack(attempt).some((value) => value.includes(needle));
}

// ---------------------------------------------------------------- enlaces

export const linkOutcome = (outcome: OutcomeFilter, since: number | null, label: string): ActivityQuery =>
  ({ ...EMPTY_QUERY, outcome, since, label });

export const linkEvidence = (alert: Alert): ActivityQuery =>
  ({ ...EMPTY_QUERY, ids: [...alert.evidence], label: `Evidencia: ${alert.title}` });

export const linkUser = (user: string): ActivityQuery => ({ ...EMPTY_QUERY, user, label: `Cuenta ${user}` });

export const linkSince = (since: number | null, label: string): ActivityQuery => ({ ...EMPTY_QUERY, since, label });
