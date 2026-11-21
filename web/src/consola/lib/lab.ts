/** Laboratorio: resumen de pruebas por archivo y por requerimiento (R1–R11). Funciones puras. */
import type { TestReport } from "../../shared/types";

export interface FileCount {
  file: string;
  total: number;
  passed: number;
}

type Requirement = TestReport["requirements"][number];
type TestCase = Requirement["tests"][number];

/** Nombre corto del archivo de pruebas: tests/test_api.py → test_api.py. */
export const fileName = (path: string): string => path.split("/").pop() ?? path;

function uniqueTests(report: TestReport): TestCase[] {
  const seen = new Map<string, TestCase>();
  report.requirements.flatMap((r) => r.tests).forEach((t) => seen.set(`${t.file}::${t.name}`, t));
  return [...seen.values()];
}

/** Pruebas por archivo (cada prueba se cuenta una vez aunque cubra varios requerimientos). */
export function testsByFile(report: TestReport): FileCount[] {
  const tests = uniqueTests(report);
  const files = [...new Set(tests.map((t) => fileName(t.file)))].sort();
  return files.map((file) => {
    const own = tests.filter((t) => fileName(t.file) === file);
    return { file, total: own.length, passed: own.filter((t) => t.outcome === "passed").length };
  });
}

export type RequirementStatus = "aprobado" | "fallido" | "omitido" | "pendiente";

export function requirementStatus(req: Requirement): RequirementStatus {
  if (!req.tests.length) return "pendiente";
  if (req.tests.some((t) => t.outcome === "failed")) return "fallido";
  if (req.tests.every((t) => t.outcome === "skipped")) return "omitido";
  return "aprobado";
}

/** Archivos que cubren un requerimiento, con cuántas pruebas suyas lo cubren. */
export function requirementFiles(req: Requirement): Array<{ file: string; count: number }> {
  const files = [...new Set(req.tests.map((t) => fileName(t.file)))];
  return files.map((file) => ({ file, count: req.tests.filter((t) => fileName(t.file) === file).length }));
}

/** Dónde está implementado cada requerimiento (el contrato no lo trae; es fijo del repositorio). */
export const REQUIREMENT_SOURCES: Readonly<Record<string, string>> = {
  R1: "core/params.py, core/rfc3526.py",
  R2: "protocol/bank.py, mechanisms/zkp/server.py",
  R3: "protocol/client.py, protocol/bank.py",
  R4: "core/modular.py",
  R5: "core/modular.py",
  R6: "protocol/bank.py",
  R7: "core/params.py, benchmark/latency.py",
  R8: "protocol/fiat_shamir.py",
  R9: "protocol/bank.py, api/validation.py",
  R10: "attacks/, client_app/lab.py",
  R11: "client_app/, api/, demo.py, http_client.py",
};
