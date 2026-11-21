import { describe, expect, test } from "vitest";
import { ApiError } from "../../shared/api";
import { createSimulatedSource } from "../data/simulated/simulatedSource";
import type { ScenarioSource } from "../data/source";
import { buildBeats } from "../model/beats";
import * as actions from "./directorActions";
import { defaultAct, directorReducer, INITIAL_STATE, type DirectorState } from "./reducer";

function harness(source: ScenarioSource = createSimulatedSource({ eventDelayMs: 0 })) {
  let state: DirectorState = INITIAL_STATE;
  const ctx: actions.DirectorContext = {
    source,
    dispatch: (action) => {
      state = directorReducer(state, action);
    },
    getState: () => state,
    generation: { current: 0 },
  };
  return { ctx, state: () => state };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("acciones de dirección", () => {
  test("al cargar prepara el inicio de sesión en el plano general", async () => {
    const { ctx, state } = harness();

    await actions.loadInitial(ctx, () => false);

    expect(state()).toMatchObject({ status: "ready", actId: "login", index: 0, pending: false });
    expect(state().run?.next_index).toBe(0);
  });

  test("→ avanza entre beats listos y pide un paso al backend cuando hace falta", async () => {
    const { ctx, state } = harness();
    await actions.loadInitial(ctx, () => false);

    actions.next(ctx);
    expect(state()).toMatchObject({ index: 1, animate: true });
    actions.next(ctx);
    expect(state().pending).toBe(true);
    await flush();

    expect(state()).toMatchObject({ index: 2, pending: false, animate: true });
    expect(state().run?.next_index).toBe(1);
  });

  test("← retrocede sin tocar el backend y no baja de cero", async () => {
    const { ctx, state } = harness();
    await actions.loadInitial(ctx, () => false);
    actions.prev(ctx);
    expect(state().index).toBe(0);

    actions.next(ctx);
    actions.prev(ctx);

    expect(state()).toMatchObject({ index: 0, animate: false });
  });

  test("saltar a un cuadro futuro ejecuta los pasos necesarios", async () => {
    const { ctx, state } = harness();
    await actions.loadInitial(ctx, () => false);
    const run = state().run;
    if (!run) throw new Error("sin run");
    const target = buildBeats(run).findIndex((b) => b.id === "s2:x0:srv");

    actions.jumpTo(ctx, target);
    for (let i = 0; i < 5; i += 1) await flush();

    expect(state().index).toBe(target);
    expect(state().run?.next_index).toBe(3);
  });

  test("al final, → vuelve a preparar el acto", async () => {
    const { ctx, state } = harness();
    await actions.loadInitial(ctx, () => false);
    const firstId = state().run?.id;
    for (let i = 0; i < 40 && !(state().run && state().index === buildBeats(state().run!).length - 1); i += 1) {
      actions.next(ctx);
      await flush();
    }

    actions.next(ctx);
    await flush();

    expect(state().index).toBe(0);
    expect(state().run?.id).not.toBe(firstId);
  });

  test("un 409 marca el acto como agotado y muestra el resumen", async () => {
    const base = createSimulatedSource({ eventDelayMs: 0 });
    const source: ScenarioSource = { ...base, nextStep: async () => Promise.reject(new ApiError("El acto ya terminó", 409)) };
    const { ctx, state } = harness(source);
    await actions.loadInitial(ctx, () => false);
    actions.next(ctx);

    actions.next(ctx);
    await flush();

    expect(state().exhausted).toBe(true);
    expect(state().index).toBe(buildBeats(state().run!, true).length - 1);
  });

  test("sin backend queda fuera de línea con el motivo", async () => {
    const source: ScenarioSource = { ...createSimulatedSource(), loadConfig: async () => Promise.reject(new Error("502 Bad Gateway")) };
    const { ctx, state } = harness(source);

    await actions.loadInitial(ctx, () => false);

    expect(state()).toMatchObject({ status: "offline", notice: "502 Bad Gateway" });
  });

  test("si se elige otro acto mientras el primero carga, gana el último", async () => {
    const { ctx, state } = harness();

    const first = actions.startAct(ctx, "login");
    const second = actions.startAct(ctx, "registro");
    await Promise.all([first, second]);

    expect(state().actId).toBe("registro");
  });

  test("cambiar a un grupo que no existe muestra el error y conserva el acto", async () => {
    const { ctx, state } = harness();
    await actions.loadInitial(ctx, () => false);

    await actions.selectGroup(ctx, "rfc-2048");

    expect(state().notice).toContain("No se pudo cambiar el grupo");
    expect(state().actId).toBe("login");
  });
});

describe("reducer", () => {
  test("revisar una fase pausa la reproducción y salir la conserva", () => {
    const playing = { ...INITIAL_STATE, playing: true };

    expect(directorReducer(playing, { type: "review", stepIndex: 2 })).toMatchObject({ review: 2, playing: false });
    expect(directorReducer(playing, { type: "review", stepIndex: null }).playing).toBe(true);
    expect(directorReducer(INITIAL_STATE, { type: "goto", index: -3, animate: false }).index).toBe(0);
  });

  test("el acto por defecto es el inicio de sesión o el primero disponible", async () => {
    const config = await createSimulatedSource().loadConfig();

    expect(defaultAct(config)).toBe("login");
    expect(defaultAct({ ...config, acts: config.acts.filter((a) => a.id !== "login") })).toBe("registro");
    expect(defaultAct({ ...config, acts: [] })).toBeNull();
  });
});
