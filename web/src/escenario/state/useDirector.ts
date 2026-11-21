/**
 * Orquesta el acto: carga la configuración, crea la ejecución y avanza beat a beat. Cuando el
 * siguiente beat pertenece a un paso sin ejecutar, llama a POST /api/acts/{id}/next.
 * ← solo retrocede entre beats ya vistos: no deshace nada en el backend.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import { ApiError } from "../../shared/api";
import type { ActRun } from "../../shared/types";
import type { ScenarioSource } from "../data/source";
import { advanceFrom, buildBeats } from "../model/beats";
import { defaultAct, directorReducer, INITIAL_STATE, type DirectorState } from "./reducer";

const HTTP_CONFLICT = 409;

export function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Error inesperado";
}

export interface DirectorControls {
  next: () => void;
  prev: () => void;
  restart: () => void;
  jumpTo: (index: number) => void;
  selectAct: (actId: string) => void;
  selectGroup: (group: string) => void;
  review: (stepIndex: number | null) => void;
  setPlaying: (value: boolean) => void;
  dismissNotice: () => void;
}

export function useDirector(source: ScenarioSource): [DirectorState, DirectorControls] {
  const [state, dispatch] = useReducer(directorReducer, INITIAL_STATE);
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);
  const generation = useRef(0);

  const start = useCallback(
    async (actId: string) => {
      generation.current += 1;
      const gen = generation.current;
      dispatch({ type: "pending", value: true });
      try {
        const run = await source.startAct(actId);
        if (gen === generation.current) dispatch({ type: "runStarted", run });
      } catch (error: unknown) {
        if (gen === generation.current) dispatch({ type: "notice", message: `No se pudo preparar el acto: ${errorText(error)}` });
      }
    },
    [source],
  );

  /** Ejecuta pasos en el backend hasta que el beat `target` esté listo. */
  const fetchUntil = useCallback(
    async (run: ActRun, target: number, animate: boolean) => {
      const gen = generation.current;
      dispatch({ type: "pending", value: true });
      let current = run;
      try {
        while (!buildBeats(current)[target]?.ready && current.next_index < current.steps.length) {
          current = await source.nextStep(current.id);
          if (gen !== generation.current) return;
        }
        dispatch({ type: "runAdvanced", run: current, index: Math.min(target, buildBeats(current).length - 1), animate });
      } catch (error: unknown) {
        if (gen !== generation.current) return;
        if (error instanceof ApiError && error.status === HTTP_CONFLICT) dispatch({ type: "exhausted", index: buildBeats(current, true).length - 1 });
        else dispatch({ type: "notice", message: `No se pudo avanzar: ${errorText(error)}` });
      }
    },
    [source],
  );

  const controls = useMemo<DirectorControls>(() => {
    const beatsOf = (s: DirectorState) => (s.run ? buildBeats(s.run, s.exhausted) : []);
    return {
      next() {
        const s = stateRef.current;
        if (!s.run || s.pending) return;
        if (s.review !== null) return dispatch({ type: "review", stepIndex: null });
        const advance = advanceFrom(beatsOf(s), s.index);
        if (advance.kind === "goto") return dispatch({ type: "goto", index: advance.index, animate: true });
        if (advance.kind === "end") {
          dispatch({ type: "playing", value: false });
          return void (s.actId && start(s.actId));
        }
        void fetchUntil(s.run, s.index + 1, true);
      },
      prev() {
        const s = stateRef.current;
        if (s.review !== null) return dispatch({ type: "review", stepIndex: null });
        if (s.index > 0 && !s.pending) dispatch({ type: "goto", index: s.index - 1, animate: false });
      },
      restart() {
        const s = stateRef.current;
        if (s.actId) void start(s.actId);
      },
      jumpTo(index) {
        const s = stateRef.current;
        if (!s.run || s.pending) return;
        const target = beatsOf(s)[index];
        if (!target) return;
        if (target.ready) return dispatch({ type: "goto", index, animate: index === s.index + 1 });
        void fetchUntil(s.run, index, index === s.index + 1);
      },
      selectAct(actId) {
        void start(actId);
      },
      selectGroup(group) {
        const s = stateRef.current;
        dispatch({ type: "pending", value: true });
        source
          .resetLab(group)
          .then((config) => {
            dispatch({ type: "configLoaded", config });
            const act = s.actId ?? defaultAct(config);
            if (act) void start(act);
          })
          .catch((error: unknown) => dispatch({ type: "notice", message: `No se pudo cambiar el grupo: ${errorText(error)}` }));
      },
      review: (stepIndex) => dispatch({ type: "review", stepIndex }),
      setPlaying: (value) => dispatch({ type: "playing", value }),
      dismissNotice: () => dispatch({ type: "notice", message: null }),
    };
  }, [source, start, fetchUntil]);

  useEffect(() => {
    let cancelled = false;
    source
      .loadConfig()
      .then((config) => {
        if (cancelled) return;
        dispatch({ type: "configLoaded", config });
        const act = defaultAct(config);
        if (act) void start(act);
      })
      .catch((error: unknown) => {
        if (!cancelled) dispatch({ type: "offline", message: errorText(error) });
      });
    return () => {
      cancelled = true;
      generation.current += 1;
    };
  }, [source, start]);

  return [state, controls];
}
