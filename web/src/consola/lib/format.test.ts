import { describe, expect, it } from "vitest";
import { ago, fmtClock, fmtMs, plural, rel, sci, sciParts, shortId, shortNum, sup } from "./format";

describe("formateos", () => {
  it("fmtClock usa la hora local con dos dígitos", () => {
    const ts = new Date(2026, 10, 24, 9, 5, 7).getTime() / 1000;
    expect(fmtClock(ts)).toBe("09:05:07");
  });

  it("rel describe el tiempo relativo en español", () => {
    expect(rel(100, 102)).toBe("ahora");
    expect(rel(100, 130)).toBe("hace 30 s");
    expect(rel(0, 180)).toBe("hace 3 min");
    expect(rel(0, 3900)).toBe("hace 1 h 5 min");
    expect(ago(0, 40)).toBe("40 s antes");
    expect(ago(0, 300)).toBe("5 min antes");
  });

  it("sci escribe notación científica con superíndices", () => {
    expect(sci(15156644320.2)).toBe("1.5·10¹⁰");
    expect(sci(2.637643606353062e-7, 2)).toBe("2.64·10⁻⁷");
    expect(sci(42.123)).toBe("42.1");
    expect(sci(0)).toBe("0");
    expect(sciParts(4.27e24)).toEqual({ mantissa: "4.3", exponent: 24 });
    expect(sup(-12)).toBe("⁻¹²");
  });

  it("recorta enteros e identificadores largos", () => {
    expect(shortNum("23")).toBe("23");
    expect(shortNum("1234567890".repeat(10), 4)).toBe("1234…7890");
    expect(shortId("77991cce63618a8e")).toBe("77991cce…");
    expect(shortId(null)).toBe("");
  });

  it("latencias y plurales", () => {
    expect(fmtMs(4.031)).toBe("4.03 ms");
    expect(fmtMs(null)).toBe("–");
    expect(plural(1, "alerta", "alertas")).toBe("1 alerta");
    expect(plural(3, "alerta", "alertas")).toBe("3 alertas");
  });
});
