import { describe, expect, it } from "vitest";
import { SECTIONS, sectionByKey, sectionOfHash } from "./sections";

describe("secciones", () => {
  it("nueve secciones con Pruebas propia entre Laboratorio y API", () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(["resumen", "trafico", "logs", "usuarios", "auditoria", "laboratorio", "pruebas", "api", "configuracion"]);
  });

  it("los atajos 1–9 siguen el orden de la navegación", () => {
    expect(sectionByKey("6")).toBe("laboratorio");
    expect(sectionByKey("7")).toBe("pruebas");
    expect(sectionByKey("9")).toBe("configuracion");
    expect(sectionByKey("0")).toBeNull();
    expect(sectionByKey("p")).toBeNull();
  });

  it("el hash con subsección pertenece a su sección", () => {
    expect(sectionOfHash("#laboratorio/impostor")).toBe("laboratorio");
    expect(sectionOfHash("#pruebas")).toBe("pruebas");
    expect(sectionOfHash("#otra")).toBeNull();
    expect(sectionOfHash("")).toBeNull();
  });
});
