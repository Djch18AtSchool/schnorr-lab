import { describe, expect, test } from "vitest";
import { playAct } from "../fixtures/runs";
import { buildBeats } from "./beats";
import { eveOnStage, eveTerminal, EVE_LINES_SHOWN } from "./eveTerminal";

async function linesAt(beatId: string) {
  const { final } = await playAct("espia_respuesta");
  const beats = buildBeats(final);
  return eveTerminal(final, beats, beats.findIndex((b) => b.id === beatId));
}

describe("eveTerminal", () => {
  test("al escuchar, muestra su comando de captura", async () => {
    const lines = await linesAt("s0:attack");

    expect(lines.map((l) => l.kind)).toEqual(["cmd", "out"]);
    expect(lines.every((l) => l.fresh)).toBe(true);
  });

  test("cada mensaje interceptado de Ana llega copiado a la laptop", async () => {
    const request = await linesAt("s2:x0:req");
    const response = await linesAt("s2:x0:res");

    expect(request[request.length - 1]).toMatchObject({ kind: "cap", text: 'POST /zkp/login/commit  {"user_id":"ana","t":"12"}', fresh: true });
    expect(response[response.length - 1].text).toBe('200  {"session_id":"77991cce63618a8e","c":"3"}');
  });

  test("el resultado del ataque aparece solo cuando llega la respuesta", async () => {
    const attack = await linesAt("s6:attack");
    const answer = await linesAt("s6:x0:res");

    expect(attack.some((l) => l.kind === "bad")).toBe(false);
    expect(answer[answer.length - 1]).toMatchObject({ kind: "bad", fresh: true });
    expect(answer.length).toBeLessThanOrEqual(EVE_LINES_SHOWN);
  });

  test("Eve no está en el inicio de sesión", async () => {
    const { final } = await playAct("login");

    expect(eveOnStage(final)).toBe(false);
    expect(eveTerminal(final, buildBeats(final), 5)).toEqual([]);
  });
});
