import { describe, expect, test } from "vitest";
import { playAct } from "../fixtures/runs";
import { buildBeats } from "./beats";
import { frames } from "./storyboard";

describe("frames", () => {
  test("un cuadro por beat, numerado, con separación entre pasos y flecha en los mensajes", async () => {
    const { final } = await playAct("espia_respuesta");
    const list = frames(final, buildBeats(final));
    const byId = new Map(list.map((f) => [f.id, f]));

    expect(list.map((f) => f.n)).toEqual(list.map((_, i) => i + 1));
    expect(byId.get("s2:x0:req")).toMatchObject({ arrow: { from: "ana", to: "bank" }, gapBefore: true, focus: "net" });
    expect(byId.get("s2:x0:srv")).toMatchObject({ arrow: null, gapBefore: false, focus: "bank" });
    expect(byId.get("s6:x0:res")).toMatchObject({ arrow: { from: "bank", to: "eve" } });
    expect(list[0].gapBefore).toBe(false);
  });
});
