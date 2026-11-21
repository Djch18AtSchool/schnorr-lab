import { describe, expect, test } from "vitest";
import { codeRows, commonIndent, highlightPython } from "./code";

describe("highlightPython", () => {
  test("marca palabras clave, cadenas, números, clases, self y llamadas", () => {
    const tokens = highlightPython('if x == 1: return self.f("a")  # nota');

    const byClass = (cls: string) => tokens.filter((t) => t.cls === cls).map((t) => t.text);

    expect(byClass("kw")).toEqual(["if", "return"]);
    expect(byClass("num")).toEqual(["1"]);
    expect(byClass("self")).toEqual(["self"]);
    expect(byClass("fn")).toEqual(["f"]);
    expect(byClass("str")).toEqual(['"a"']);
    expect(byClass("com")).toEqual(["# nota"]);
    expect(tokens.map((t) => t.text).join("")).toBe('if x == 1: return self.f("a")  # nota');
  });

  test("reconoce clases en mayúscula", () => {
    expect(highlightPython("VerifyResult(True)").map((t) => t.cls)).toEqual(["cls", "plain", "kw", "plain"]);
  });
});

describe("codeRows", () => {
  test("recorta la sangría común, marca líneas y dibuja «…» en los saltos", () => {
    const rows = codeRows({
      file: "protocol/bank.py",
      function: "Bank.verify",
      lines: [
        { n: 105, text: "    def verify(self):" },
        { n: 114, text: "        session = 1" },
        { n: 115, text: "        if session is None:" },
      ],
      highlight: [114],
      tone: "bad",
    });

    expect(rows).toEqual([
      { type: "line", n: 105, text: "def verify(self):", mark: "none", tone: "bad" },
      { type: "fold", key: "fold-105" },
      { type: "line", n: 114, text: "    session = 1", mark: "hl", tone: "bad" },
      { type: "line", n: 115, text: "    if session is None:", mark: "none", tone: "bad" },
    ]);
  });

  test("ignora líneas vacías al medir la sangría", () => {
    expect(commonIndent([{ text: "    a" }, { text: "" }, { text: "      b" }])).toBe(4);
    expect(commonIndent([])).toBe(0);
  });
});
