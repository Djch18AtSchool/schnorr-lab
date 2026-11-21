/** Terminal del banco: log de peticiones de cada correlación y la función Python que atendió. */
import { useLayoutEffect, useRef, type RefObject } from "react";
import type { CodeSpan } from "../../shared/types";
import { codeRows, highlightPython } from "../model/code";
import type { BankTerminalView, LogLine, TokenClass } from "../model/types";
import { play, useMotionSettings } from "./motion";

const TOKEN_CLASS: Readonly<Record<TokenClass, string>> = {
  plain: "", src: "lg-src", req: "lg-req", st: "lg-st", ms: "lg-ms", k: "lg-k", ok: "lg-ok", bad: "lg-bad",
};
const LEVEL_CLASS = { INFO: "lv-info", WARN: "lv-warn", ERROR: "lv-err" } as const;
const CODE_STAGGER_MS = 32;

function LogLineView({ line }: { line: LogLine }) {
  return (
    <div className="ln">
      <span className={LEVEL_CLASS[line.level]}>{line.level.padEnd(5, " ")}</span> {line.tokens.map((t, i) => (
        <span key={i} className={TOKEN_CLASS[t.cls] || undefined}>{t.text}</span>
      ))}
    </div>
  );
}

function CodeView({ span, animate }: { span: CodeSpan; animate: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const settings = useMotionSettings();
  const key = `${span.file}:${span.function}:${span.highlight.join(",")}`;
  useLayoutEffect(() => {
    if (!animate || !ref.current) return undefined;
    const lines = [...ref.current.querySelectorAll(".cl")];
    const stops = lines.map((el, j) => play(el, { opacity: [0, 1], transform: ["translateX(-5px)", "none"] }, { ms: 240, delayMs: 380 + j * CODE_STAGGER_MS }, settings));
    return () => stops.forEach((stop) => stop());
  }, [key, animate, settings]);
  return (
    <div className="code" ref={ref}>
      {codeRows(span).map((row) =>
        row.type === "fold" ? (
          <div key={row.key} className="cl fold"><span className="no">⋮</span><span className="tx">…</span></div>
        ) : (
          <div key={row.n} className={`cl${row.mark === "hl" ? ` hl${row.tone === "bad" ? " bad" : ""}` : ""}`}>
            <span className="no">{row.n}</span>
            <span className="tx">{highlightPython(row.text).map((t, i) => (
              <span key={i} className={t.cls === "plain" ? undefined : `py-${t.cls}`}>{t.text}</span>
            ))}</span>
          </div>
        ),
      )}
    </div>
  );
}

export interface TerminalRefs {
  actor: RefObject<HTMLDivElement | null>;
  inner: RefObject<HTMLDivElement | null>;
}

interface BankTerminalProps {
  view: BankTerminalView;
  group: string;
  online: boolean;
  dim: boolean;
  left: number;
  top: number;
  animate: boolean;
  refs: TerminalRefs;
}

export function BankTerminal({ view, group, online, dim, left, top, animate, refs }: BankTerminalProps) {
  const win = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const inner = refs.inner.current;
    if (!inner || !win.current) return undefined;
    const fit = (): void => {
      if (win.current) win.current.style.height = `${inner.offsetHeight}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [refs.inner]);
  return (
    <div ref={refs.actor} className={`actor term${dim ? " dim" : ""}`} style={{ left, top }}>
      <div className="win" ref={win}>
        <div className="win-in" ref={refs.inner}>
          <div className="win-bar">
            <i /><i /><i />
            <span>banco@srv-01: ~/schnorr-lab</span>
            <span className={`live${online ? "" : " off"}`}>uvicorn :8000</span>
          </div>
          <div className="pane-h"><b>Peticiones</b><span>grupo {group}</span></div>
          <div className="log">
            {view.entries.length === 0 && !view.waiting && <div className="code-empty">Esperando peticiones <span className="cursor" /></div>}
            {view.entries.map((entry) => (
              <div key={entry.key} className={`entry${entry.current ? " cur" : ""}${entry.origin === "eve" ? " eve" : ""}${entry.fresh && animate ? " fresh" : ""}`}>
                {entry.lines.map((line, i) => <LogLineView key={i} line={line} />)}
              </div>
            ))}
            {view.waiting && <div className="code-empty">Recibiendo la petición… <span className="cursor" /></div>}
          </div>
          {view.showCode && view.span && (
            <div className="code-wrap">
              <div className="pane-h"><b>{view.span.file}</b><span>{view.span.function}</span></div>
              <CodeView span={view.span} animate={animate} />
            </div>
          )}
        </div>
      </div>
      <div className="actor-tag"><i style={{ background: "var(--bank)" }} />Servidor del banco</div>
    </div>
  );
}
