import { describe, expect, it } from "vitest";
import { SECTIONS, sectionOfHash } from "./sections";

describe("secciones", () => {
  it("siete secciones en tres grupos, en el orden de la navegación", () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(["resumen", "actividad", "seguridad", "clientes", "laboratorio", "pruebas", "sistema"]);
    expect([...new Set(SECTIONS.map((s) => s.group))]).toEqual(["operacion", "investigacion", "sistema"]);
  });

  it("el hash con subsección pertenece a su sección y los enlaces viejos llevan a la nueva", () => {
    expect(sectionOfHash("#laboratorio/impostor")).toBe("laboratorio");
    expect(sectionOfHash("#trafico")).toBe("actividad");
    expect(sectionOfHash("#auditoria")).toBe("clientes");
    expect(sectionOfHash("#configuracion")).toBe("sistema");
    expect(sectionOfHash("#otra")).toBeNull();
    expect(sectionOfHash("")).toBeNull();
  });
});
