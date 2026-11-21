import { describe, expect, test } from "vitest";
import { playAct } from "../fixtures/runs";
import { buildBeats } from "./beats";
import { beatFocus, bestFit, fitRect, isOverview, pad, regionFor, shotFor, union } from "./camera";

async function shots(actId: string, cam: "follow" | "wide" = "follow") {
  const { final } = await playAct(actId);
  const beats = buildBeats(final);
  return { final, beats, shot: (id: string) => shotFor(final, beats.find((b) => b.id === id) ?? beats[0], cam, null) };
}

describe("plan de cámara", () => {
  test("cada beat enfoca a quien actúa", async () => {
    const { final, beats } = await shots("login");
    const focus = Object.fromEntries(beats.map((b) => [b.id, beatFocus(final, b)]));

    expect(focus).toMatchObject({
      intro: "wide", bio: "ana", "s1:compute": "ana", "s2:x0:req": "net", "s2:x0:srv": "bank", "s2:x0:res": "net",
      outcome: "ana", summary: "summary",
    });
  });

  test("el servidor enlaza su fila con la terminal y el mensaje encuadra su fila", async () => {
    const { shot } = await shots("login");

    expect(shot("s2:x0:srv")).toEqual({ kind: "focus", focus: "bank", rowId: "s2:x0:srv", withLaptop: false, linkRowId: "s2:x0:srv" });
    expect(shot("s2:x0:req")).toMatchObject({ kind: "focus", focus: "net", rowId: "s2:x0:req", linkRowId: null });
    expect(shot("bio")).toMatchObject({ focus: "ana", rowId: null });
    expect(shot("outcome")).toMatchObject({ focus: "ana", rowId: "s4:x0:res" });
  });

  test("si Eve escucha, el mensaje de Ana se encuadra con su laptop", async () => {
    const { shot } = await shots("espia_respuesta");

    expect(shot("s2:x0:req")).toMatchObject({ withLaptop: true });
    expect(shot("s6:x0:req")).toMatchObject({ withLaptop: false });
    expect(shot("outcome")).toMatchObject({ focus: "eve" });
  });

  test("el plano fijo y la revisión mandan sobre el beat", async () => {
    const { final, beats } = await shots("login");

    expect(shotFor(final, beats[5], "wide", null)).toEqual({ kind: "wide" });
    expect(shotFor(final, beats[5], "follow", 2)).toEqual({ kind: "review", stepIndex: 2 });
    expect(isOverview({ kind: "summary" })).toBe(true);
    expect(isOverview({ kind: "review", stepIndex: 1 })).toBe(false);
  });
});

describe("geometría del encuadre", () => {
  test("une y amplía rectángulos", () => {
    expect(union([{ x: 0, y: 0, w: 10, h: 10 }, null, { x: 20, y: 5, w: 5, h: 20 }])).toEqual({ x: 0, y: 0, w: 25, h: 25 });
    expect(union([null])).toBeNull();
    expect(pad({ x: 10, y: 10, w: 10, h: 10 }, 5, 2)).toEqual({ x: 5, y: 8, w: 20, h: 14 });
  });

  test("centra el objetivo en la región sin pasar de la escala máxima", () => {
    const fit = fitRect({ x: 0, y: 0, w: 100, h: 50 }, { x: 0, y: 0, w: 1000, h: 1000 }, 1.2);

    expect(fit.s).toBe(1.2);
    expect(fit.tx).toBe(500 - 50 * 1.2);
    expect(fit.ty).toBe(500 - 25 * 1.2);
  });

  test("reduce para que todo quepa", () => {
    expect(fitRect({ x: 0, y: 0, w: 2000, h: 500 }, { x: 0, y: 0, w: 1000, h: 1000 }, 2).s).toBe(0.5);
  });

  test("en pantallas angostas la tarjeta va abajo y el encuadre arriba", () => {
    expect(regionFor("left", { vw: 400, vh: 600, noteH: 200 })).toEqual({ x: 8, y: 8, w: 384, h: 600 * 0.54 - 8 });
  });

  test("elige la posición de tarjeta que deja ver el objetivo más grande", () => {
    const wideTarget = { x: 0, y: 0, w: 1600, h: 300 };
    const tallTarget = { x: 0, y: 0, w: 500, h: 900 };
    const viewport = { vw: 1440, vh: 800, noteH: 200 };

    expect(bestFit(wideTarget, ["left", "top"], viewport, 1).card).toBe("top");
    expect(bestFit(tallTarget, ["left", "top"], viewport, 1).card).toBe("left");
  });
});
