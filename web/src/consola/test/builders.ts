/** Constructores de datos del contrato para las pruebas (solo los usan los archivos *.test.ts). */
import type { Alert, BankEvent, RequestRecord } from "../../shared/types";

export interface From {
  device: string;
  client: string;
}

export const ANA: From = { device: "celular de Ana", client: "192.168.1.23" };
export const EVE: From = { device: "laptop de Eve", client: "192.168.1.66" };
export const SUPPORT: From = { device: "soporte del banco", client: "10.0.0.5" };

export function req(partial: Partial<RequestRecord> & Pick<RequestRecord, "id">): RequestRecord {
  return {
    timestamp: 1000 + partial.id, method: "GET", path: "/zkp/params", route: partial.path ?? "/zkp/params", status: 200,
    duration_ms: 2, client: ANA.client, user_agent: "BancoLab-iOS/3.2", device: ANA.device, correlation_id: null,
    mechanism: "zkp", request_body: null, response_body: null, signal: null, tags: {}, ...partial,
  };
}

export const params = (id: number, from: From = ANA, timestamp = 1000 + id): RequestRecord => req({ id, timestamp, ...from });

export const commit = (id: number, user: string, session: string, from: From = ANA, timestamp = 1000 + id): RequestRecord =>
  req({ id, timestamp, method: "POST", path: "/zkp/login/commit", ...from, request_body: { user_id: user, t: "12" },
    response_body: { session_id: session, c: "3" }, signal: "auth.challenge", tags: { session, user } });

export const respond = (id: number, user: string, session: string, signal: string, from: From = ANA, timestamp = 1000 + id): RequestRecord =>
  req({ id, timestamp, method: "POST", path: "/zkp/login/respond", ...from, request_body: { session_id: session, s: "4" },
    response_body: { accepted: signal === "auth.ok", reason: "" }, signal, tags: { session, user } });

export function alert(partial: Partial<Alert> & Pick<Alert, "id">): Alert {
  return { timestamp: 2000 + partial.id, severity: "media", kind: "invalid_proof", title: "Prueba inválida para ana", detail: "", user_id: "ana", evidence: [], ...partial };
}

export function event(partial: Partial<BankEvent> & Pick<BankEvent, "id" | "kind">): BankEvent {
  return { timestamp: 1795248932.25, source: "banco", title: "", mechanism: null, correlation_id: null, data: {}, request_id: null, ...partial };
}
