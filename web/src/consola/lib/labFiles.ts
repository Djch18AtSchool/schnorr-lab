/**
 * Los cuatro archivos de results/ que dibuja el Laboratorio: nombre, comando que los genera y cómo
 * se convierten en LabResults. Puro: la lectura (HTTP o import) la hace cada fuente de datos.
 */
import type { LabFileKey, LabFileState, LabResults } from "../data/source";
import { parseComparison, parseExperiments } from "./labParse";
import { parseBsgs, parseLatency } from "./results";

export interface LabFileInfo {
  key: LabFileKey;
  file: string;
  /** Comando, desde la raíz del repositorio, que vuelve a generar el archivo. */
  command: string;
}

export const LAB_FILES: readonly LabFileInfo[] = [
  { key: "comparacion", file: "comparacion.json", command: "python -m benchmark.compare" },
  { key: "latency", file: "latency.json", command: "python -m benchmark.latency" },
  { key: "bsgs", file: "bsgs.json", command: "python demo.py --option 4" },
  { key: "experimentos", file: "experimentos.json", command: "python -m benchmark.experiments" },
];

export const labFile = (key: LabFileKey): LabFileInfo => LAB_FILES.find((f) => f.key === key) ?? LAB_FILES[0];

/** Lo que devolvió la lectura de un archivo, antes de validarlo. */
export type RawLabFile =
  | { kind: "missing" }
  | { kind: "error"; detail: string }
  | { kind: "body"; body: unknown };

export const rawBody = (body: unknown): RawLabFile => ({ kind: "body", body });

const bodyOf = (raw: RawLabFile): unknown => (raw.kind === "body" ? raw.body : null);

function stateOf(raw: RawLabFile, parsed: unknown): LabFileState {
  if (raw.kind === "missing") return { status: "falta" };
  if (raw.kind === "error") return { status: "invalido", detail: raw.detail };
  return parsed === null ? { status: "invalido", detail: "el archivo no tiene la forma esperada" } : { status: "ok" };
}

/** Valida cada archivo por separado: uno ausente o roto no impide dibujar los demás. */
export function buildLabResults(raw: Readonly<Record<LabFileKey, RawLabFile>>): LabResults {
  const latency = parseLatency(bodyOf(raw.latency));
  const bsgs = parseBsgs(bodyOf(raw.bsgs));
  const comparacion = parseComparison(bodyOf(raw.comparacion));
  const experimentos = parseExperiments(bodyOf(raw.experimentos));
  return {
    latency, bsgs, comparacion, experimentos,
    files: {
      latency: stateOf(raw.latency, latency), bsgs: stateOf(raw.bsgs, bsgs),
      comparacion: stateOf(raw.comparacion, comparacion), experimentos: stateOf(raw.experimentos, experimentos),
    },
  };
}

/** Archivos listados por GET /lab/results (null si la respuesta no es una lista de nombres). */
export function listedFiles(value: unknown): ReadonlySet<string> | null {
  if (!Array.isArray(value)) return null;
  return new Set(value.filter((v): v is string => typeof v === "string"));
}
