import { describe, expect, it } from "vitest";
import { commit, req, respond } from "../test/builders";
import { flowOf, hostOf, isWrite, matchesTraffic, mergeById, outcomeOf, resultLabel, statusClass, stepOf, userIndex } from "./requests";

describe("outcomeOf", () => {
  it("usa la señal del banco cuando existe", () => {
    expect(outcomeOf(req({ id: 1, signal: "auth.ok" }))).toBe("granted");
    expect(outcomeOf(req({ id: 2, signal: "auth.stale" }))).toBe("denied");
  });

  it("sin señal, deduce de accepted y del estado HTTP", () => {
    expect(outcomeOf(req({ id: 1, response_body: { accepted: true } }))).toBe("granted");
    expect(outcomeOf(req({ id: 2, response_body: { accepted: false } }))).toBe("denied");
    expect(outcomeOf(req({ id: 3, status: 423 }))).toBe("denied");
    expect(outcomeOf(req({ id: 4, status: 422 }))).toBe("error");
    expect(outcomeOf(req({ id: 5 }))).toBe("other");
  });
});

describe("resultLabel", () => {
  it("resume cada tipo de respuesta en español", () => {
    expect(resultLabel(req({ id: 1 }))).toBe("Parámetros públicos");
    expect(resultLabel(commit(2, "ana", "abc", "f:2"))).toBe("Reto emitido (c = 3)");
    expect(resultLabel(respond(3, "abc", "f:3", true))).toBe("Acceso concedido");
    expect(resultLabel(req({ id: 4, method: "POST", path: "/zkp/register", status: 201, response_body: { user_id: "ana", stored: { y: "8" } } }))).toBe("Registro exitoso");
    expect(resultLabel(req({ id: 5, path: "/audit/log", response_body: [1, 2, 3] }))).toBe("3 entradas");
    expect(resultLabel(req({ id: 6, path: "/events/stream" }))).toBe("Flujo SSE abierto");
  });

  it("muestra el motivo de un error, también el de una validación de FastAPI", () => {
    expect(resultLabel(req({ id: 1, status: 404, path: "/x", response_body: { detail: "Not Found" } }))).toBe("Not Found");
    expect(resultLabel(req({ id: 2, status: 422, path: "/x", response_body: { detail: [{ msg: "s: falta el campo" }] } }))).toBe("s: falta el campo");
  });

  it("recorta un reto c de 2048 bits", () => {
    const c = "1".repeat(80);
    expect(resultLabel(commit(1, "ana", "s", "f:1")).length).toBeLessThan(30);
    expect(resultLabel(req({ id: 2, method: "POST", path: "/zkp/login/commit", response_body: { session_id: "s", c } }))).toContain("…");
  });
});

describe("correlación", () => {
  it("separa flujo y paso de X-Correlation-ID", () => {
    const r = req({ id: 7, correlation_id: "c6ef288ecbe1:2" });
    expect(flowOf(r)).toBe("c6ef288ecbe1");
    expect(stepOf(r)).toBe("2");
    expect(flowOf(req({ id: 8 }))).toBe("#8");
  });

  it("atribuye una respuesta repetida al dueño de la sesión", () => {
    const requests = [commit(1, "ana", "77991cce", "a:2"), respond(2, "77991cce", "a:3", true), respond(3, "77991cce", "eve:1", false)];
    const users = userIndex(requests);
    expect(users.get(3)).toBe("ana");
    expect(users.get(1)).toBe("ana");
  });
});

describe("filtros del tráfico", () => {
  const list = [req({ id: 1 }), commit(2, "ana", "s1", "a:2"), respond(3, "s1", "e:1", false)];
  const users = userIndex(list);

  it("filtra escrituras y rechazos", () => {
    expect(list.filter((r) => matchesTraffic(r, { filter: "write", search: "" }, users.get(r.id))).map((r) => r.id)).toEqual([2, 3]);
    expect(list.filter((r) => matchesTraffic(r, { filter: "bad", search: "" }, users.get(r.id))).map((r) => r.id)).toEqual([3]);
  });

  it("busca por usuario, sesión o IP sin distinguir mayúsculas", () => {
    expect(list.filter((r) => matchesTraffic(r, { filter: "all", search: "ANA" }, users.get(r.id))).map((r) => r.id)).toEqual([2, 3]);
    expect(list.filter((r) => matchesTraffic(r, { filter: "all", search: "s1" }, users.get(r.id))).map((r) => r.id)).toEqual([2, 3]);
    expect(matchesTraffic(list[0], { filter: "all", search: "192.168.1.23" }, undefined)).toBe(true);
  });

  it("clasifica estados y métodos", () => {
    expect(statusClass(200)).toBe("s2");
    expect(statusClass(404)).toBe("s4");
    expect(statusClass(423)).toBe("s4x");
    expect(isWrite(req({ id: 1, method: "POST" }))).toBe(true);
    expect(hostOf("192.168.1.66:51465")).toBe("192.168.1.66");
  });
});

describe("mergeById", () => {
  it("agrega solo ids nuevos, en orden, y respeta el tope sin mutar", () => {
    const current = [req({ id: 1 }), req({ id: 2 })];
    const merged = mergeById(current, [req({ id: 4 }), req({ id: 2 }), req({ id: 3 })], 3);
    expect(merged.map((r) => r.id)).toEqual([2, 3, 4]);
    expect(current.map((r) => r.id)).toEqual([1, 2]);
  });

  it("devuelve la misma referencia si no hay nada nuevo", () => {
    const current = [req({ id: 5 })];
    expect(mergeById(current, [req({ id: 5 })], 10)).toBe(current);
  });
});
