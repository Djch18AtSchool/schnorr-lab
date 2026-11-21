/**
 * La terminal del banco para una petición, con el formato y los colores de la terminal del
 * Escenario: líneas de log con nivel, la función que la atendió con las líneas resaltadas y los
 * cálculos con los números reales.
 */
import type { CodeSpan } from "../../../shared/types";
import { codeRows, highlightPython } from "../../../escenario/model/code";
import type { LogLine, TerminalView } from "../../lib/terminal";

const TOKEN_CLASS: Readonly<Record<string, string>> = {
  plain: "", src: "lg-src", req: "lg-req", st: "lg-st", ms: "lg-ms", k: "lg-k", ok: "lg-ok", bad: "lg-bad",
};
const LEVEL_CLASS = { INFO: "lv-info", WARN: "lv-warn", ERROR: "lv-err" } as const;

function Line({ line }: { line: LogLine }) {
  return (
    <div className="ln">
      <span className={LEVEL_CLASS[line.level]}>{line.level.padEnd(5, " ")}</span>{" "}
      {line.tokens.map((t, i) => <span key={i} className={TOKEN_CLASS[t.cls] || undefined}>{t.text}</span>)}
    </div>
  );
}

function Code({ span }: { span: CodeSpan }) {
  return (
    <div className="code">
      {codeRows(span).map((row) => row.type === "fold" ? (
        <div key={row.key} className="cl fold"><span className="no">⋮</span><span className="tx">…</span></div>
      ) : (
        <div key={row.n} className={`cl${row.mark === "hl" ? ` hl${row.tone === "bad" ? " bad" : ""}` : ""}`}>
          <span className="no">{row.n}</span>
          <span className="tx">{highlightPython(row.text).map((t, i) => <span key={i} className={t.cls === "plain" ? undefined : `py-${t.cls}`}>{t.text}</span>)}</span>
        </div>
      ))}
    </div>
  );
}

function MathLines({ math }: { math: readonly string[] }) {
  return (
    <div className="term-math">
      {math.map((m, i) => <div key={i} className={m.includes("✘") || m.includes("≠") ? "bad" : m.includes("✔") ? "ok" : undefined}>{m}</div>)}
    </div>
  );
}

export function Terminal({ view, group }: { view: TerminalView; group: string | null }) {
  return (
    <div className="bterm" role="region" aria-label="Terminal del banco">
      <div className="win-bar"><i /><i /><i /><span>banco@srv-01: ~/schnorr-lab</span></div>
      <div className="pane-h"><b>Log de la petición</b><span>{group ? `grupo ${group}` : ""}</span></div>
      <div className="log">{view.lines.map((line, i) => <Line key={i} line={line} />)}</div>
      {view.span ? (
        <>
          <div className="pane-h"><b>{view.span.file}</b><span>{view.span.function}</span></div>
          <Code span={view.span} />
        </>
      ) : null}
      {view.math.length ? (
        <>
          <div className="pane-h"><b>Cálculos del banco</b><span>con los números de esta petición</span></div>
          <MathLines math={view.math} />
        </>
      ) : null}
      {view.trace ? (
        <details className="term-trace">
          <summary>Paso a paso (exponenciación rápida y Euclides extendido)</summary>
          <pre>{view.trace}</pre>
        </details>
      ) : null}
    </div>
  );
}
