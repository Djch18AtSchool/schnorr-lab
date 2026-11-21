/** Las 7 secciones de la Consola en 3 grupos: cada una responde una sola pregunta. */
import { Activity, FlaskConical, LayoutDashboard, ListChecks, Server, ShieldAlert, Users, type LucideIcon } from "lucide-react";

export type Section = "resumen" | "actividad" | "seguridad" | "clientes" | "laboratorio" | "pruebas" | "sistema";
export type SectionGroup = "operacion" | "investigacion" | "sistema";

export interface SectionInfo {
  id: Section;
  title: string;
  /** La pregunta que responde (subtítulo de la sección). */
  question: string;
  icon: LucideIcon;
  group: SectionGroup;
}

export const GROUP_TITLES: Readonly<Record<SectionGroup, string>> = { operacion: "Operación", investigacion: "Investigación", sistema: "Sistema" };

export const SECTIONS: readonly SectionInfo[] = [
  { id: "resumen", title: "Resumen", question: "¿Qué está pasando ahora?", icon: LayoutDashboard, group: "operacion" },
  { id: "actividad", title: "Actividad", question: "¿Qué pasó con cada petición?", icon: Activity, group: "operacion" },
  { id: "seguridad", title: "Seguridad", question: "¿Quién está atacando y cómo?", icon: ShieldAlert, group: "operacion" },
  { id: "clientes", title: "Clientes", question: "¿Qué sabe el banco de cada cliente?", icon: Users, group: "operacion" },
  { id: "laboratorio", title: "Laboratorio", question: "¿Qué muestran las mediciones y los experimentos?", icon: FlaskConical, group: "investigacion" },
  { id: "pruebas", title: "Pruebas", question: "¿Qué requerimientos cubren las pruebas?", icon: ListChecks, group: "investigacion" },
  { id: "sistema", title: "Sistema", question: "¿Con qué parámetros y rutas funciona el banco?", icon: Server, group: "sistema" },
];

/** Enlaces viejos (#trafico, #usuarios…) llevan a la sección que hoy cuenta lo mismo. */
const ALIASES: Readonly<Record<string, Section>> = {
  trafico: "actividad", logs: "actividad", usuarios: "clientes", auditoria: "clientes", api: "sistema", configuracion: "sistema",
};

export const isSection = (value: string): value is Section => SECTIONS.some((s) => s.id === value);

/** La sección de un hash como «#laboratorio/impostor» (lo que va tras «/» es de la propia sección). */
export function sectionOfHash(hash: string): Section | null {
  const head = hash.replace(/^#/, "").split("/")[0];
  return isSection(head) ? head : ALIASES[head] ?? null;
}

export const sectionInfo = (id: Section): SectionInfo => SECTIONS.find((s) => s.id === id) ?? SECTIONS[0];
