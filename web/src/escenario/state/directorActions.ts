/**
 * Acciones de la dirección del acto, como funciones sobre un contexto (fuente, dispatch y
 * lectura del estado). Cuando el siguiente beat pertenece a un paso sin ejecutar, se llama a
 * POST /api/acts/{id}/next. ← solo retrocede entre beats ya vistos: no deshace el backend.
 */
import type { Dispatch } from "react";
import { ApiError } from "../../shared/api";
import type { ActRun } from "../../shared/types";
import type { ScenarioSource } from "../data/source";
import { advanceFrom, buildBeats } from "../model/beats";
import { defaultAct, type DirectorAction, type DirectorState } from "./reducer";

const HTTP_CONFLICT = 409;

export interface DirectorContext {
  source: ScenarioSource;
  dispatch: Dispatch<DirectorAction>;
  getState: () => DirectorState;
  /** Cambia al crear otra ejecución: las respuestas viejas se descartan. */
  generation: { current: number };
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Error inesperado";
}

export async function startAct(ctx: DirectorContext, actId: string): Promise<void> {
  ctx.generation.current += 1;
  const gen = ctx.generation.current;
  ctx.dispatch({ type: "pending", value: true });
  try {
    const run = await ctx.source.startAct(actId);
    if (gen === ctx.generation.current) ctx.dispatch({ type: "runStarted", run });
  } catch (error: unknown) {
    if (gen === ctx.generation.current) ctx.dispatch({ type: "notice", message: `No se pudo preparar el acto: ${errorText(error)}` });
  }
}

/** Ejecuta pasos en el backend hasta que el beat `target` esté listo y lo muestra. */
export async function fetchUntil(ctx: DirectorContext, run: ActRun, target: number, animate: boolean): Promise<void> {
  const gen = ctx.generation.current;
  ctx.dispatch({ type: "pending", value: true });
  let current = run;
  try {
    while (!buildBeats(current)[target]?.ready && current.next_index < current.steps.length) {
      current = await ctx.source.nextStep(current.id);
      if (gen !== ctx.generation.current) return;
    }
    ctx.dispatch({ type: "runAdvanced", run: current, index: Math.min(target, buildBeats(current).length - 1), animate });
  } catch (error: unknown) {
    if (gen !== ctx.generation.current) return;
    if (error instanceof ApiError && error.status === HTTP_CONFLICT) {
      ctx.dispatch({ type: "exhausted", index: buildBeats(current, true).length - 1 });
    } else {
      ctx.dispatch({ type: "notice", message: `No se pudo avanzar: ${errorText(error)}` });
    }
  }
}

export function next(ctx: DirectorContext): void {
  const s = ctx.getState();
  if (!s.run || s.pending) return;
  if (s.review !== null) return ctx.dispatch({ type: "review", stepIndex: null });
  const advance = advanceFrom(buildBeats(s.run, s.exhausted), s.index);
  if (advance.kind === "goto") return ctx.dispatch({ type: "goto", index: advance.index, animate: true });
  if (advance.kind === "end") {
    ctx.dispatch({ type: "playing", value: false });
    if (s.actId) void startAct(ctx, s.actId);
    return;
  }
  void fetchUntil(ctx, s.run, s.index + 1, true);
}

export function prev(ctx: DirectorContext): void {
  const s = ctx.getState();
  if (s.review !== null) return ctx.dispatch({ type: "review", stepIndex: null });
  if (s.index > 0 && !s.pending) ctx.dispatch({ type: "goto", index: s.index - 1, animate: false });
}

export function jumpTo(ctx: DirectorContext, index: number): void {
  const s = ctx.getState();
  if (!s.run || s.pending) return;
  const target = buildBeats(s.run, s.exhausted)[index];
  if (!target) return;
  if (target.ready) return ctx.dispatch({ type: "goto", index, animate: index === s.index + 1 });
  void fetchUntil(ctx, s.run, index, index === s.index + 1);
}

export async function selectGroup(ctx: DirectorContext, group: string): Promise<void> {
  const actId = ctx.getState().actId;
  ctx.dispatch({ type: "pending", value: true });
  try {
    const config = await ctx.source.resetLab(group);
    ctx.dispatch({ type: "configLoaded", config });
    const act = actId ?? defaultAct(config);
    if (act) await startAct(ctx, act);
  } catch (error: unknown) {
    ctx.dispatch({ type: "notice", message: `No se pudo cambiar el grupo: ${errorText(error)}` });
  }
}

/** Carga la configuración y prepara el acto por defecto; si no hay backend, queda «offline». */
export async function loadInitial(ctx: DirectorContext, isCancelled: () => boolean): Promise<void> {
  try {
    const config = await ctx.source.loadConfig();
    if (isCancelled()) return;
    ctx.dispatch({ type: "configLoaded", config });
    const act = defaultAct(config);
    if (act) await startAct(ctx, act);
  } catch (error: unknown) {
    if (!isCancelled()) ctx.dispatch({ type: "offline", message: errorText(error) });
  }
}
