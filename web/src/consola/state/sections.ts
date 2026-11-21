/** Las 8 secciones de la Consola, en el orden de los atajos 1–8. */
import type { IconName } from "../components/Icons";

export type Section = "resumen" | "trafico" | "logs" | "usuarios" | "auditoria" | "laboratorio" | "api" | "configuracion";

export interface SectionInfo {
  id: Section;
  title: string;
  icon: IconName;
  group: "operacion" | "sistema";
}

export const SECTIONS: readonly SectionInfo[] = [
  { id: "resumen", title: "Resumen", icon: "resumen", group: "operacion" },
  { id: "trafico", title: "Tráfico", icon: "trafico", group: "operacion" },
  { id: "logs", title: "Logs", icon: "logs", group: "operacion" },
  { id: "usuarios", title: "Usuarios", icon: "usuarios", group: "operacion" },
  { id: "auditoria", title: "Auditoría", icon: "auditoria", group: "operacion" },
  { id: "laboratorio", title: "Laboratorio", icon: "laboratorio", group: "sistema" },
  { id: "api", title: "API", icon: "api", group: "sistema" },
  { id: "configuracion", title: "Configuración", icon: "configuracion", group: "sistema" },
];

export const isSection = (value: string): value is Section => SECTIONS.some((s) => s.id === value);

export const sectionByKey = (key: string): Section | null => {
  const n = Number(key);
  return Number.isInteger(n) && n >= 1 && n <= SECTIONS.length ? SECTIONS[n - 1].id : null;
};
