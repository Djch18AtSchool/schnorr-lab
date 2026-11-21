/**
 * Aplica la preferencia «Animaciones» al documento: `<html data-motion>` decide el CSS (en lugar
 * de la media query global) y `--tempo` escala las animaciones CSS con la velocidad.
 */
import { useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import type { MotionSettings } from "../components/motion";
import { motionAttribute, resolveReduced, tempo, type MotionPref } from "../model/motion";

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

function reduceQuery(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(REDUCE_QUERY) : null;
}

function subscribe(onChange: () => void): () => void {
  const query = reduceQuery();
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

function systemReduces(): boolean {
  return reduceQuery()?.matches ?? false;
}

/** Si el sistema operativo pide menos movimiento (se actualiza si el usuario lo cambia). */
export function useSystemReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, systemReduces, () => false);
}

export function useMotion(pref: MotionPref, speed: number): MotionSettings {
  const reduced = resolveReduced(pref, useSystemReducedMotion());
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.motion = motionAttribute(reduced);
    root.style.setProperty("--tempo", String(tempo(speed)));
  }, [reduced, speed]);
  return useMemo(() => ({ speed, reduced }), [speed, reduced]);
}
