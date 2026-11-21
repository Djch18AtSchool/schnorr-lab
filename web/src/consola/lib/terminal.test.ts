import { describe, expect, it } from "vitest";
import type { RequestDetail } from "../../shared/types";
import { EVE, event, respond } from "../test/builders";
import { secretCheck, terminalView } from "./terminal";

const SPAN = { file: "protocol/bank.py", function: "Bank._decide", lines: [{ n: 184, text: "        if ok:" }, { n: 187, text: "        return fail" }], highlight: [187], tone: "bad" };

const detail: RequestDetail = {
  request: respond(19, "ana", "813eea3f3ec2364b", "auth.rejected", EVE),
  events: [
    event({ id: 40, kind: "acceso", request_id: 19, data: { method: "POST", path: "/zkp/login/respond", status: 200, duration_ms: 2, client: "x" } }),
    event({ id: 36, kind: "verificacion", title: "Rechazado", request_id: 19, data: {
      logger: "banco.zkp", event: "verify", level: "WARN", user: "ana", s: "7", accepted: "false", span: SPAN,
      math: ["g^s = 4^7 mod 23 = 8", "g^s·(y^c)^-1 = 8·16 mod 23 = 13 ≠ t ✘"], trace: "g^s = 4^7 mod 23:\n    bit 0 = 1",
    } }),
    event({ id: 37, kind: "alerta", title: "Prueba inválida para ana", request_id: 19, data: { severity: "media" } }),
  ],
};

const text = (tokens: ReadonlyArray<{ text: string }>): string => tokens.map((t) => t.text).join("");

describe("terminal del banco para una petición", () => {
  it("empieza con la línea de acceso de la petición, sigue con el log del mecanismo y termina con sus alertas", () => {
    // Act
    const view = terminalView(detail);
    // Assert
    expect(view.lines.map((l) => l.level)).toEqual(["INFO", "WARN", "WARN"]);
    expect(text(view.lines[0].tokens)).toBe('192.168.1.66 - "POST /zkp/login/respond HTTP/1.1" 200  2.00ms');
    expect(text(view.lines[1].tokens)).toBe("banco.zkp  verify user=ana s=7 accepted=false");
    expect(text(view.lines[2].tokens)).toContain('"Prueba inválida para ana"');
  });

  it("trae la función con su tono, los cálculos y el paso a paso", () => {
    const view = terminalView(detail);
    expect(view.span).toMatchObject({ function: "Bank._decide", highlight: [187], tone: "bad" });
    expect(view.math).toHaveLength(2);
    expect(view.trace).toContain("bit 0 = 1");
  });

  it("sin eventos queda solo la línea de acceso", () => {
    const view = terminalView({ ...detail, events: [] });
    expect(view.lines).toHaveLength(1);
    expect(view.span).toBeNull();
    expect(view.trace).toBeNull();
  });

  it("confirma que x no viajó en el cuerpo enviado", () => {
    expect(secretCheck(detail.request)).toEqual({ fields: ["session_id", "s"], safe: true });
    expect(secretCheck({ ...detail.request, request_body: { user_id: "ana", x: "7" } })?.safe).toBe(false);
    expect(secretCheck({ ...detail.request, request_body: null })).toBeNull();
  });
});
