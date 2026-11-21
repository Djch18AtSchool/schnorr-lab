/** Constructores de datos del contrato para las pruebas (solo los usan los archivos *.test.ts). */
import type { Alert, BankEvent, RequestRecord } from "../../shared/types";

export function req(partial: Partial<RequestRecord> & Pick<RequestRecord, "id">): RequestRecord {
  return {
    timestamp: 1000 + partial.id, method: "GET", path: "/zkp/params", route: partial.path ?? "/zkp/params", status: 200,
    duration_ms: 2, client: "192.168.1.23:50000", user_agent: "BancoLab/2.3", device: "celular", correlation_id: null,
    mechanism: "zkp", request_body: null, response_body: null, signal: null, ...partial,
  };
}

export const commit = (id: number, user: string, session: string, corr: string, status = 200): RequestRecord =>
  req({ id, method: "POST", path: "/zkp/login/commit", status, correlation_id: corr, request_body: { user_id: user, t: "12" },
    response_body: status === 200 ? { session_id: session, c: "3" } : { reason: "Usuario no registrado" } });

export const respond = (id: number, session: string, corr: string, accepted: boolean, reason = accepted ? "Acceso concedido" : "Sesión inválida"): RequestRecord =>
  req({ id, method: "POST", path: "/zkp/login/respond", correlation_id: corr, request_body: { session_id: session, s: "4" },
    response_body: { accepted, reason, transcript: null, details: {}, attempts_left: null }, signal: accepted ? "auth.ok" : "auth.replay" });

export function alert(partial: Partial<Alert> & Pick<Alert, "id">): Alert {
  return { timestamp: 2000 + partial.id, severity: "media", kind: "invalid_proof", title: "Prueba inválida para ana", detail: "", user_id: "ana", evidence: [], ...partial };
}

export function event(partial: Partial<BankEvent> & Pick<BankEvent, "id" | "kind">): BankEvent {
  return { timestamp: 1795248932.25, source: "banco", title: "", mechanism: null, correlation_id: null, data: {}, ...partial };
}
