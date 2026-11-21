import { describe, expect, it } from "vitest";
import { ANA, EVE, SUPPORT, commit, params, req, respond } from "../test/builders";
import { PARAMS_WINDOW_S, attemptIndex, groupAttempts } from "./attempts";

describe("groupAttempts", () => {
  it("une params → commit → respond de un mismo inicio de sesión en un intento concedido", () => {
    // Arrange
    const requests = [params(1), commit(2, "ana", "s1"), respond(3, "ana", "s1", "auth.ok")];
    // Act
    const [attempt, ...rest] = groupAttempts(requests);
    // Assert
    expect(rest).toHaveLength(0);
    expect(attempt.requests.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(attempt).toMatchObject({ kind: "interactivo", title: "Inicio de sesión", user: "ana", device: ANA.device, outcome: { label: "Acceso concedido", tone: "ok" } });
    expect(attempt.durationMs).toBeCloseTo(2000 + 2);
  });

  it("la respuesta reenviada por Eve con la sesión de Ana es otro intento, rechazado", () => {
    const requests = [params(1), commit(2, "ana", "s1"), respond(3, "ana", "s1", "auth.ok"), respond(4, "ana", "s1", "auth.replay", EVE)];
    const attempts = groupAttempts(requests);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toMatchObject({ device: EVE.device, user: "ana", outcome: { label: "Repetición rechazada", tone: "bad" } });
    expect(attempts[1].requests.map((r) => r.id)).toEqual([4]);
  });

  it("pega los params al intento siguiente del mismo dispositivo, no al de otro", () => {
    const requests = [params(1, EVE), params(2, ANA), commit(3, "ana", "s1", ANA), req({ id: 4, ...EVE, path: "/bank/users" }), commit(5, "ana", "s2", EVE)];
    const attempts = groupAttempts(requests);
    const ana = attempts.find((a) => a.device === ANA.device);
    const eve = attempts.find((a) => a.device === EVE.device && a.kind === "interactivo");
    expect(ana?.requests.map((r) => r.id)).toEqual([2, 3]);
    expect(eve?.requests.map((r) => r.id)).toEqual([1, 5]);
    expect(attempts.find((a) => a.kind === "consulta")?.title).toBe("Lectura de las claves públicas guardadas");
  });

  it("unos params viejos o sin continuación quedan como consulta suelta", () => {
    const late = 1000 + PARAMS_WINDOW_S + 50;
    const attempts = groupAttempts([params(1), commit(2, "ana", "s1", ANA, late), params(3)]);
    expect(attempts.map((a) => [a.kind, a.requests.map((r) => r.id)])).toEqual([["consulta", [1]], ["interactivo", [2]], ["consulta", [3]]]);
    expect(attempts[1].outcome).toEqual({ label: "Reto sin responder", tone: "neutral" });
  });

  it("registro, prueba no interactiva, cuenta bloqueada y soporte son intentos propios", () => {
    const requests = [
      params(1), req({ id: 2, method: "POST", path: "/zkp/register", status: 201, signal: "account.created", tags: { user: "ana" } }),
      req({ id: 3, method: "POST", path: "/zkp/login/nizk", signal: "auth.ok", tags: { user: "ana" } }),
      req({ id: 4, method: "POST", path: "/zkp/login/commit", status: 423, signal: "auth.locked_attempt", tags: { user: "ana" } }),
      req({ id: 5, method: "POST", path: "/admin/accounts/zkp/ana/unlock", ...SUPPORT, signal: "admin.unlock", tags: { user: "ana" } }),
    ];
    const attempts = groupAttempts(requests);
    expect(attempts.map((a) => [a.kind, a.outcome.label])).toEqual([
      ["registro", "Cuenta creada"], ["no_interactivo", "Acceso concedido"], ["interactivo", "Cuenta bloqueada"], ["soporte", "Cuenta desbloqueada"],
    ]);
    expect(attempts[3].title).toBe("Soporte desbloquea la cuenta");
  });

  it("el índice lleva de cada petición a su intento", () => {
    const attempts = groupAttempts([params(1), commit(2, "ana", "s1"), respond(3, "ana", "s1", "auth.ok")]);
    expect(attemptIndex(attempts).get(1)?.key).toBe("s:s1:celular de Ana");
  });
});
