import { describe, expect, it } from "vitest";
import { EVE, alert, commit, params, respond } from "../test/builders";
import { EMPTY_QUERY, isFiltered, linkEvidence, linkOutcome, linkUser, matchesAttempt } from "./activityQuery";
import { groupAttempts } from "./attempts";

const attempts = groupAttempts([
  params(1), commit(2, "ana", "s1"), respond(3, "ana", "s1", "auth.ok"),
  respond(4, "ana", "s1", "auth.replay", EVE),
  commit(5, "bruno", "s2", EVE, 2000), respond(6, "bruno", "s2", "auth.rejected", EVE, 2001),
]);
const keys = (q: typeof EMPTY_QUERY): number[] => attempts.filter((a) => matchesAttempt(a, q)).map((a) => a.requests[a.requests.length - 1].id);

describe("filtros y enlaces de Actividad", () => {
  it("sin filtros muestra todo", () => {
    expect(keys(EMPTY_QUERY)).toEqual([3, 4, 6]);
    expect(isFiltered(EMPTY_QUERY)).toBe(false);
  });

  it("el enlace «concedidos» del Resumen lleva solo a los accesos concedidos del rango", () => {
    const q = linkOutcome("concedido", 1000, "Accesos concedidos");
    expect(keys(q)).toEqual([3]);
    expect(keys(linkOutcome("rechazado", 1500, "Rechazados"))).toEqual([6]);
    expect(isFiltered(q)).toBe(true);
  });

  it("la evidencia de una alerta lleva a los intentos que contienen esas peticiones", () => {
    const q = linkEvidence(alert({ id: 1, title: "Repetición de un mensaje capturado", evidence: [3, 4] }));
    expect(keys(q)).toEqual([3, 4]);
    expect(q.label).toBe("Evidencia: Repetición de un mensaje capturado");
  });

  it("filtra por cuenta, por dispositivo y por texto", () => {
    expect(keys(linkUser("bruno"))).toEqual([6]);
    expect(keys({ ...EMPTY_QUERY, device: EVE.device })).toEqual([4, 6]);
    expect(keys({ ...EMPTY_QUERY, search: "REPETICIÓN" })).toEqual([4]);
    expect(keys({ ...EMPTY_QUERY, search: "192.168.1.66" })).toEqual([4, 6]);
  });
});
