/**
 * La terminal del banco para una petición (GET /telemetry/requests/{id}): la línea de acceso, las
 * líneas de log del mecanismo, las alertas que provocó, la función que la atendió y los cálculos.
 * Usa el mismo formato que la terminal del Escenario (escenario/model/bankTerminal).
 */
import type { BankEvent, CodeSpan, RequestDetail, RequestRecord } from "../../shared/types";
import { accessLine, mechanismLine } from "../../escenario/model/bankTerminal";
import { codeSpanOf, mathOf } from "../../escenario/model/events";
import type { LogLine } from "../../escenario/model/types";
import { asRecord } from "./requests";
import { containsSecret } from "./audit";

export type { LogLine } from "../../escenario/model/types";

export interface TerminalView {
  lines: LogLine[];
  span: CodeSpan | null;
  math: string[];
  /** Paso a paso del cálculo (exponenciación rápida, Euclides) si el banco lo registró. */
  trace: string | null;
}

/** La línea de acceso sale de la propia petición (siempre existe, aunque el evento ya no esté). */
function accessEventOf(r: RequestRecord): BankEvent {
  return {
    id: 0, timestamp: r.timestamp, source: "banco", kind: "acceso", title: "", mechanism: r.mechanism, correlation_id: r.correlation_id,
    data: { method: r.method, path: r.path, status: r.status, duration_ms: r.duration_ms, client: r.client, user_agent: r.user_agent, device: r.device },
    request_id: r.id,
  };
}

function alertLine(event: BankEvent): LogLine {
  const severity = typeof event.data.severity === "string" ? event.data.severity : "media";
  return {
    level: severity === "baja" ? "INFO" : "WARN",
    tokens: [{ text: "banco.alertas", cls: "src" }, { text: "  alerta ", cls: "plain" }, { text: `"${event.title}"`, cls: "bad" }],
  };
}

const traceOf = (event: BankEvent): string | null =>
  typeof event.data.trace === "string" && event.data.trace.trim() ? event.data.trace : null;

export function terminalView(detail: RequestDetail): TerminalView {
  const events = [...detail.events].sort((a, b) => a.id - b.id).filter((e) => e.kind !== "acceso");
  const mechanism = events.filter((e) => e.kind !== "alerta");
  const alerts = events.filter((e) => e.kind === "alerta");
  const access = accessLine(accessEventOf(detail.request));
  const spans = mechanism.map((e) => codeSpanOf(e.data.span)).filter((s): s is CodeSpan => s !== null);
  return {
    lines: [...(access ? [access] : []), ...mechanism.map(mechanismLine), ...alerts.map(alertLine)],
    span: spans.length ? spans[spans.length - 1] : null,
    math: mechanism.flatMap(mathOf),
    trace: mechanism.map(traceOf).find((t) => t !== null) ?? null,
  };
}

export interface SecretCheck {
  /** Campos del cuerpo enviado al banco. */
  fields: string[];
  /** true si el cuerpo no contiene la clave x a ninguna profundidad. */
  safe: boolean;
}

/** ¿Viajó x en este mensaje? Solo aplica a peticiones con cuerpo. */
export function secretCheck(r: RequestRecord): SecretCheck | null {
  const body = asRecord(r.request_body);
  if (!body) return null;
  return { fields: Object.keys(body), safe: !containsSecret(body) };
}
