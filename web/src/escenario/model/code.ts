/**
 * Código Python de la terminal del banco: resaltado de sintaxis por tokens y líneas con su
 * número real; un salto en la numeración se dibuja como «…».
 */
import type { CodeSpan } from "../../shared/types";

export type PyClass = "plain" | "kw" | "str" | "com" | "num" | "fn" | "cls" | "self";

export interface PyToken {
  text: string;
  cls: PyClass;
}

const PY_RE =
  /("""[\s\S]*?"""|f?"[^"]*"|'[^']*')|(#.*$)|\b(def|return|if|not|is|None|and|or|in|else|elif|raise|True|False|for|with|import|from|class|while|try|except|lambda|pass)\b|\b(self)\b|\b(\d+)\b|\b([A-Z][A-Za-z_]+)\b|(\w+)(?=\()/g;

const GROUP_CLASSES: readonly PyClass[] = ["str", "com", "kw", "self", "num", "cls", "fn"];

export function highlightPython(source: string): PyToken[] {
  const tokens: PyToken[] = [];
  let last = 0;
  for (const match of source.matchAll(PY_RE)) {
    const at = match.index ?? 0;
    if (at > last) tokens.push({ text: source.slice(last, at), cls: "plain" });
    const group = match.slice(1).findIndex((g) => g !== undefined);
    tokens.push({ text: match[0], cls: GROUP_CLASSES[group] ?? "plain" });
    last = at + match[0].length;
  }
  if (last < source.length) tokens.push({ text: source.slice(last), cls: "plain" });
  return tokens;
}

export type CodeRow =
  | { type: "line"; n: number; text: string; mark: "hl" | "none"; tone: "ok" | "bad" }
  | { type: "fold"; key: string };

/** Sangría común que se recorta para que el código entre en la ventana. */
export function commonIndent(lines: readonly { text: string }[]): number {
  const indents = lines.filter((l) => l.text.trim()).map((l) => /^ */.exec(l.text)?.[0].length ?? 0);
  return indents.length ? Math.min(...indents) : 0;
}

export function codeRows(span: CodeSpan): CodeRow[] {
  const indent = commonIndent(span.lines);
  return span.lines.flatMap((line, i): CodeRow[] => {
    const prev = span.lines[i - 1];
    const fold: CodeRow[] = prev && line.n > prev.n + 1 ? [{ type: "fold", key: `fold-${prev.n}` }] : [];
    const mark = span.highlight.includes(line.n) ? "hl" : "none";
    return [...fold, { type: "line", n: line.n, text: line.text.slice(indent), mark, tone: span.tone }];
  });
}
