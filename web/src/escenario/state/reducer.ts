/** Estado de la dirección del acto (inmutable): config, ejecución, beat actual y revisión. */
import type { ActRun, PhoneConfig } from "../../shared/types";

export interface DirectorState {
  status: "loading" | "ready" | "offline";
  config: PhoneConfig | null;
  actId: string | null;
  run: ActRun | null;
  /** El backend respondió 409: no hay más pasos aunque el run no lo diga. */
  exhausted: boolean;
  index: number;
  /** true si el beat actual se alcanzó avanzando uno (se anima). */
  animate: boolean;
  /** Paso del backend que se está revisando en el diagrama, o null. */
  review: number | null;
  pending: boolean;
  notice: string | null;
  playing: boolean;
}

export type DirectorAction =
  | { type: "configLoaded"; config: PhoneConfig }
  | { type: "offline"; message: string }
  | { type: "runStarted"; run: ActRun }
  | { type: "runAdvanced"; run: ActRun; index: number; animate: boolean }
  | { type: "exhausted"; index: number }
  | { type: "goto"; index: number; animate: boolean }
  | { type: "review"; stepIndex: number | null }
  | { type: "pending"; value: boolean }
  | { type: "notice"; message: string | null }
  | { type: "playing"; value: boolean };

export const INITIAL_STATE: DirectorState = {
  status: "loading",
  config: null,
  actId: null,
  run: null,
  exhausted: false,
  index: 0,
  animate: false,
  review: null,
  pending: false,
  notice: null,
  playing: false,
};

export function directorReducer(state: DirectorState, action: DirectorAction): DirectorState {
  switch (action.type) {
    case "configLoaded":
      return { ...state, status: "ready", config: action.config, notice: null };
    case "offline":
      return { ...state, status: "offline", pending: false, notice: action.message };
    case "runStarted":
      return {
        ...state, run: action.run, actId: action.run.act, exhausted: false, index: 0, animate: false,
        review: null, pending: false, notice: null, playing: false,
      };
    case "runAdvanced":
      return { ...state, run: action.run, index: action.index, animate: action.animate, review: null, pending: false };
    case "exhausted":
      return { ...state, exhausted: true, index: action.index, animate: false, pending: false };
    case "goto":
      return { ...state, index: Math.max(0, action.index), animate: action.animate, review: null };
    case "review":
      return { ...state, review: action.stepIndex, playing: action.stepIndex === null ? state.playing : false };
    case "pending":
      return { ...state, pending: action.value };
    case "notice":
      return { ...state, notice: action.message, pending: false };
    case "playing":
      return { ...state, playing: action.value };
    default:
      return state;
  }
}

/** Acto que se carga al abrir: el inicio de sesión si está disponible. */
export function defaultAct(config: PhoneConfig, preferred = "login"): string | null {
  const available = config.acts.filter((a) => a.available);
  return (available.find((a) => a.id === preferred) ?? available[0])?.id ?? null;
}
