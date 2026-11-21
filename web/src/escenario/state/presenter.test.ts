import { describe, expect, test } from "vitest";
import { playAct } from "../fixtures/runs";
import { SCRIPTED_ACTS } from "../data/simulated/acts";
import { DEFAULT_PREFS, parsePrefs } from "./prefs";
import { buildScene } from "./scene";
import { EVENT_WAIT_MS, HOLD_MS, holdFor } from "./useAutoPlay";
import { actionForKey } from "./useKeyboard";

describe("atajos", () => {
  test("cada tecla de la exposición tiene su acción", () => {
    expect(["ArrowRight", " ", "ArrowLeft", "r", "D", "c", "M", "Escape", "x"].map(actionForKey)).toEqual([
      "next", "togglePlay", "prev", "restart", "toggleDrawer", "toggleCam", "toggleMath", "escape", null,
    ]);
  });
});

describe("preferencias", () => {
  test("valida lo guardado y cae en los valores por defecto", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("{roto")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs(JSON.stringify({ mode: "auto", speed: 3, cam: "wide", dim: false, math: "sí", theme: "dark", motion: "lento" }))).toEqual({
      mode: "auto", speed: 1, cam: "wide", dim: false, math: true, theme: "dark", motion: "full",
    });
  });

  test("las animaciones son «Completas» por defecto y se recuerdan las otras opciones", () => {
    expect(DEFAULT_PREFS.motion).toBe("full");
    expect(parsePrefs(JSON.stringify({ motion: "reduced" })).motion).toBe("reduced");
    expect(parsePrefs(JSON.stringify({ motion: "system" })).motion).toBe("system");
  });
});

describe("modo automático", () => {
  test("sostiene cada toma según la velocidad y espera a los eventos del banco", () => {
    expect(holdFor(2, false)).toBe(HOLD_MS / 2);
    expect(holdFor(1, true)).toBe(HOLD_MS + EVENT_WAIT_MS);
  });
});

describe("buildScene", () => {
  test("arma la toma completa y acota el índice", async () => {
    const { final, store } = await playAct("espia_respuesta");
    const act = SCRIPTED_ACTS.find((a) => a.info.id === "espia_respuesta")?.info ?? null;

    const scene = buildScene({ run: final, act, index: 99, exhausted: false, review: null, animate: true, cam: "follow", store });
    const review = buildScene({ run: final, act, index: 3, exhausted: false, review: 2, animate: true, cam: "follow", store });

    expect(scene).toMatchObject({ atEnd: true, hasEve: true, focus: "summary" });
    expect(scene.index).toBe(scene.beats.length - 1);
    expect(review.focus).toBe("review");
    expect(review.note.who).toBe("Revisando el paso 3 del diagrama");
  });
});
