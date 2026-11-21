import { describe, expect, it } from "vitest";
import { ago, durationParts, fmtBytes, fmtClock, fmtDuration, fmtElapsed, fmtMsShort, fmtTimes, plural, rel, sciParts, shortNum, sup } from "./format";

describe("formateos del laboratorio", () => {
  it("durationParts elige la unidad legible a partir de log10 de años", () => {
    expect(durationParts(-3.284555142117091)).toEqual({ mantissa: "4.6", exponent: null, unit: "h" });
    expect(durationParts(-4.074764231809777)).toEqual({ mantissa: "44", exponent: null, unit: "min" });
    expect(durationParts(-1.5)).toEqual({ mantissa: "12", exponent: null, unit: "días" });
    expect(durationParts(2)).toEqual({ mantissa: "100", exponent: null, unit: "años" });
    expect(durationParts(6.1994376910165165)).toEqual({ mantissa: "1.6", exponent: 6, unit: "años" });
    expect(fmtDuration(294.2)).toBe("1.6·10²⁹⁴ años");
  });

  it("bytes, milisegundos y razones", () => {
    expect(fmtBytes(751)).toBe("751 B");
    expect(fmtBytes(8341)).toBe("8.3 kB");
    expect(fmtMsShort(0.564)).toBe("0.56 ms");
    expect(fmtMsShort(9.09)).toBe("9.1 ms");
    expect(fmtMsShort(153.75)).toBe("154 ms");
    expect(fmtTimes(8.64)).toBe("8.6×");
    expect(fmtTimes(11.1)).toBe("11×");
  });
});

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

  it("notación científica por partes y superíndices", () => {
    expect(sciParts(4.27e24)).toEqual({ mantissa: "4.3", exponent: 24 });
    expect(sup(-12)).toBe("⁻¹²");
  });

  it("recorta enteros largos", () => {
    expect(shortNum("23")).toBe("23");
    expect(shortNum("1234567890".repeat(10), 4)).toBe("1234…7890");
  });

  it("latencias y plurales", () => {
    expect(fmtElapsed(0.88)).toBe("0.88 ms");
    expect(fmtElapsed(4484)).toBe("4.5 s");
    expect(plural(1, "alerta", "alertas")).toBe("1 alerta");
    expect(plural(3, "alerta", "alertas")).toBe("3 alertas");
  });
});
