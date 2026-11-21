import { describe, expect, it } from "vitest";
import { req } from "../test/builders";
import { PAUSE_PX, activitySpans, buildAxis, pauseLabel } from "./timeAxis";
import { inRange, latencyTicks, niceCeil, rangeStart, tickLabel, timeStep, timeTicks } from "./timeline";

describe("línea de tiempo", () => {
  it("el eje x va de la primera petición visible hasta ahora", () => {
    // Arrange: una ráfaga de medio segundo hace 10 s
    const spans = activitySpans([990, 990.5], 1000);
    // Assert
    expect(spans).toHaveLength(1);
    expect(spans?.[0]).toMatchObject({ kind: "activity", end: 1000, count: 2 });
    expect(spans?.[0].start).toBeLessThan(990);
    expect(activitySpans([], 1000)).toBeNull();
  });

  it("comprime las pausas largas, también la que llega hasta ahora", () => {
    const spans = activitySpans([100, 101, 400, 402], 2000) ?? [];
    expect(spans.map((s) => s.kind)).toEqual(["activity", "pause", "activity", "pause"]);
    expect(spans[3].end).toBe(2000);
    expect(pauseLabel(spans[3].end - spans[3].start)).toBe("27 min");
    expect(pauseLabel(45)).toBe("45 s");
  });

  it("cada pausa ocupa un ancho fijo y los puntos de cada tramo quedan en orden dentro de él", () => {
    // Arrange: dos ráfagas separadas por 5 minutos, eje de 0 a 1000 px
    const spans = activitySpans([100, 100.5, 101, 400, 400.2], 401) ?? [];
    // Act
    const axis = buildAxis(spans, [0, 1000]);
    // Assert
    const pause = axis.segments.find((s) => s.kind === "pause");
    expect((pause?.x1 ?? 0) - (pause?.x0 ?? 0)).toBe(PAUSE_PX);
    expect(axis.segments[axis.segments.length - 1].x1).toBeCloseTo(1000);
    const xs = [100, 100.5, 101, 400, 400.2].map(axis.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(xs[2] - xs[0]).toBeGreaterThan(100);
  });

  it("el rango deja fuera lo anterior y «todo» lo incluye", () => {
    const items = [req({ id: 1, timestamp: 100 }), req({ id: 2, timestamp: 950 })];
    expect(inRange(items, "1m", 1000).map((r) => r.id)).toEqual([2]);
    expect(inRange(items, "todo", 1000)).toHaveLength(2);
    expect(rangeStart("5m", 1000)).toBe(700);
    expect(rangeStart("todo", 1000)).toBeNull();
  });

  it("elige un paso redondo y marcas alineadas a él", () => {
    expect(timeStep([0, 60])).toBe(10);
    expect(timeStep([0, 3])).toBe(0.5);
    expect(timeTicks([5, 65])).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it("la latencia usa máximos redondos también por debajo de 1 ms", () => {
    expect(niceCeil(0.37)).toBe(0.5);
    expect(niceCeil(2.2)).toBe(2.5);
    expect(niceCeil(7)).toBe(10);
    expect(niceCeil(0)).toBe(1);
    expect(latencyTicks(2.5)).toEqual([0, 0.625, 1.25, 1.875, 2.5]);
  });

  it("las etiquetas muestran décimas, segundos o minutos según el paso", () => {
    const ts = new Date(2026, 10, 21, 10, 31, 5, 400).getTime() / 1000;
    expect(tickLabel(ts, 0.5)).toBe("10:31:05.4");
    expect(tickLabel(ts, 10)).toBe("10:31:05");
    expect(tickLabel(ts, 120)).toBe("10:31");
  });
});
