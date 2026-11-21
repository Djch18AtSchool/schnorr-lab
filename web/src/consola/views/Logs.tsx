/** Sección Logs: la salida de uvicorn y de los registradores del banco, como en `tail -f`. */
import { Pause, Play } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { BankEvent } from "../../shared/types";
import { ViewHead } from "../components/Common";
import { fmtClock, fmtClockMs } from "../lib/format";
import { LEVELS, countLevels, eventToLogLine, highlight, matchesLog, sourcesOf, type Level, type LogLine, type LogQuery } from "../lib/logs";

const MAX_LOG_LINES = 700;
const BOTTOM_SLACK_PX = 30;

interface LogsProps {
  events: readonly BankEvent[];
  startedAt: number | null;
  searchRef: RefObject<HTMLInputElement | null>;
}

function Line({ line, needle, fresh }: { line: LogLine; needle: string; fresh: boolean }) {
  return (
    <div className={`ll ${line.level}${fresh ? " new" : ""}`}>
      <span className="ts">{fmtClockMs(line.ts)}</span>
      <span className={`lv ${line.level}`}>{line.level.padEnd(7)}</span>
      <span className="src">{line.source}</span>
      <span className="msg">{highlight(line.msg, needle).map((part, i) => (part.hit ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>))}</span>
    </div>
  );
}

function useFollow(tail: RefObject<HTMLDivElement | null>, follow: boolean, lastId: number): void {
  useLayoutEffect(() => {
    if (follow && tail.current) tail.current.scrollTop = tail.current.scrollHeight;
  }, [follow, lastId, tail]);
}

export function Logs({ events, startedAt, searchRef }: LogsProps) {
  const lines = useMemo(() => events.map(eventToLogLine), [events]);
  const [query, setQuery] = useState<LogQuery>({ levels: { DEBUG: false, INFO: true, WARNING: true, ERROR: true }, source: "", text: "" });
  const [follow, setFollow] = useState(true);
  const tail = useRef<HTMLDivElement>(null);
  /** Las líneas que llegan después de abrir la sección se marcan como nuevas (destello breve). */
  const firstId = useRef<number>(lines[lines.length - 1]?.id ?? 0);
  const shown = useMemo(() => lines.filter((l) => matchesLog(l, query)).slice(-MAX_LOG_LINES), [lines, query]);
  const counts = useMemo(() => countLevels(lines), [lines]);
  const sources = useMemo(() => sourcesOf(lines), [lines]);
  useFollow(tail, follow, shown[shown.length - 1]?.id ?? 0);
  const toggleLevel = (level: Level): void => setQuery({ ...query, levels: { ...query.levels, [level]: !query.levels[level] } });
  const onScroll = (): void => {
    const el = tail.current;
    if (el && follow && el.scrollHeight - el.scrollTop - el.clientHeight > BOTTOM_SLACK_PX) setFollow(false);
  };
  return (
    <>
      <ViewHead title="Logs">Salida del proceso uvicorn y de los registradores del banco, como en <span className="mono">tail -f</span>.</ViewHead>
      <div className="panel">
        <div className="logbar">
          <div className="tools">
            {LEVELS.map((level) => (
              <button type="button" key={level} className="chip" aria-pressed={query.levels[level]} onClick={() => toggleLevel(level)}>
                <span className={`lv ${level}`}>{level}</span><span className="n">{counts[level]}</span>
              </button>
            ))}
          </div>
          <select className="field" aria-label="Fuente" value={query.source} onChange={(e) => setQuery({ ...query, source: e.target.value })}>
            <option value="">Todas las fuentes</option>
            {sources.map((s) => <option key={s}>{s}</option>)}
          </select>
          <input ref={searchRef} className="field" type="search" placeholder="Filtrar texto (ana, 422, corr=…)" aria-label="Filtrar logs"
            value={query.text} onChange={(e) => setQuery({ ...query, text: e.target.value })} />
          <span className="spacer" />
          <button type="button" className="btn" aria-pressed={follow} onClick={() => setFollow(!follow)}>
            {follow ? <Pause className="i" aria-hidden="true" /> : <Play className="i" aria-hidden="true" />}<span>{follow ? "Pausar seguimiento" : "Seguir al final"}</span>
          </button>
        </div>
        <div className="tail" ref={tail} role="log" aria-live="off" onScroll={onScroll}>
          {shown.map((l) => <Line key={l.id} line={l} needle={query.text} fresh={l.id > firstId.current} />)}
          {shown.length ? null : <div className="ll"><span /><span /><span /><span className="msg faint">Ninguna línea coincide con los filtros.</span></div>}
        </div>
        <div className="tailfoot">
          <span>{lines.length} líneas{startedAt ? ` desde el arranque (${fmtClock(startedAt)})` : ""}</span>
          <span>uvicorn --host 0.0.0.0 --port 8000 · eventos de /events/stream</span>
        </div>
      </div>
    </>
  );
}
