/** Preferencias de dirección (por espectador, en localStorage si está disponible). */
import { useCallback, useEffect, useState } from "react";
import type { CamMode } from "../model/camera";
import type { MotionPref } from "../model/motion";

export type PlayMode = "step" | "auto";
export type Theme = "light" | "dark" | "system";

export interface Prefs {
  mode: PlayMode;
  speed: number;
  cam: CamMode;
  dim: boolean;
  math: boolean;
  theme: Theme;
  motion: MotionPref;
}

export const SPEEDS: readonly number[] = [0.5, 1, 1.5, 2];
export const DEFAULT_PREFS: Prefs = { mode: "step", speed: 1, cam: "follow", dim: true, math: true, theme: "light", motion: "full" };
const STORAGE_KEY = "schnorr-lab.escenario.prefs";

/** Valida lo guardado (puede venir de otra versión o estar corrupto). */
export function parsePrefs(raw: string | null): Prefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const data: unknown = JSON.parse(raw);
    if (data === null || typeof data !== "object") return DEFAULT_PREFS;
    const d = data as Record<string, unknown>;
    return {
      mode: d.mode === "auto" ? "auto" : "step",
      speed: typeof d.speed === "number" && SPEEDS.includes(d.speed) ? d.speed : DEFAULT_PREFS.speed,
      cam: d.cam === "wide" ? "wide" : "follow",
      dim: typeof d.dim === "boolean" ? d.dim : DEFAULT_PREFS.dim,
      math: typeof d.math === "boolean" ? d.math : DEFAULT_PREFS.math,
      theme: d.theme === "dark" || d.theme === "system" ? d.theme : "light",
      motion: d.motion === "reduced" || d.motion === "system" ? d.motion : "full",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(prefs: Prefs): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Sin almacenamiento (ventana privada): las preferencias duran lo que dure la página.
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.dataset.theme = theme;
}

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>(() => parsePrefs(readStored()));
  useEffect(() => {
    applyTheme(prefs.theme);
    writeStored(prefs);
  }, [prefs]);
  const update = useCallback((patch: Partial<Prefs>) => setPrefs((current) => ({ ...current, ...patch })), []);
  return [prefs, update];
}
