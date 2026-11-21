/**
 * Lo que necesita quien presenta: la toma actual, reproducción automática y atajos de teclado.
 */
import { useCallback, useMemo } from "react";
import type { ActInfo } from "../../shared/types";
import type { EventStore } from "../model/events";
import type { Prefs } from "./prefs";
import type { DirectorState } from "./reducer";
import { buildScene, type Scene } from "./scene";
import { useAutoPlay } from "./useAutoPlay";
import type { DirectorControls } from "./useDirector";
import { useKeyboard, type KeyHandlers } from "./useKeyboard";

export function useScene(state: DirectorState, act: ActInfo | null, prefs: Prefs, store: EventStore): Scene | null {
  const { run, index, exhausted, review, animate } = state;
  return useMemo(
    () => (run ? buildScene({ run, act, index, exhausted, review, animate, cam: prefs.cam, store }) : null),
    [run, act, index, exhausted, review, animate, prefs.cam, store],
  );
}

interface PlaybackInput {
  state: DirectorState;
  ctl: DirectorControls;
  prefs: Prefs;
  scene: Scene | null;
}

export interface Playback {
  togglePlay: () => void;
  holdMs: number | null;
}

/** → en paso a paso; reproducir/pausar en automático (con la barra de progreso del cuadro). */
export function usePlayback({ state, ctl, prefs, scene }: PlaybackInput): Playback {
  const auto = prefs.mode === "auto";
  const stop = useCallback(() => ctl.setPlaying(false), [ctl]);
  const togglePlay = useCallback(() => {
    if (!auto) return ctl.next();
    if (state.playing) return ctl.setPlaying(false);
    ctl.setPlaying(true);
    ctl.next();
  }, [auto, state.playing, ctl]);
  const holdMs = useAutoPlay({
    active: auto && state.playing && !state.pending && state.review === null && scene !== null,
    beatKey: scene ? `${state.run?.id}:${scene.beat.id}` : "",
    speed: prefs.speed,
    waiting: scene?.terminal.waiting ?? false,
    atEnd: scene?.atEnd ?? false,
    next: ctl.next,
    stop,
  });
  return { togglePlay, holdMs };
}

interface ShortcutsInput {
  ctl: DirectorControls;
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  togglePlay: () => void;
  drawerOpen: boolean;
  setDrawerOpen: (update: (open: boolean) => boolean) => void;
}

export function useShortcuts({ ctl, prefs, setPrefs, togglePlay, drawerOpen, setDrawerOpen }: ShortcutsInput): KeyHandlers {
  const handlers = useMemo<KeyHandlers>(
    () => ({
      next: () => {
        ctl.setPlaying(false);
        ctl.next();
      },
      togglePlay,
      prev: () => {
        ctl.setPlaying(false);
        ctl.prev();
      },
      restart: ctl.restart,
      toggleDrawer: () => setDrawerOpen((open) => !open),
      toggleCam: () => setPrefs({ cam: prefs.cam === "follow" ? "wide" : "follow" }),
      toggleMath: () => setPrefs({ math: !prefs.math }),
      escape: () => (drawerOpen ? setDrawerOpen(() => false) : ctl.review(null)),
    }),
    [ctl, togglePlay, setPrefs, prefs.cam, prefs.math, drawerOpen, setDrawerOpen],
  );
  useKeyboard(handlers);
  return handlers;
}
