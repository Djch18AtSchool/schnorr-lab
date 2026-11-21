/**
 * Fuente de datos del Escenario. La real habla con el celular (:8001) y escucha al banco
 * (:8000) por SSE; la simulada reproduce el guion del escrito con los mismos tipos.
 * Se elige con ?fuente=simulada.
 */
import type { ActRun, BankEvent, PhoneConfig } from "../../shared/types";

export type SourceKind = "real" | "simulada";

export interface ScenarioSource {
  readonly kind: SourceKind;
  loadConfig(): Promise<PhoneConfig>;
  startAct(act: string, userId?: string): Promise<ActRun>;
  nextStep(runId: string): Promise<ActRun>;
  resetLab(group: string): Promise<PhoneConfig>;
  /** Escucha los eventos del banco; devuelve la función para dejar de escuchar. */
  subscribeBank(onEvent: (event: BankEvent) => void, onStatus?: (online: boolean) => void): () => void;
}

export const SOURCE_PARAM = "fuente";

export function sourceKindFromSearch(search: string): SourceKind {
  return new URLSearchParams(search).get(SOURCE_PARAM) === "simulada" ? "simulada" : "real";
}

/** URL de la misma página con la fuente indicada (para cambiar sin perder el resto). */
export function searchWithSource(search: string, kind: SourceKind): string {
  const params = new URLSearchParams(search);
  if (kind === "simulada") params.set(SOURCE_PARAM, "simulada");
  else params.delete(SOURCE_PARAM);
  const text = params.toString();
  return text ? `?${text}` : "";
}
