import { describe, expect, it } from "vitest";
import { commit, req, respond } from "../test/builders";
import { deduceFunnel } from "./funnel";

describe("deduceFunnel", () => {
  it("cuenta un inicio interactivo completo", () => {
    const funnel = deduceFunnel([commit(1, "ana", "s1", "a:2"), respond(2, "s1", "a:3", true)]);
    expect(funnel).toMatchObject({ commits: 1, challenges: 1, ownResponses: 1, granted: 1, unanswered: 0 });
  });

  it("no cuenta como respuesta a su sesión una repetición desde otro flujo", () => {
    const funnel = deduceFunnel([commit(1, "ana", "s1", "a:2"), respond(2, "s1", "eve:1", false)]);
    expect(funnel.ownResponses).toBe(0);
    expect(funnel.unanswered).toBe(1);
  });

  it("solo cuenta el primer uso de una sesión", () => {
    const funnel = deduceFunnel([commit(1, "ana", "s1", "a:2"), respond(2, "s1", "a:3", true), respond(3, "s1", "a:4", false)]);
    expect(funnel.ownResponses).toBe(1);
  });

  it("ignora respuestas a sesiones que el banco nunca emitió y compromisos rechazados", () => {
    const funnel = deduceFunnel([commit(1, "anna", "", "x:1", 404), respond(2, "zzz", "y:1", false)]);
    expect(funnel).toMatchObject({ commits: 1, challenges: 0, ownResponses: 0, unanswered: 0 });
  });

  it("separa las pruebas Fiat-Shamir", () => {
    const nizk = (id: number, accepted: boolean) => req({ id, method: "POST", path: "/zkp/login/nizk", response_body: { accepted } });
    const funnel = deduceFunnel([nizk(1, true), nizk(2, false), nizk(3, true)]);
    expect(funnel).toMatchObject({ nizk: 3, nizkGranted: 2, commits: 0 });
  });

  it("sin correlación, el primer uso de una sesión emitida cuenta como propio", () => {
    const funnel = deduceFunnel([commit(1, "ana", "s1", "a:2"), { ...respond(2, "s1", "x", true), correlation_id: null }]);
    expect(funnel.ownResponses).toBe(1);
  });
});
