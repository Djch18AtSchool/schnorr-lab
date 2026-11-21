/** Hook de la dirección del acto: estado con useReducer y acciones de directorActions. */
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import type { ScenarioSource } from "../data/source";
import * as actions from "./directorActions";
import { directorReducer, INITIAL_STATE, type DirectorState } from "./reducer";

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
  const generation = useRef(0);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  const ctx = useMemo<actions.DirectorContext>(
    () => ({ source, dispatch, getState: () => stateRef.current, generation }),
    [source],
  );

  const controls = useMemo<DirectorControls>(
    () => ({
      next: () => actions.next(ctx),
      prev: () => actions.prev(ctx),
      restart: () => {
        const actId = ctx.getState().actId;
        if (actId) void actions.startAct(ctx, actId);
      },
      jumpTo: (index) => actions.jumpTo(ctx, index),
      selectAct: (actId) => void actions.startAct(ctx, actId),
      selectGroup: (group) => void actions.selectGroup(ctx, group),
      review: (stepIndex) => dispatch({ type: "review", stepIndex }),
      setPlaying: (value) => dispatch({ type: "playing", value }),
      dismissNotice: () => dispatch({ type: "notice", message: null }),
    }),
    [ctx],
  );

  useEffect(() => {
    let cancelled = false;
    void actions.loadInitial(ctx, () => cancelled);
    return () => {
      cancelled = true;
      ctx.generation.current += 1;
    };
  }, [ctx]);

  return [state, controls];
}
