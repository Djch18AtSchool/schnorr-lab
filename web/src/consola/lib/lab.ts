/** Pruebas: resumen por archivo y por requerimiento (R1–R11 y C1–C5). Funciones puras. */
import type { TestReport } from "../../shared/types";
import { asRecord } from "./requests";

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
  C1: "mechanisms/password/, mechanisms/totp/, mechanisms/srp/",
  C2: "mechanisms/*/server.py",
  C3: "mechanisms/*/schemas.py, mechanisms/common.py",
  C4: "mechanisms/totp/otp.py, mechanisms/srp/srp6a.py",
  C5: "benchmark/compare.py, benchmark/compare_attacks.py",
};

const OUTCOMES = new Set(["passed", "failed", "skipped"]);

function testCase(value: unknown): TestCase | null {
  const t = asRecord(value);
  if (!t || typeof t.name !== "string" || typeof t.file !== "string" || typeof t.outcome !== "string" || !OUTCOMES.has(t.outcome)) return null;
  return { name: t.name, file: t.file, outcome: t.outcome as TestCase["outcome"] };
}

function requirement(value: unknown): Requirement | null {
  const r = asRecord(value);
  if (!r || typeof r.id !== "string" || typeof r.title !== "string" || !Array.isArray(r.tests)) return null;
  return { id: r.id, title: r.title, tests: r.tests.map(testCase).filter((t): t is TestCase => t !== null) };
}

/** results/tests.json validado (lo escribe pytest al terminar). */
export function parseTestReport(value: unknown): TestReport | null {
  const r = asRecord(value);
  if (!r || !Array.isArray(r.requirements)) return null;
  const count = (key: string): number => (typeof r[key] === "number" ? (r[key] as number) : 0);
  return {
    generated_at: count("generated_at"), duration_s: count("duration_s"), total: count("total"),
    passed: count("passed"), failed: count("failed"), skipped: count("skipped"),
    requirements: r.requirements.map(requirement).filter((q): q is Requirement => q !== null),
  };
}
