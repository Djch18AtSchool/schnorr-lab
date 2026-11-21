/**
 * Política de movimiento del Escenario: si se anima por completo o en modo reducido, y cuánto
 * duran la cámara y las animaciones CSS según la velocidad elegida.
 */

/** «Completas» por defecto: el Escenario se proyecta y debe verse igual en cualquier equipo. */
export type MotionPref = "full" | "reduced" | "system";
export type MotionAttribute = "completo" | "reducido";

/** Duración base de un movimiento de cámara a 1×. */
export const CAM_MS = 1000;
/** Ni a la velocidad más alta la cámara baja de esto: debe seguir leyéndose como movimiento. */
export const MIN_CAM_MS = 500;

export function resolveReduced(pref: MotionPref, systemReduces: boolean): boolean {
  if (pref === "full") return false;
  if (pref === "reduced") return true;
  return systemReduces;
}

export function motionAttribute(reduced: boolean): MotionAttribute {
  return reduced ? "reducido" : "completo";
}

/** Factor de las duraciones CSS (`--tempo`): a 2× todo dura la mitad, a 0,5× el doble. */
export function tempo(speed: number): number {
  return 1 / speed;
}

/** La cámara escala con la raíz de la velocidad (un 2× no debe marear); en modo reducido corta. */
export function cameraMs(speed: number, reduced: boolean): number {
  if (reduced) return 0;
  return Math.max(MIN_CAM_MS, Math.round(CAM_MS / Math.sqrt(speed)));
}
