import { describe, expect, test } from "vitest";
import { bankEvent, playAct } from "../fixtures/runs";
import { accessLine, bankTerminal, LOG_ENTRIES_SHOWN, mechanismLevel, mechanismLine, serverSummary } from "./bankTerminal";
import { buildBeats } from "./beats";
import { EMPTY_STORE } from "./events";
import type { LogLine } from "./types";

const text = (line: LogLine | null): string => (line ? `${line.level}  ${line.tokens.map((t) => t.text).join("")}` : "");

describe("formato de líneas", () => {
  test("la línea de acceso imita a uvicorn", () => {
    const event = bankEvent({
      id: 1, kind: "acceso",
      data: { method: "POST", path: "/zkp/login/commit", status: 200, duration_ms: 4.03, client: "192.168.1.23:52344", user_agent: "x", device: "celular de Ana" },
    });

    expect(text(accessLine(event))).toBe('INFO  192.168.1.23:52344 - "POST /zkp/login/commit HTTP/1.1" 200  4.03ms');
  });

  test("un 4xx sale como WARN y un 5xx como ERROR", () => {
    const make = (status: number) => bankEvent({ id: 1, kind: "acceso", data: { method: "GET", path: "/x", status, duration_ms: 1 } });

    expect(accessLine(make(423))?.level).toBe("WARN");
    expect(accessLine(make(500))?.level).toBe("ERROR");
  });

  test("descarta accesos sin los campos mínimos", () => {
    expect(accessLine(bankEvent({ id: 1, kind: "acceso", data: { method: "GET" } }))).toBeNull();
  });

  test("la línea del mecanismo lista campos estructurados y acorta valores largos", () => {
    const event = bankEvent({
      id: 2, kind: "paso",
      data: { logger: "banco.zkp", event: "challenge", user: "ana", t: "12", c: "3", session: "77991cce63618a8e", span: { lines: [] }, math: ["x"] },
    });

    expect(text(mechanismLine(event))).toBe("INFO  banco.zkp  challenge user=ana t=12 c=3 session=77991cce…");
  });

  test("entrecomilla valores con espacios y usa el tipo de evento si falta event", () => {
    const event = bankEvent({ id: 3, kind: "verificacion", mechanism: "zkp", data: { reason: "Sesión inválida", accepted: false } });

    const line = mechanismLine(event);

    expect(text(line)).toBe('INFO  banco.zkp  verificacion reason="Sesión inválida" accepted=false');
    expect(line.tokens.find((t) => t.text === "false")?.cls).toBe("bad");
  });

  test("el nivel sale de level, del tipo error, de la señal o del tono del código", () => {
    expect(mechanismLevel(bankEvent({ id: 1, kind: "paso", data: { level: "error" } }))).toBe("ERROR");
    expect(mechanismLevel(bankEvent({ id: 1, kind: "error" }))).toBe("WARN");
    expect(mechanismLevel(bankEvent({ id: 1, kind: "paso", data: { signal: "auth.replay" } }))).toBe("WARN");
    expect(mechanismLevel(bankEvent({ id: 1, kind: "paso", data: { span: { lines: [], tone: "bad" } } }))).toBe("WARN");
    expect(mechanismLevel(bankEvent({ id: 1, kind: "paso" }))).toBe("INFO");
  });
});

describe("bankTerminal", () => {
  test("mientras el mensaje viaja, la terminal todavía no lo muestra", async () => {
    const { final, store } = await playAct("login");
    const beats = buildBeats(final);

    const view = bankTerminal(final, beats, beats.findIndex((b) => b.id === "s0:x0:req"), store, false);

    expect(view.entries).toEqual([]);
    expect(view.showCode).toBe(false);
  });

  test("en el beat del servidor muestra el acceso, los eventos y la función con su línea", async () => {
    const { final, store } = await playAct("login");
    const beats = buildBeats(final);

    const view = bankTerminal(final, beats, beats.findIndex((b) => b.id === "s2:x0:srv"), store, false);
    const last = view.entries[view.entries.length - 1];

    expect(last).toMatchObject({ key: "s2:x0:srv", current: true, fresh: true, origin: "ana" });
    expect(text(last.lines[0])).toContain('"POST /zkp/login/commit HTTP/1.1" 200');
    expect(last.lines).toHaveLength(3);
    expect(view.span?.function).toBe("Bank.challenge");
    expect(view.showCode).toBe(true);
  });

  test("espera los eventos que no llegaron y el plano general oculta el código", async () => {
    const { final, store } = await playAct("login");
    const beats = buildBeats(final);
    const srv = beats.findIndex((b) => b.id === "s2:x0:srv");

    expect(bankTerminal(final, beats, srv, EMPTY_STORE, false).waiting).toBe(true);
    expect(bankTerminal(final, beats, srv, store, true).showCode).toBe(false);
  });

  test("conserva solo las últimas peticiones", async () => {
    const { final, store } = await playAct("login");
    const beats = buildBeats(final);

    const view = bankTerminal(final, beats, beats.length - 1, store, true);

    expect(view.entries).toHaveLength(LOG_ENTRIES_SHOWN);
    expect(view.entries.every((e) => !e.current)).toBe(true);
  });

  test("el rechazo de Eve se registra como WARN y su origen es Eve", async () => {
    const { final, store } = await playAct("espia_respuesta");
    const beats = buildBeats(final);
    const srv = beats.findIndex((b) => b.id === "s6:x0:srv");

    const view = bankTerminal(final, beats, srv, store, false);
    const last = view.entries[view.entries.length - 1];

    expect(last.origin).toBe("eve");
    expect(last.lines.map((l) => l.level)).toEqual(["INFO", "WARN"]);
    expect(view.span?.tone).toBe("bad");
  });
});

describe("serverSummary", () => {
  test("reúne títulos y matemáticas del banco para la tarjeta", async () => {
    const { final, store } = await playAct("login");
    const beat = buildBeats(final).find((b) => b.id === "s4:x0:srv");
    if (!beat) throw new Error("falta el beat");

    const summary = serverSummary(final, beat, store);

    expect(summary.titles[1]).toContain("acceso concedido");
    expect(summary.math[0]).toBe("g^s = 4^4 mod 23 = 3");
    expect(summary.bad).toBe(false);
  });
});
