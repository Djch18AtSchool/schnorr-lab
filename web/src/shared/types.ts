/**
 * Contrato entre el servidor (Python) y las dos interfaces (Escenario y Consola).
 *
 * - Proceso del celular (:8001): actos, flujos, wallet, eventos del celular y de Eve.
 * - Banco (:8000): mecanismos, eventos con trazas de código, telemetría, alertas y resultados.
 * Los enteros grandes viajan siempre como cadenas decimales.
 * El banco NO conoce los actos: solo recibe peticiones y las observa (telemetría y alertas).
 */

// ---------------------------------------------------------------- comunes

export type Actor = "ana" | "eve" | "banco";
/** Quién aparece en escena; "red" es el medio, siempre presente. */
export type CastMember = Actor | "red";
export type StepStatus = "ok" | "aceptado" | "rechazado" | "error";
export type RunStatus = "en_curso" | "aceptado" | "rechazado" | "error";

export interface StepInfo {
  id: string;
  actor: string;            // en un mecanismo: cliente | red | banco
  title: string;
  explanation: string;
  formula: string;
}

export interface FlowInfo {
  id: string;
  title: string;
  available: boolean;
  steps: StepInfo[];
}

export interface MechanismInfo {
  id: string;
  name: string;
  category: string;
  summary: string;
  flows: FlowInfo[];
}

export interface GroupOption {
  id: string;               // toy | safe-256 | ... | rfc-2048 | schnorr-2048 ...
  label: string;            // "p = 23 (ejemplo del escrito)"
  bits: number;
  q_bits: number;
  security_bits: number | null;
}

// ---------------------------------------------------------------- celular (:8001)

export interface PhoneConfig {
  bank_url: string;         // http://127.0.0.1:8000
  docs_url: string;         // Swagger del banco
  console_url: string;      // http://127.0.0.1:8000/consola
  mechanisms: MechanismInfo[];
  acts: ActInfo[];
  groups: GroupOption[];
  group: string;            // grupo activo del banco
}

export type ActStepKind = "compute" | "exchange" | "attack" | "narration";

export interface ActStepInfo {
  id: string;
  /** Quién actúa: ana (su celular), eve (su laptop) o banco (solo en narraciones). */
  actor: Actor;
  kind: ActStepKind;
  title: string;
  explanation: string;
  formula: string;
}

export interface ActInfo {
  id: string;               // registro | login | nizk | espia_respuesta | robo_base | impostor | espia_nizk | r_repetido
  title: string;
  summary: string;
  cast: CastMember[];       // p. ej. ["ana", "red", "banco"] o con "eve"
  mechanism: string;        // "zkp"
  available: boolean;
  steps: ActStepInfo[];
}

export interface Exchange {
  method: string;
  path: string;
  status: number;
  request_body: unknown;
  response_body: unknown;
  elapsed_ms: number;
  correlation_id: string | null;
  origin: Actor;            // ana | eve: quién envió el mensaje
}

export interface TerminalLine {
  kind: "cmd" | "out" | "dim" | "ok" | "bad";
  text: string;
}

export interface ActStepRecord {
  index: number;
  status: StepStatus;
  /** Valores a mostrar en la tarjeta (etiqueta → valor), p. ej. {"r (aleatorio, de un solo uso)": "5"}. */
  values: Record<string, string>;
  /** Cálculos con los números reales, uno por línea: "t = 4^5 mod 23 = 12". */
  math: string[];
  /** Mensajes HTTP que produjo el paso, en orden (0 en un cálculo, 1 en un intercambio, varios en un ataque). */
  exchanges: Exchange[];
  /** Líneas para la terminal de la laptop de Eve (solo pasos de Eve). */
  terminal: TerminalLine[];
  /** true si Eve estaba escuchando la red cuando este mensaje de Ana viajó (se copia a su laptop). */
  intercepted: boolean;
  message: string;
  duration_ms: number;
  /** Correlación: el banco la copia en sus eventos (así la terminal del banco muestra lo de este paso). */
  correlation_id: string;
}

export interface ActRun {
  id: string;
  act: string;
  title: string;
  user_id: string;
  group: string;
  status: RunStatus;
  next_index: number;
  cast: CastMember[];
  steps: Array<ActStepInfo & { record: ActStepRecord | null }>;
}

// ---------------------------------------------------------------- banco (:8000)

export type EventSource = "banco" | "cliente" | "atacante" | "sistema";

