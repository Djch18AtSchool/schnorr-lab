/**
 * Alertas de la simulación: las mismas reglas genéricas y el mismo lenguaje que infra/telemetry.py.
 * Solo miran las peticiones y sus señales; no saben qué escena las produjo.
 */
import type { Alert, RequestRecord } from "../../../shared/types";
import { asRecord, hostOf } from "../../lib/requests";

export type AlertDraft = Omit<Alert, "id" | "timestamp">;

const LOCKOUT_EVIDENCE = 3;
const REJECTED = new Set(["auth.rejected", "auth.replay", "auth.stale", "auth.lockout", "auth.locked_attempt"]);

/** «el celular de Ana (192.168.1.23)», «la laptop de Eve (…)» o «un dispositivo desconocido (…)». */
function who(r: RequestRecord): string {
  const device = r.device !== "desconocido" ? r.device : "un dispositivo desconocido";
  const first = device.split(" ")[0];
  const article = device.startsWith("un ") ? "" : first === "celular" || first === "soporte" ? "el " : "la ";
  return `${article}${device} (${hostOf(r.client)})`;
}

const sentence = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const ago = (seconds: number): string => (seconds < 60 ? `${Math.round(seconds)} s` : `${Math.round(seconds / 60)} min`);

function matches(r: RequestRecord, evidence: Record<string, string>): boolean {
  const body = asRecord(r.request_body) ?? {};
  return Object.entries(evidence).every(([key, value]) => String(body[key]) === value);
}

function replayAlert(r: RequestRecord, user: string | null, evidence: Record<string, string>, history: readonly RequestRecord[]): AlertDraft {
  const earlier = history.filter((h) => h.id < r.id && matches(h, evidence));
  const first = earlier[0];
  const origin = first ? ` que ${who(first)} había enviado hace ${ago(r.timestamp - first.timestamp)}` : " que ya había llegado antes";
  return { severity: "alta", kind: "replay", title: "Repetición de un mensaje capturado", user_id: user, evidence: [...earlier.map((h) => h.id), r.id],
    detail: `${sentence(who(r))} reenvió un mensaje idéntico (${r.method} ${r.path})${origin}. El banco lo rechazó: lo capturado no sirve dos veces.` };
}

function lockoutAlert(r: RequestRecord, user: string, history: readonly RequestRecord[]): AlertDraft {
  const failures = history.filter((h) => h.id <= r.id && h.tags.user === user && h.signal !== null && REJECTED.has(h.signal)).slice(-LOCKOUT_EVIDENCE);
  const origins = [...new Set(failures.map(who))].sort().join(", ");
  return { severity: "alta", kind: "lockout", title: `Cuenta bloqueada: ${user}`, user_id: user, evidence: failures.map((h) => h.id),
    detail: `${failures.length} pruebas inválidas seguidas desde ${origins}. La cuenta de ${user} no recibe retos hasta que soporte la desbloquee.` };
}

const SIMPLE: Readonly<Record<string, (user: string, from: string) => Omit<AlertDraft, "user_id" | "evidence">>> = {
  "auth.rejected": (user, from) => ({ severity: "media", kind: "invalid_proof", title: `Prueba inválida para ${user}`,
    detail: `${sentence(from)} envió una prueba que no cumple la verificación para la cuenta de ${user}.` }),
  "auth.stale": (user, from) => ({ severity: "media", kind: "stale_proof", title: `Prueba vieja para ${user}`,
    detail: `${sentence(from)} envió una prueba no interactiva con la hora fuera de la ventana permitida.` }),
  "auth.locked_attempt": (user, from) => ({ severity: "media", kind: "locked_attempt", title: `Intento sobre una cuenta bloqueada: ${user}`,
    detail: `${sentence(from)} intentó iniciar sesión en la cuenta bloqueada de ${user}.` }),
};

/** Alertas que se deducen de una petición recién atendida (history ya la incluye). */
export function deduceAlerts(r: RequestRecord, signals: readonly string[], evidence: Record<string, string> | undefined, history: readonly RequestRecord[]): AlertDraft[] {
  const user = r.tags.user ?? null;
  const drafts = signals.flatMap((signal): AlertDraft[] => {
    if (signal === "auth.replay") return [replayAlert(r, user, evidence ?? {}, history)];
    if (signal === "auth.lockout" && user) return [lockoutAlert(r, user, history)];
    if (!(signal in SIMPLE) || !user) return [];
    return [{ ...SIMPLE[signal](user, who(r)), user_id: user, evidence: [r.id] }];
  });
  if (r.status !== 422) return drafts;
  return [...drafts, { severity: "baja", kind: "malformed", title: "Mensaje mal formado", user_id: null, evidence: [r.id],
    detail: `${sentence(who(r))} envió un cuerpo que no cumple el formato de ${r.path}; el banco no lo procesó.` }];
}
