/**
 * Embudo de inicios de sesión deducido por correlación: el banco no sabe qué «acto» ocurre, solo
 * une compromiso, reto y respuesta por el X-Correlation-ID y la sesión emitida. Función pura.
 */
import type { RequestRecord } from "../../shared/types";
import { bodyField, flowOf, outcomeOf } from "./requests";

export interface Funnel {
  commits: number;
  challenges: number;
  ownResponses: number;
  granted: number;
  nizk: number;
  nizkGranted: number;
  unanswered: number;
}

const isCommit = (r: RequestRecord): boolean => r.path.endsWith("/login/commit");
const isRespond = (r: RequestRecord): boolean => r.path.endsWith("/login/respond");
const isNizk = (r: RequestRecord): boolean => r.path.endsWith("/login/nizk");

/**
 * Una respuesta cuenta como «a su sesión» si es la primera que usa una sesión emitida por el banco
 * y llega en el mismo flujo (correlación) que el compromiso que la pidió. Una respuesta repetida
 * desde otro flujo, o para una sesión ya usada, no cuenta.
 */
export function deduceFunnel(requests: readonly RequestRecord[]): Funnel {
  const issuedIn = new Map<string, string>();
  const used = new Set<string>();
  let ownResponses = 0;
  for (const r of requests) {
    const issued = isCommit(r) && r.status === 200 ? bodyField(r.response_body, "session_id") : null;
    if (issued) issuedIn.set(issued, flowOf(r));
    if (!isRespond(r)) continue;
    const session = bodyField(r.request_body, "session_id");
    if (!session || used.has(session) || !issuedIn.has(session)) continue;
    used.add(session);
    const sameFlow = r.correlation_id == null || issuedIn.get(session) === flowOf(r);
    if (sameFlow) ownResponses += 1;
  }
  const commits = requests.filter(isCommit);
  const challenges = commits.filter((r) => r.status === 200).length;
  const nizk = requests.filter(isNizk);
  return {
    commits: commits.length,
    challenges,
    ownResponses,
    granted: requests.filter((r) => isRespond(r) && outcomeOf(r) === "granted").length,
    nizk: nizk.length,
    nizkGranted: nizk.filter((r) => outcomeOf(r) === "granted").length,
    unanswered: Math.max(0, challenges - ownResponses),
  };
}
