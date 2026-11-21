/** Modo automático: sostiene cada toma un momento y avanza; espera a los eventos del banco. */
import { useEffect } from "react";

export const HOLD_MS = 2800;
/** Tiempo máximo extra que se espera a que lleguen por SSE los eventos del banco. */
export const EVENT_WAIT_MS = 1500;

export function holdFor(speed: number, waiting: boolean): number {
  return HOLD_MS / speed + (waiting ? EVENT_WAIT_MS : 0);
}

interface AutoPlayInput {
  active: boolean;
  beatKey: string;
  speed: number;
  waiting: boolean;
  atEnd: boolean;
  next: () => void;
  stop: () => void;
}

export function useAutoPlay({ active, beatKey, speed, waiting, atEnd, next, stop }: AutoPlayInput): number | null {
  const hold = active && !atEnd ? holdFor(speed, waiting) : null;
  useEffect(() => {
    if (!active) return undefined;
    if (atEnd) {
      stop();
      return undefined;
    }
    const timer = window.setTimeout(next, holdFor(speed, waiting));
    return () => window.clearTimeout(timer);
  }, [active, beatKey, speed, waiting, atEnd, next, stop]);
  return hold;
}
