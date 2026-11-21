/**
 * Capa de datos de la Consola: una interfaz y dos implementaciones (banco real o simulación).
 * Los tipos del banco vienen del contrato (shared/types.ts); aquí solo se agregan los de los
 * archivos de resultados (results/*.json) y el documento OpenAPI, que el contrato no describe.
 */
import type {
  Account,
  Alert,
  AuditEntry,
  BankEvent,
  BankMechanism,
  RequestDetail,
  RequestRecord,
  TestReport,
} from "../../shared/types";
import type { ComparisonResults, ExperimentResults } from "./labTypes";

/** Una fila de results/latency.json: mediana de un inicio de sesión completo. */
export interface LatencyRow {
  name: string;
  family: string;            // safe | rfc | ffdhe | schnorr
  series: string;
  bits_p: number;
  bits_q: number;
  security_bits: string;     // "<80" | "80" | "112" | ...
  backend: string;           // propia | nativa | gmpy2
  reps: number;
  median_s: number;
  /** Paso anterior de la misma familia y la razón medida frente a las predichas (k³ y k^2.585). */
  previous: string | null;
  ratio: number | null;
  pred_k3: number | null;
  pred_karatsuba: number | null;
  err_k3: number | null;
  err_karatsuba: number | null;
}

export interface LatencyResults {
  python: string;
  platform: string;
  rows: LatencyRow[];
}

export interface BsgsRow {
  q_bits: number;
  p_bits: number;
  operations: number;
  seconds: number;
  x_real: number;
  x_found: number;
}

export interface BsgsPrediction {
  q_bits: number;
  operations: number;
  seconds: number;
  years: number;
}

/** results/bsgs.json: despeje de x con baby-step giant-step, medido y extrapolado. */
export interface BsgsResults {
  rows: BsgsRow[];
  fit: { seconds_per_operation: number; growth_exponent: number; expected_growth_exponent: number };
  holdout: { q_bits: number; relative_error: number };
  predictions: BsgsPrediction[];
  universe_age_years: number;
}

export type LabFileKey = "latency" | "bsgs" | "comparacion" | "experimentos";

/** Estado de un archivo de results/: leído, ausente (aún no se generó) o mal formado. */
export interface LabFileState {
  status: "ok" | "falta" | "invalido";
  detail?: string;
}

export interface LabResults {
  latency: LatencyResults | null;
  bsgs: BsgsResults | null;
  comparacion: ComparisonResults | null;
  experimentos: ExperimentResults | null;
  files: Readonly<Record<LabFileKey, LabFileState>>;
}

/** Una operación de /openapi.json reducida a lo que muestra la sección API. */
export interface ApiRoute {
  method: string;
  path: string;
  summary: string;
  tag: string;
}

export interface ApiRoutes {
  routes: ApiRoute[];
  /** "openapi" si se leyeron de /openapi.json; "respaldo" si es la lista conocida. */
  origin: "openapi" | "respaldo";
}

export type SourceKind = "real" | "simulada";

/** Todo lo que la Consola lee del banco. Ambas fuentes devuelven exactamente los tipos del contrato. */
export interface ConsoleDataSource {
  readonly kind: SourceKind;
  requests(since: number, limit: number): Promise<RequestRecord[]>;
  /** Una petición con los eventos que el banco publicó al atenderla (log, función y cálculos). */
  requestDetail(id: number): Promise<RequestDetail>;
  alerts(): Promise<Alert[]>;
  accounts(): Promise<Account[]>;
  audit(): Promise<AuditEntry[]>;
  mechanisms(): Promise<BankMechanism[]>;
  tests(): Promise<TestReport>;
  results(): Promise<LabResults>;
  routes(): Promise<ApiRoutes>;
  /** Escucha los eventos en vivo; devuelve la función para dejar de escuchar. */
  stream(onEvent: (event: BankEvent) => void, onStatus: (online: boolean) => void): () => void;
}
