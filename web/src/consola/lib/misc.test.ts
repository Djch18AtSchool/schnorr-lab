import { describe, expect, it } from "vitest";
import type { AuditEntry, TestReport } from "../../shared/types";
import { MECHANISMS } from "../data/simulated/fixtures";
import { alert, commit, event, req, respond } from "../test/builders";
import { alertFromEvent, codeSpans, defaultOpenAlert, groupAlerts, severityCounts } from "./alerts";
import { auditFacts, containsSecret, linkAuditToRequests, matchesAudit } from "./audit";
import { checkGroup, groupOf, modPow } from "./group";
import { requirementFiles, requirementStatus, testsByFile } from "./lab";
import { verificationOf } from "./verify";

describe("alertas", () => {
  const list = [
    alert({ id: 1, title: "Cuerpo mal formado (422)", severity: "baja", timestamp: 10 }),
    alert({ id: 2, title: "Cuerpo mal formado (422)", severity: "baja", timestamp: 20 }),
    alert({ id: 3, title: "Respuesta repetida rechazada", severity: "alta", timestamp: 30 }),
    alert({ id: 4, title: "Respuesta repetida rechazada", severity: "alta", timestamp: 40 }),
  ];

  it("agrupa repeticiones seguidas salvo las altas, más recientes primero", () => {
    const groups = groupAlerts(list);
    expect(groups.map((g) => [g.alert.id, g.times])).toEqual([[4, 1], [3, 1], [2, 2]]);
    expect(defaultOpenAlert(groups)).toBe(4);
    expect(severityCounts(list)).toEqual({ alta: 2, media: 0, baja: 2 });
  });

  it("separa el `código` del texto", () => {
    expect(codeSpans("Origen `192.168.1.66` (httpx).")).toEqual([{ text: "Origen ", code: false }, { text: "192.168.1.66", code: true }, { text: " (httpx).", code: false }]);
  });

  it("valida la alerta que llega en un evento", () => {
    const ok = alertFromEvent(event({ id: 9, kind: "alerta", data: { id: 7, severity: "alta", kind: "replay", title: "R", detail: "d", user_id: "ana", evidence: [1, "x", 2] } }));
    expect(ok).toMatchObject({ id: 7, severity: "alta", evidence: [1, 2], user_id: "ana" });
    expect(alertFromEvent(event({ id: 9, kind: "alerta", data: { id: 7, severity: "grave" } }))).toBeNull();
    expect(alertFromEvent(event({ id: 9, kind: "log", data: { id: 7, severity: "alta" } }))).toBeNull();
  });
});

describe("auditoría", () => {
  const entries: AuditEntry[] = [
    { endpoint: "/zkp/register", mechanism: "zkp", valid: true, body: { user_id: "ana", y: "8" } },
    { endpoint: "/zkp/login/commit", mechanism: "zkp", valid: false, body: { user_id: "ana", t: 12 } },
    { endpoint: "/zkp/login/respond", mechanism: "zkp", valid: true, body: { session_id: "s", s: "4" } },
  ];

  it("detecta x a cualquier profundidad", () => {
    expect(containsSecret({ a: { b: [{ x: "7" }] } })).toBe(true);
    expect(containsSecret({ y: "8", xx: 1 })).toBe(false);
  });

  it("resume cuerpos, inválidos y campos vistos", () => {
    expect(auditFacts(entries)).toEqual({ total: 3, invalid: 1, fields: ["user_id", "y", "t", "session_id", "s"], withSecret: 0 });
    expect(entries.filter((e) => matchesAudit(e, "invalid", ""))).toHaveLength(1);
    expect(entries.filter((e) => matchesAudit(e, "all", "/zkp/register"))).toHaveLength(1);
  });

  it("une cada cuerpo con su petición en orden", () => {
    const requests = [
      req({ id: 10, method: "POST", path: "/zkp/register", request_body: { user_id: "ana", y: "8" } }),
      req({ id: 11, method: "POST", path: "/zkp/login/commit", request_body: { user_id: "ana", t: 12 } }),
      respond(12, "s", "a:3", true),
    ];
    const links = linkAuditToRequests(entries, requests);
    expect([...links.entries()].map(([i, r]) => [i, r.id])).toEqual([[0, 10], [1, 11], [2, 12]]);
  });
});

describe("grupo activo", () => {
  it("lee el grupo de /mechanisms y lo comprueba con BigInt", () => {
    const group = groupOf(MECHANISMS);
    expect(group).toMatchObject({ name: "toy-23", p: "23", q: "11", g: "4", maxAttempts: 3 });
    expect(group && checkGroup(group)).toEqual({ safePrime: true, qDividesP1: true, generatorOrder: true });
  });

  it("reconoce un grupo de Schnorr (q divide a p − 1 sin ser primo seguro)", () => {
    const group = { name: "schnorr-mini", bits: 5, qBits: 2, p: "23", q: "11", g: "2", maxAttempts: 3 };
    expect(checkGroup({ ...group, p: "67", q: "11", g: "9" })).toMatchObject({ safePrime: false, qDividesP1: true, generatorOrder: true });
    expect(checkGroup({ ...group, g: "5" }).generatorOrder).toBe(false);
  });

  it("rechaza parámetros que no son enteros decimales", () => {
    expect(groupOf([{ ...MECHANISMS[0], server: { p: "0x17", q: "11", g: "4" } }])).toBeNull();
    expect(groupOf([])).toBeNull();
    expect(modPow(4n, 7n, 23n)).toBe(8n);
  });
});

describe("pruebas por requerimiento", () => {
  const report: TestReport = {
    generated_at: 0, duration_s: 1, total: 3, passed: 2, failed: 1, skipped: 0,
    requirements: [
      { id: "R1", title: "a", tests: [{ name: "t1", file: "tests/test_params.py", outcome: "passed" }, { name: "t2", file: "tests/test_params.py", outcome: "passed" }] },
      { id: "R2", title: "b", tests: [{ name: "t1", file: "tests/test_params.py", outcome: "passed" }, { name: "t3", file: "tests/test_api.py", outcome: "failed" }] },
      { id: "R3", title: "c", tests: [] },
    ],
  };

  it("cuenta cada prueba una vez por archivo", () => {
    expect(testsByFile(report)).toEqual([{ file: "test_api.py", total: 1, passed: 0 }, { file: "test_params.py", total: 2, passed: 2 }]);
  });

  it("da el estado y los archivos de cada requerimiento", () => {
    expect(report.requirements.map(requirementStatus)).toEqual(["aprobado", "fallido", "pendiente"]);
    expect(requirementFiles(report.requirements[1])).toEqual([{ file: "test_params.py", count: 1 }, { file: "test_api.py", count: 1 }]);
  });
});

describe("verificationOf", () => {
  it("lee la verificación de la respuesta del banco (guion del brief)", () => {
    const r = { ...respond(1, "77991cce", "a:3", true), response_body: { accepted: true, reason: "Acceso concedido",
      transcript: { t: "12", c: "3", s: "4" }, details: { gs: "3", yc: "6", tyc: "3", yc_inv: "4", t_rec: "12" } } };
    expect(verificationOf(r, "8")).toMatchObject({ nizk: false, gs: "3", tyc: "3", ycInv: "4", tRec: "12", congruenceOk: true, recoveryOk: true });
  });

  it("devuelve null si la respuesta no trae verificación", () => {
    expect(verificationOf(commit(1, "ana", "s", "a:2"), null)).toBeNull();
    expect(verificationOf(respond(2, "s", "e:1", false), null)).toBeNull();
  });
});
