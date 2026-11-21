import { describe, expect, it } from "vitest";
import comparacionJson from "../../../../results/comparacion.json";
import experimentosJson from "../../../../results/experimentos.json";
import { parseComparison, parseExperiments } from "./labParse";

describe("parseComparison", () => {
  it("lee el formato real de results/comparacion.json", () => {
    const c = parseComparison(comparacionJson);
    expect(c?.rows.map((r) => r.key)).toEqual(comparacionJson.rows.map((r) => r.key));
    const password = c?.rows.find((r) => r.key === "password");
    expect(password?.login.round_trips).toBe(1);
    expect(password?.secrets.login).toEqual({ "contraseña": true });
    expect(password?.replay.verbatim?.accepted).toBe(true);
    const zkp = c?.rows.find((r) => r.key === "zkp-rfc-2048");
    expect(zkp?.dictionaryLog10Years).toBeNull();
    expect(zkp?.stored.fields).toEqual(["y"]);
  });

  it("lee la base robada (SRP con varias aritméticas y BSGS por grupo) y la tabla cualitativa", () => {
    const c = parseComparison(comparacionJson);
    expect(Object.keys(c?.stolen?.guesses ?? {})).toEqual(["password", "totp", "srp-propia", "srp-gmpy2"]);
    expect(c?.stolen?.bsgs.map((g) => g.group)).toEqual(["schnorr-2048", "rfc-2048"]);
    expect(c?.stolen?.bsgs[0].qBits).toBe(224);
    expect(Object.keys(c?.qualitative ?? {})).toEqual(["password", "totp", "srp", "zkp"]);
    expect(c?.qualitative.zkp.online).toBe("Despreciable");
  });

  it("descarta filas sin lo mínimo y devuelve null si no queda ninguna", () => {
    const c = parseComparison({ rows: [{ key: "a", label: "A", login_ms: 1, register_ms: 2 }, { key: "roto" }] });
    expect(c?.rows).toHaveLength(1);
    expect(c?.rows[0].login).toEqual({ round_trips: 0, posts: 0, sent_bytes: 0, received_bytes: 0, paths: [] });
    expect(c?.stolen).toBeNull();
    expect(parseComparison({ rows: [{ key: "roto" }] })).toBeNull();
    expect(parseComparison(null)).toBeNull();
    expect(parseComparison([1, 2])).toBeNull();
  });
});

describe("parseExperiments", () => {
  it("lee los seis bloques del formato real de results/experimentos.json", () => {
    const e = parseExperiments(experimentosJson);
    expect(e?.impostor?.convergence).toHaveLength(experimentosJson.impostor.convergence.length);
    expect(e?.impostor?.byQ.map((b) => b.q)).toEqual(experimentosJson.impostor.by_q.map((b) => b.q));
    expect(e?.simulator?.identical).toBe(true);
    expect(e?.simulator?.byT[0]).toEqual({ t: 2, real: 11, simulated: 11 });
    expect(e?.nonceReuse?.example?.xExtracted).toBe(7);
    expect(e?.nonceReuse?.random?.recovered).toBe(experimentosJson.r_repetido.random.recovered);
    expect(e?.replay?.cases.map((c) => [c.id, c.accepted])).toEqual([["sin-proteccion", true], ["con-proteccion", false], ["vieja", false]]);
    expect(e?.randomness?.distinctT).toBe(1000);
    expect(e?.arithmetic?.examples).toEqual([{ expr: "4^7 mod 23", value: 8 }, { expr: "6^-1 mod 23", value: 4 }]);
  });

  it("un bloque mal formado queda en null sin ocultar los demás", () => {
    const e = parseExperiments({ impostor: { q: "once" }, aleatoriedad: { group: "g", q_bits: 5, logins: 3, accepted: 3, distinct_t: 3, distinct_c: 2 } });
    expect(e?.impostor).toBeNull();
    expect(e?.simulator).toBeNull();
    expect(e?.randomness?.distinctC).toBe(2);
  });

  it("devuelve null si no hay ningún bloque utilizable", () => {
    expect(parseExperiments({ python: "3.12" })).toBeNull();
    expect(parseExperiments("x")).toBeNull();
  });
});
