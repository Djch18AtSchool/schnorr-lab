import { describe, expect, test } from "vitest";
import { bankEvent, playAct } from "../fixtures/runs";
import { buildBeats } from "./beats";
import { addEvent, addEvents, codeSpanOf, correlationOf, EMPTY_STORE, eventsFor, mathOf } from "./events";

describe("almacén de eventos", () => {
  test("agrupa por correlación, ordena por id y no duplica", () => {
    const a = bankEvent({ id: 2, kind: "acceso" });
    const b = bankEvent({ id: 1, kind: "paso" });

    const store = addEvents(EMPTY_STORE, [a, b, a]);

    expect(store["run:1"].map((e) => e.id)).toEqual([1, 2]);
  });

  test("ignora eventos sin correlación y no muta el almacén anterior", () => {
    const first = addEvent(EMPTY_STORE, bankEvent({ id: 1, kind: "paso" }));

    const same = addEvent(first, bankEvent({ id: 9, kind: "log", correlation_id: null }));
    const second = addEvent(first, bankEvent({ id: 2, kind: "paso" }));

    expect(same).toBe(first);
    expect(first["run:1"]).toHaveLength(1);
    expect(second["run:1"]).toHaveLength(2);
  });
});

describe("eventsFor", () => {
  test("con un solo acceso devuelve todo lo de la correlación", () => {
    const store = addEvents(EMPTY_STORE, [bankEvent({ id: 1, kind: "paso" }), bankEvent({ id: 2, kind: "acceso" })]);

    const found = eventsFor(store, { corr: "run:1", segment: 0 });

    expect(found.access?.id).toBe(2);
    expect(found.mechanism.map((e) => e.id)).toEqual([1]);
  });

  test("si dos mensajes comparten correlación, los separa por su línea de acceso", () => {
    const store = addEvents(EMPTY_STORE, [
      bankEvent({ id: 1, kind: "paso" }),
      bankEvent({ id: 2, kind: "acceso" }),
      bankEvent({ id: 3, kind: "verificacion" }),
      bankEvent({ id: 4, kind: "acceso" }),
      bankEvent({ id: 5, kind: "alerta" }),
    ]);

    const second = eventsFor(store, { corr: "run:1", segment: 1 });

    expect(second.access?.id).toBe(4);
    expect(second.mechanism.map((e) => e.id)).toEqual([3]);
    expect(eventsFor(store, { corr: "run:1", segment: 5 })).toEqual({ access: null, mechanism: [] });
  });
});

describe("correlationOf", () => {
  test("usa la correlación del mensaje y nada en los beats sin mensaje", async () => {
    const { final } = await playAct("login");
    const beats = buildBeats(final);

    expect(correlationOf(final, beats.find((b) => b.id === "s2:x0:srv") ?? beats[0])).toEqual({ corr: "c6ef288ecbe1:3", segment: 0 });
    expect(correlationOf(final, beats[0])).toBeNull();
  });

  test("si el mensaje no trae correlación, cae en la del paso con su orden", async () => {
    const { final } = await playAct("login");
    const steps = final.steps.map((s, i) =>
      i === 2 && s.record ? { ...s, record: { ...s.record, exchanges: s.record.exchanges.map((ex) => ({ ...ex, correlation_id: null })) } } : s,
    );
    const run = { ...final, steps };
    const beat = buildBeats(run).find((b) => b.id === "s2:x0:srv");
    if (!beat) throw new Error("falta el beat");

    expect(correlationOf(run, beat)).toEqual({ corr: "c6ef288ecbe1:3", segment: 0 });
  });
});

describe("lectura segura", () => {
  test("valida el fragmento de código y las matemáticas", () => {
    expect(codeSpanOf({ file: "a.py", function: "f", lines: [{ n: 1, text: "x" }], highlight: [1, "2"], tone: "bad" })).toEqual({
      file: "a.py", function: "f", lines: [{ n: 1, text: "x" }], highlight: [1], tone: "bad",
    });
    expect(codeSpanOf({ lines: [{ n: "1", text: "x" }] })).toBeNull();
    expect(codeSpanOf("nada")).toBeNull();
    expect(mathOf(bankEvent({ id: 1, kind: "paso", data: { math: ["a = 1", 2] } }))).toEqual(["a = 1"]);
  });
});
