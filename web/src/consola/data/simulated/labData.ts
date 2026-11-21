/**
 * Resultados del laboratorio para la fuente simulada: los mismos archivos de results/ del
 * repositorio, incluidos en el paquete por Vite (nada inventado). Se validan con los mismos parsers
 * que la fuente real.
 */
import type { TestReport } from "../../../shared/types";
import { buildLabResults, rawBody } from "../../lib/labFiles";
import { parseTestReport } from "../../lib/lab";
import type { LabResults } from "../source";
import bsgs from "../../../../../results/bsgs.json";
import comparacion from "../../../../../results/comparacion.json";
import experimentos from "../../../../../results/experimentos.json";
import latency from "../../../../../results/latency.json";
import tests from "../../../../../results/tests.json";

export const LAB_RESULTS: LabResults = buildLabResults({
  latency: rawBody(latency), bsgs: rawBody(bsgs), comparacion: rawBody(comparacion), experimentos: rawBody(experimentos),
});

const EMPTY_REPORT: TestReport = { generated_at: 0, duration_s: 0, total: 0, passed: 0, failed: 0, skipped: 0, requirements: [] };

/** Informe de pytest guardado en results/tests.json. */
export const TEST_REPORT: TestReport = parseTestReport(tests) ?? EMPTY_REPORT;
