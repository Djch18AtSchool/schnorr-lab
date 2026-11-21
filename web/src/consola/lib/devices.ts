/**
 * Dispositivos que el banco reconoce (cabecera X-Device) con el color y la forma de su actor, los
 * mismos del Escenario: celular de Ana índigo, laptop de Eve magenta y soporte del banco neutro.
 */
export type ActorKey = "ana" | "eve" | "support" | "other";
export type DeviceShape = "circle" | "diamond" | "square" | "triangle";

export interface DeviceInfo {
  device: string;
  actor: ActorKey;
  /** Nombre con mayúscula inicial: «Celular de Ana». */
  label: string;
  shape: DeviceShape;
}

const KNOWN: Readonly<Record<string, Omit<DeviceInfo, "device">>> = {
  "celular de Ana": { actor: "ana", label: "Celular de Ana", shape: "circle" },
  "laptop de Eve": { actor: "eve", label: "Laptop de Eve", shape: "diamond" },
  "soporte del banco": { actor: "support", label: "Soporte del banco", shape: "square" },
};

/** Orden fijo de los filtros y leyendas. */
export const KNOWN_DEVICES: readonly string[] = Object.keys(KNOWN);

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export function deviceInfo(device: string): DeviceInfo {
  const known = KNOWN[device];
  if (known) return { device, ...known };
  const label = !device || device === "desconocido" ? "Dispositivo desconocido" : capitalize(device);
  return { device, actor: "other", label, shape: "triangle" };
}

/** Variable CSS del color del actor (para SVG y estilos en línea). */
export const ACTOR_COLOR: Readonly<Record<ActorKey, string>> = {
  ana: "var(--ana)", eve: "var(--eve)", support: "var(--ink-3)", other: "var(--net)",
};
