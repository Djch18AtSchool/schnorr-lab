import { describe, expect, test } from "vitest";
import { cameraMs, CAM_MS, MIN_CAM_MS, motionAttribute, resolveReduced, tempo } from "./motion";

describe("preferencia de animaciones", () => {
  test("«Completas» anima aunque el sistema pida movimiento reducido", () => {
    expect(resolveReduced("full", true)).toBe(false);
    expect(resolveReduced("full", false)).toBe(false);
  });

  test("«Reducidas» reduce siempre y «Según el sistema» obedece al sistema", () => {
    expect(resolveReduced("reduced", false)).toBe(true);
    expect(resolveReduced("system", true)).toBe(true);
    expect(resolveReduced("system", false)).toBe(false);
  });

  test("el atributo del documento nombra el modo en español", () => {
    expect(motionAttribute(false)).toBe("completo");
    expect(motionAttribute(true)).toBe("reducido");
  });
});

describe("tiempos según la velocidad", () => {
  test("el tempo de las animaciones CSS es el inverso de la velocidad", () => {
    expect(tempo(1)).toBe(1);
    expect(tempo(2)).toBe(0.5);
    expect(tempo(0.5)).toBe(2);
  });

  test("la cámara dura lo base a 1×, se alarga a 0,5× y nunca baja del mínimo", () => {
    expect(cameraMs(1, false)).toBe(CAM_MS);
    expect(cameraMs(0.5, false)).toBeGreaterThan(CAM_MS);
    expect(cameraMs(2, false)).toBeGreaterThanOrEqual(MIN_CAM_MS);
    expect(cameraMs(2, false)).toBeLessThan(CAM_MS);
  });

  test("con movimiento reducido la cámara corta sin desplazarse", () => {
    expect(cameraMs(1, true)).toBe(0);
  });
});
