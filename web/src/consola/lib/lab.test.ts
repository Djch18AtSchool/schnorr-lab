import { describe, expect, it } from "vitest";
import testsJson from "../../../../results/tests.json";
import { parseTestReport, REQUIREMENT_SOURCES } from "./lab";

describe("parseTestReport", () => {
  it("lee results/tests.json con R1–R11 y C1–C5", () => {
    const report = parseTestReport(testsJson);
    expect(report?.total).toBe(testsJson.total);
    expect(report?.requirements.map((r) => r.id)).toEqual(testsJson.requirements.map((r) => r.id));
    expect(report?.requirements.every((r) => REQUIREMENT_SOURCES[r.id])).toBe(true);
  });

  it("descarta pruebas con un resultado desconocido y rechaza lo que no es un informe", () => {
    const report = parseTestReport({ total: 2, requirements: [{ id: "R1", title: "t", tests: [{ name: "a", file: "f", outcome: "passed" }, { name: "b", file: "f", outcome: "raro" }] }] });
    expect(report?.requirements[0].tests).toHaveLength(1);
    expect(report?.failed).toBe(0);
    expect(parseTestReport({ total: 1 })).toBeNull();
  });
});