/**
 * Evento en tiempo real (GET /events, SSE /events/stream). Tipos del banco:
 * - "acceso": línea de acceso HTTP (data: AccessData)
 * - "registro" | "paso" | "verificacion" | "error": decisiones del mecanismo (data: MechanismEventData)
 * - "alerta": una alerta de seguridad deducida (data: Alert)
 * - "log": mensajes del sistema
 */
export interface BankEvent {
  id: number;
  timestamp: number;        // segundos (epoch)
  source: EventSource;
  kind: string;
  title: string;
  mechanism: string | null;
  correlation_id: string | null;
  data: Record<string, unknown>;
  /** Petición del banco durante la que ocurrió (eventos del mecanismo, acceso y alertas). */
  request_id: number | null;
}

export interface AccessData {
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  client: string;           // "192.168.1.23:52344"
  user_agent: string;
  device: string;           // "celular de Ana" | "laptop de Eve" | "desconocido"
}

/** Función que ejecutó el banco: se muestra en su terminal con la línea resaltada. */
export interface CodeSpan {
  file: string;             // "protocol/bank.py"
  function: string;         // "Bank._decide"
  /** Líneas con su número real en el archivo; si hay un salto entre números, se dibuja «…». */
  lines: Array<{ n: number; text: string }>;
  highlight: number[];      // números de línea resaltados
  tone: "ok" | "bad";
}

export interface MechanismEventData {
  /** Campos estructurados del log (clave → valor), p. ej. {user: "ana", t: "12", c: "3"}. */
  [field: string]: unknown;
  logger?: string;          // "banco.zkp"
  span?: CodeSpan;
  math?: string[];
  signal?: string;          // auth.ok | auth.rejected | auth.replay | auth.locked | auth.stale | ...
}

export interface RequestRecord {
  id: number;
  timestamp: number;
  method: string;
  path: string;
  route: string;
  status: number;
  duration_ms: number;
  client: string;
  user_agent: string;
  device: string;
  correlation_id: string | null;
  mechanism: string | null;
  request_body: unknown;
  response_body: unknown;
  signal: string | null;
  /** Etiquetas del mecanismo para agrupar: {user: "ana", session: "77991cce…"}. */
  tags: Record<string, string>;
}

/** GET /telemetry/requests/{id}: la petición y lo que el banco publicó al atenderla (log, span, cálculos). */
export interface RequestDetail {
  request: RequestRecord;
  events: BankEvent[];
}

export interface SeriesPoint {
  t: number;                // inicio del intervalo (epoch s)
  ok: number;               // accesos concedidos
  rejected: number;         // accesos rechazados
  other: number;            // lecturas, registros, retos
  error: number;            // 4xx/5xx
  p50_ms: number;
  p95_ms: number;
}

export interface RouteStats {
  method: string;
  route: string;
  count: number;
  errors: number;
  p50_ms: number;
  p95_ms: number;
}

export interface TelemetrySummary {
  now: number;
  started_at: number;
  window_s: number;
  bucket_s: number;
  requests_per_min: number;
  p50_ms: number;
  p95_ms: number;
  totals: {
    requests: number;
    auth_ok: number;
    auth_rejected: number;
    locked_accounts: number;
    errors_4xx: number;
    errors_5xx: number;
  };
  signals: Record<string, number>;
  series: SeriesPoint[];
  routes: RouteStats[];
}

export interface Alert {
  id: number;
  timestamp: number;
  severity: "alta" | "media" | "baja";
  kind: string;             // replay | lockout | invalid_proof | stale_proof | locked_attempt | malformed
  title: string;
  detail: string;
  user_id: string | null;
  evidence: number[];       // ids de RequestRecord que la sostienen
}

export interface Account {
  mechanism: string;
  user_id: string;
  stored: Record<string, string>;     // lo único que guarda el banco (zkp: {y})
  status: "activa" | "bloqueada";
  attempts_left: number | null;
  created_at: number | null;
  last_login_at: number | null;
  /** Dispositivos desde los que el banco vio actuar sobre la cuenta, el más reciente primero. */
  devices: Array<{ device: string; client: string; last_seen: number; requests: number }>;
}

export interface AuditEntry {
  endpoint: string;
  mechanism: string | null;
  valid: boolean;
  body: unknown;
}

export interface TestReport {
  generated_at: number;
  duration_s: number;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  requirements: Array<{
    id: string;             // R1..R11
    title: string;
    tests: Array<{ name: string; file: string; outcome: "passed" | "failed" | "skipped" }>;
  }>;
}

export interface BankMechanism extends MechanismInfo {
  server: Record<string, unknown>;    // zkp: {group, bits, q_bits, p, q, g}
}
