import { describe, expect, test } from "vitest";
import { playAct } from "../fixtures/runs";
import { buildBeats } from "./beats";
import { buildDiagram, phaseNumbers, rowOfBeat } from "./diagram";
import { EMPTY_STORE } from "./events";

const FOLLOW = { review: null, wide: false, animate: true, decisionStep: null };

describe("buildDiagram", () => {
  test("el plano general sin filas muestra el lienzo vacío", async () => {
    const { final, store } = await playAct("login");

    const view = buildDiagram(final, buildBeats(final), 0, store, FOLLOW);

    expect(view).toEqual({ hasEve: false, phases: [], showEmpty: true });
  });

  test("la fase actual queda abierta, las anteriores compactas y atenuadas", async () => {
    const { final, store } = await playAct("login");
    const beats = buildBeats(final);
    const index = beats.findIndex((b) => b.id === "s2:x0:req");

    const view = buildDiagram(final, beats, index, store, FOLLOW);

    expect(view.phases.map((p) => [p.n, p.compact])).toEqual([[1, true], [2, true], [3, false]]);
    const current = view.phases[2].rows[0];
    expect(current).toMatchObject({ dim: false, fresh: true, now: false });
    expect(view.phases[0].rows.every((r) => r.dim)).toBe(true);
  });

  test("en la revisión solo la fase revisada queda nítida y las siguientes se aclaran", async () => {
    const { final, store } = await playAct("login");
    const beats = buildBeats(final);

    const view = buildDiagram(final, beats, beats.length - 1, store, { ...FOLLOW, review: 2 });

    expect(view.phases.find((p) => p.stepIndex === 2)).toMatchObject({ compact: false, later: false });
    expect(view.phases.find((p) => p.stepIndex === 4)).toMatchObject({ compact: true, later: true });
    expect(view.phases.find((p) => p.stepIndex === 0)?.rows.every((r) => r.dim)).toBe(true);
  });

  test("en plano fijo marca la fila del beat actual", async () => {
    const { final, store } = await playAct("login");
    const beats = buildBeats(final);
    const index = beats.findIndex((b) => b.id === "s2:x0:res");

    const view = buildDiagram(final, beats, index, store, { ...FOLLOW, wide: true });

    expect(view.phases.every((p) => p.compact)).toBe(true);
    expect(view.phases[2].rows.find((r) => r.now)?.row.id).toBe("s2:x0:res");
  });
});

describe("rowOfBeat", () => {
  test("mensajes, cálculos y servidor con lo que viaja", async () => {
    const { final, store } = await playAct("login");
    const beats = buildBeats(final);
    const row = (id: string) => rowOfBeat(final, beats.find((b) => b.id === id) ?? beats[0], store, false);

    expect(row("s2:x0:req")).toMatchObject({
      type: "msg", from: "ana", to: "bank", lead: "POST", label: "/zkp/login/commit", short: "/commit  t = 12",
      body: [{ key: "user_id", value: "ana" }, { key: "t", value: "12" }],
    });
    expect(row("s0:x0:req")).toMatchObject({ body: null, short: "/params" });
    expect(row("s4:x0:res")).toMatchObject({
      type: "msg", from: "bank", to: "ana", lead: "200", verdict: { ok: true, text: "Acceso concedido" },
      body: [{ key: "accepted", value: "true" }, { key: "attempts_left", value: "3" }],
    });
    expect(row("s1:compute")).toMatchObject({ type: "local", at: "ana", label: "Chip seguro", fact: "r = 5, t = 12" });
    expect(row("s2:x0:srv")).toMatchObject({ type: "srv", bad: false, short: "t ∈ subgrupo ✔ → el banco elige e…" });
    expect(rowOfBeat(final, beats[0], store, false)).toBeNull();
  });

  test("el servidor sin eventos resume con el estado HTTP", async () => {
    const { final } = await playAct("login");
    const beat = buildBeats(final).find((b) => b.id === "s2:x0:srv");
    if (!beat) throw new Error("falta el beat");

    expect(rowOfBeat(final, beat, EMPTY_STORE, false)).toMatchObject({ short: "responde 200" });
  });

  test("Eve: la copia interceptada lleva derivación y su reenvío se marca como copia", async () => {
    const { final, store } = await playAct("espia_respuesta");
    const beats = buildBeats(final);
    const row = (id: string) => rowOfBeat(final, beats.find((b) => b.id === id) ?? beats[0], store, true);

    expect(row("s4:x0:req")).toMatchObject({ tap: true, copied: true, tag: null });
    expect(row("s6:x0:req")).toMatchObject({ from: "eve", tap: false, tag: "copia" });
    expect(row("s6:x0:srv")).toMatchObject({ bad: true });
    expect(row("s0:attack")).toMatchObject({ type: "local", at: "eve", icon: "rec", label: "Eve escucha la red" });
  });

  test("numera solo los pasos que dibujan", async () => {
    const { final } = await playAct("espia_respuesta");

    expect([...phaseNumbers(final).values()]).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
