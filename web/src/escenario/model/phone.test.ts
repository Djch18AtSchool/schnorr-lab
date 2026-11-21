import { describe, expect, test } from "vitest";
import { exchangeFixture, playAct } from "../fixtures/runs";
import { buildBeats } from "./beats";
import { phoneView } from "./phone";

async function screensOf(actId: string): Promise<Record<string, string>> {
  const { final } = await playAct(actId);
  const beats = buildBeats(final);
  return Object.fromEntries(beats.map((b, i) => [b.id, phoneView(final, beats, i).screen]));
}

describe("phoneView", () => {
  test("inicio de sesión: inicio, huella, verificando y cuenta", async () => {
    const screens = await screensOf("login");

    expect(screens.intro).toBe("login");
    expect(screens.bio).toBe("biometric");
    expect(screens["s0:x0:req"]).toBe("verifying");
    expect(screens["s4:x0:srv"]).toBe("verifying");
    expect(screens["s4:x0:res"]).toBe("home");
    expect(screens.summary).toBe("home");
  });

  test("registro: crear cuenta, generando clave y cuenta creada", async () => {
    const screens = await screensOf("registro");

    expect(screens.intro).toBe("signup");
    expect(screens["s0:compute"]).toBe("keygen");
    expect(screens["s1:x0:srv"]).toBe("keygen");
    expect(screens["s1:x0:res"]).toBe("created");
  });

  test("en el espía, Ana entra y su celular no cambia cuando Eve falla", async () => {
    const screens = await screensOf("espia_respuesta");

    expect(screens["s0:attack"]).toBe("login");
    expect(screens["s4:x0:res"]).toBe("home");
    expect(screens["s6:x0:res"]).toBe("home");
  });

  test("si Ana no actúa, su celular queda en reposo", async () => {
    const { final } = await playAct("espia_respuesta");
    const onlyEve = { ...final, steps: final.steps.filter((s) => s.actor === "eve") };
    const beats = buildBeats(onlyEve);

    expect(phoneView(onlyEve, beats, 0).screen).toBe("rest");
  });

  test("un rechazo muestra error con intentos y el último intento, bloqueo", async () => {
    const { final } = await playAct("login");
    const withResponse = (response: unknown) => ({
      ...final,
      status: "rechazado" as const,
      steps: final.steps.map((s, i) =>
        i === 4 && s.record ? { ...s, record: { ...s.record, exchanges: [exchangeFixture({ response_body: response })] } } : s,
      ),
    });
    const rejected = withResponse({ accepted: false, reason: "La congruencia no se cumple", attempts_left: 2 });
    const locked = withResponse({ accepted: false, reason: "Cuenta bloqueada", attempts_left: 0 });
    const last = (run: typeof rejected) => phoneView(run, buildBeats(run), buildBeats(run).length - 1);

    expect(last(rejected)).toMatchObject({ screen: "error", attemptsLeft: 2 });
    expect(last(locked)).toMatchObject({ screen: "locked", attemptsLeft: 0 });
    expect(last(rejected).reason).not.toContain("congruencia");
  });
});
