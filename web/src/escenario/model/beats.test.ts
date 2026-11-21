import { describe, expect, test } from "vitest";
import { playAct } from "../fixtures/runs";
import { advanceFrom, anaActs, buildBeats, isRunFinished, isSignupAct, lastDecision } from "./beats";

const ids = (beats: { id: string }[]): string[] => beats.map((b) => b.id);

describe("buildBeats", () => {
  test("descompone el inicio de sesión completo en tomas de cámara", async () => {
    // Arrange
    const { final } = await playAct("login");

    // Act
    const beats = buildBeats(final);

    // Assert
    expect(ids(beats)).toEqual([
      "intro", "bio",
      "s0:x0:req", "s0:x0:srv", "s0:x0:res",
      "s1:compute",
      "s2:x0:req", "s2:x0:srv", "s2:x0:res",
      "s3:compute",
      "s4:x0:req", "s4:x0:srv", "s4:x0:res",
      "outcome", "summary",
    ]);
    expect(beats.every((b) => b.ready)).toBe(true);
    expect(beats.find((b) => b.id === "outcome")?.short).toBe("Entra");
  });

  test("planifica los pasos aún no ejecutados sin marcarlos listos", async () => {
    const { runs } = await playAct("login");

    const beats = buildBeats(runs[0]);

    expect(beats[0].ready).toBe(true);
    expect(beats[1].kind).toBe("biometric");
    expect(beats.slice(2).filter((b) => b.ready)).toEqual([]);
    expect(beats[beats.length - 1].kind).toBe("summary");
    expect(beats.find((b) => b.kind === "outcome")).toMatchObject({ ready: false, short: "Desenlace" });
    expect(beats).toHaveLength(buildBeats((await playAct("login")).final).length);
  });

  test("usa rótulos cortos derivados de lo que viajó", async () => {
    const { final } = await playAct("login");

    const byId = new Map(buildBeats(final).map((b) => [b.id, b.short]));

    expect(byId.get("s1:compute")).toBe("t = 12");
    expect(byId.get("s2:x0:req")).toBe("POST /commit");
    expect(byId.get("s2:x0:res")).toBe("c = 3");
    expect(byId.get("s4:x0:res")).toBe("Acceso concedido");
  });

  test("el registro no pide huella y termina en «Cuenta creada»", async () => {
    const { final } = await playAct("registro");

    const beats = buildBeats(final);

    expect(isSignupAct(final)).toBe(true);
    expect(beats.some((b) => b.kind === "biometric")).toBe(false);
    expect(beats.find((b) => b.kind === "outcome")?.short).toBe("Cuenta creada");
  });

  test("en el espía, la huella va justo antes del primer paso de Ana y el ataque expande su mensaje", async () => {
    const { final, runs } = await playAct("espia_respuesta");

    const beats = buildBeats(final);
    const planned = buildBeats(runs[0]);

    expect(ids(beats).slice(0, 4)).toEqual(["intro", "s0:attack", "bio", "s1:compute"]);
    expect(ids(beats)).toContain("s6:x0:srv");
    expect(beats.find((b) => b.id === "s6:x0:req")?.actor).toBe("eve");
    expect(beats.find((b) => b.kind === "outcome")).toMatchObject({ actor: "eve", short: "Rechazo" });
    expect(planned.length).toBeLessThan(beats.length);
  });

  test("al agotarse el acto descarta los pasos que nunca se ejecutaron", async () => {
    const { runs } = await playAct("login");

    const beats = buildBeats(runs[2], true);

    expect(beats.some((b) => b.stepIndex === 3)).toBe(false);
    expect(beats[beats.length - 1]).toMatchObject({ kind: "summary", ready: true });
  });
});

describe("advanceFrom", () => {
  test("pide un paso al backend cuando el siguiente beat no está listo", async () => {
    const { runs } = await playAct("login");
    const beats = buildBeats(runs[0]);

    expect(advanceFrom(beats, 0)).toEqual({ kind: "goto", index: 1 });
    expect(advanceFrom(beats, 1)).toEqual({ kind: "fetch" });
  });

  test("avanza dentro de un paso ya ejecutado y termina en el resumen", async () => {
    const { runs, final } = await playAct("login");

    expect(advanceFrom(buildBeats(runs[1]), 2)).toEqual({ kind: "goto", index: 3 });
    const beats = buildBeats(final);
    expect(advanceFrom(beats, beats.length - 1)).toEqual({ kind: "end" });
  });
});

describe("helpers del run", () => {
  test("detecta si Ana actúa, el fin del acto y la última decisión", async () => {
    const { runs, final } = await playAct("espia_respuesta");

    expect(anaActs(final)).toBe(true);
    expect(isRunFinished(runs[3])).toBe(false);
    expect(isRunFinished(runs[3], true)).toBe(true);
    expect(isRunFinished(final)).toBe(true);
    expect(lastDecision(final)).toMatchObject({ stepIndex: 6, exchangeIndex: 0 });
  });
});
