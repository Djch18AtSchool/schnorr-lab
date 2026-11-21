import { describe, expect, it } from "vitest";
import { event } from "../test/builders";
import { countLevels, eventToLogLine, highlight, matchesLog, sourcesOf, type LogLine, type LogQuery } from "./logs";

const ALL: LogQuery = { levels: { DEBUG: true, INFO: true, WARNING: true, ERROR: true }, source: "", text: "" };

describe("eventToLogLine", () => {
  it("escribe un acceso como la línea de uvicorn", () => {
    const line = eventToLogLine(event({ id: 1, kind: "acceso", correlation_id: "c6ef288ecbe1:2",
      data: { method: "POST", path: "/zkp/login/commit", status: 200, duration_ms: 4.031, client: "127.0.0.1:52344" } }));
    expect(line).toMatchObject({ level: "INFO", source: "uvicorn.access" });
    expect(line.msg).toBe('127.0.0.1:52344 - "POST /zkp/login/commit HTTP/1.1" 200  4.03ms  corr=c6ef288ecbe1:2');
  });

  it("marca 4xx como WARNING y 5xx como ERROR", () => {
    const access = (status: number) => eventToLogLine(event({ id: status, kind: "acceso", data: { method: "GET", path: "/x", status, duration_ms: 1, client: "c" } }));
    expect(access(404).level).toBe("WARNING");
    expect(access(500).level).toBe("ERROR");
  });

  it("escribe las decisiones del mecanismo con sus campos y sin la traza", () => {
    const line = eventToLogLine(event({ id: 2, kind: "verificacion", mechanism: "zkp", title: "Rechazado: Sesión inválida",
      data: { accepted: "False", attempts_left: "None", trace: "línea 1\nlínea 2", span: { file: "x" } } }));
    expect(line).toMatchObject({ level: "WARNING", source: "banco.zkp" });
    expect(line.msg).toBe("Rechazado: Sesión inválida  accepted=False attempts_left=None");
  });

  it("respeta el registrador y el nivel declarados en data", () => {
    const line = eventToLogLine(event({ id: 3, kind: "log", title: "body", data: { logger: "banco.audit", level: "DEBUG", valid: true } }));
    expect(line).toMatchObject({ level: "DEBUG", source: "banco.audit", msg: "body  valid=true" });
  });

  it("escribe una alerta como WARNING de banco.alertas", () => {
    const line = eventToLogLine(event({ id: 4, kind: "alerta", title: "Respuesta repetida rechazada", data: { severity: "alta", kind: "replay" } }));
    expect(line).toMatchObject({ level: "WARNING", source: "banco.alertas", msg: "alerta alta replay: Respuesta repetida rechazada" });
  });

  it("recorta valores largos (enteros de 2048 bits)", () => {
    const line = eventToLogLine(event({ id: 5, kind: "paso", mechanism: "zkp", title: "t", data: { t: "9".repeat(600) } }));
    expect(line.msg.length).toBeLessThan(60);
    expect(line.msg).toContain("…");
  });
});

describe("filtros de logs", () => {
  const lines: LogLine[] = [
    { id: 1, ts: 1, level: "DEBUG", source: "banco.audit", msg: "body endpoint=/zkp/register" },
    { id: 2, ts: 2, level: "INFO", source: "uvicorn.access", msg: '"POST /zkp/register HTTP/1.1" 201' },
    { id: 3, ts: 3, level: "WARNING", source: "uvicorn.access", msg: '"POST /zkp/login/commit HTTP/1.1" 422' },
  ];

  it("filtra por nivel, fuente y texto", () => {
    expect(lines.filter((l) => matchesLog(l, { ...ALL, levels: { ...ALL.levels, DEBUG: false } })).map((l) => l.id)).toEqual([2, 3]);
    expect(lines.filter((l) => matchesLog(l, { ...ALL, source: "uvicorn.access" })).map((l) => l.id)).toEqual([2, 3]);
    expect(lines.filter((l) => matchesLog(l, { ...ALL, text: "422" })).map((l) => l.id)).toEqual([3]);
    expect(lines.filter((l) => matchesLog(l, { ...ALL, text: "AUDIT" })).map((l) => l.id)).toEqual([1]);
  });

  it("cuenta por nivel y lista las fuentes", () => {
    expect(countLevels(lines)).toEqual({ DEBUG: 1, INFO: 1, WARNING: 1, ERROR: 0 });
    expect(sourcesOf(lines)).toEqual(["banco.audit", "uvicorn.access"]);
  });

  it("parte el texto para resaltar cada coincidencia", () => {
    expect(highlight("ana y Ana", "ana")).toEqual([{ text: "ana", hit: true }, { text: " y ", hit: false }, { text: "Ana", hit: true }]);
    expect(highlight("sin búsqueda", " ")).toEqual([{ text: "sin búsqueda", hit: false }]);
  });
});
