/** Las 9 secciones de la Consola, en el orden de los atajos 1–9. */
import { ArrowLeftRight, Braces, ClipboardCheck, FlaskConical, LayoutDashboard, ListChecks, ScrollText, SlidersHorizontal, Users, type LucideIcon } from "lucide-react";

export type Section = "resumen" | "trafico" | "logs" | "usuarios" | "auditoria" | "laboratorio" | "pruebas" | "api" | "configuracion";

export interface SectionInfo {
  id: Section;
  title: string;
  icon: LucideIcon;
  group: "operacion" | "sistema";
}

export const SECTIONS: readonly SectionInfo[] = [
  { id: "resumen", title: "Resumen", icon: LayoutDashboard, group: "operacion" },
  { id: "trafico", title: "Tráfico", icon: ArrowLeftRight, group: "operacion" },
  { id: "logs", title: "Logs", icon: ScrollText, group: "operacion" },
  { id: "usuarios", title: "Usuarios", icon: Users, group: "operacion" },
  { id: "auditoria", title: "Auditoría", icon: ClipboardCheck, group: "operacion" },
  { id: "laboratorio", title: "Laboratorio", icon: FlaskConical, group: "sistema" },
  { id: "pruebas", title: "Pruebas", icon: ListChecks, group: "sistema" },
  { id: "api", title: "API", icon: Braces, group: "sistema" },
  { id: "configuracion", title: "Configuración", icon: SlidersHorizontal, group: "sistema" },
];

export const isSection = (value: string): value is Section => SECTIONS.some((s) => s.id === value);

/** La sección de un hash como «#laboratorio/impostor» (lo que va tras «/» es de la propia sección). */
export function sectionOfHash(hash: string): Section | null {
  const head = hash.replace(/^#/, "").split("/")[0];
  return isSection(head) ? head : null;
}

export const sectionByKey = (key: string): Section | null => {
  const n = Number(key);
  return Number.isInteger(n) && n >= 1 && n <= SECTIONS.length ? SECTIONS[n - 1].id : null;
};
