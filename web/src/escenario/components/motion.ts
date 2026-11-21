/**
 * Animaciones de entrada con Motion (Web Animations), escaladas por la velocidad elegida y
 * omitidas en modo reducido (preferencia «Animaciones» del drawer, ver state/useMotion).
 */
import { animate } from "motion";
import { createContext, useContext } from "react";

export interface MotionSettings {
  speed: number;
  reduced: boolean;
}

export const MotionContext = createContext<MotionSettings>({ speed: 1, reduced: false });

export function useMotionSettings(): MotionSettings {
  return useContext(MotionContext);
}

type Keyframes = Record<string, string[] | number[]>;

export interface PlayOptions {
  ms: number;
  delayMs?: number;
  ease?: [number, number, number, number];
}

const DEFAULT_EASE: [number, number, number, number] = [0.3, 0.7, 0.2, 1];
const MS_PER_S = 1000;

/** Reproduce una animación de entrada; no hace nada sin elemento o con movimiento reducido. */
export function play(el: Element | null, keyframes: Keyframes, options: PlayOptions, settings: MotionSettings): () => void {
  if (!el || settings.reduced) return () => undefined;
  const controls = animate(el, keyframes, {
    duration: options.ms / settings.speed / MS_PER_S,
    delay: (options.delayMs ?? 0) / settings.speed / MS_PER_S,
    ease: options.ease ?? DEFAULT_EASE,
  });
  return () => controls.complete();
}
