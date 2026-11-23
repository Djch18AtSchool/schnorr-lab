/**
 * Marco común de cada experimento del Laboratorio: la pregunta que responde, la gráfica o tabla,
 * la conclusión y «Ver datos». También el aviso de archivo faltante con el comando que lo genera.
 */
import { CircleAlert, CircleCheck, CircleX, ExternalLink, Lightbulb, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { LabFileState } from "../../data/source";
import type { LabFileInfo } from "../../lib/labFiles";
import type { Tone } from "../../lib/labComparison";
import type { ExperimentMeta } from "./catalog";

/** Lo que todo experimento necesita saber de sí mismo: su ficha, su archivo y la fuente de datos. */
export interface ExpContext {
  meta: ExperimentMeta;
  file: LabFileInfo;
  simulated: boolean;
}

export interface ExperimentText {
  conclusion: ReactNode;
  /** Tabla con los datos que dibuja la gráfica (se abre con «Ver datos»). */
  data?: ReactNode;
  /** Nota de método al abrir «Ver datos» (repeticiones, equipo, advertencias). */
  method?: ReactNode;
}

export function DataTable({ head, rows, numeric = true }: { head: readonly string[]; rows: ReadonlyArray<readonly ReactNode[]>; numeric?: boolean }) {
  const cls = (j: number): string => (numeric && j > 0 ? "r" : "");
  return (
    <div className="tablewrap"><table className="t">
      <thead><tr>{head.map((h, j) => <th key={h} className={cls(j)}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className={`${j > 0 && numeric ? "mono " : ""}${cls(j)}`}>{cell}</td>)}</tr>)}</tbody>
    </table></div>
  );
}

interface FrameProps extends ExperimentText {
  ctx: ExpContext;
  source?: string;
  legend?: ReactNode;
  tools?: ReactNode;
  children: ReactNode;
}

function ExpHeader({ title, question }: { title: string; question: ReactNode }) {
  return (
    <header className="exp-h">
      <h2 id="exp-title">{title}</h2>
      <p className="q">{question}</p>
    </header>
  );
}

function RawLink({ file, simulated }: { file: LabFileInfo; simulated: boolean }) {
  if (simulated) return <span className="muted">Datos simulados: copia empaquetada de <span className="mono">results/{file.file}</span></span>;
  return <a href={`/results/${file.file}`} target="_blank" rel="noopener">Abrir <span className="mono">results/{file.file}</span><ExternalLink className="i" aria-hidden="true" /></a>;
}

export function ExperimentFrame({ ctx, conclusion, data, method, source, legend, tools, children }: FrameProps) {
  const { file, simulated } = ctx;
  return (
    <article className="panel exp" aria-labelledby="exp-title">
      <ExpHeader title={ctx.meta.title} question={ctx.meta.question} />
      {legend || tools ? <div className="exp-tools">{legend}{tools}</div> : null}
      <div className="exp-b">{children}</div>
      <div className="concl"><Lightbulb className="i" aria-hidden="true" /><div><b>Conclusión.</b> {conclusion}</div></div>
      <details className="dt exp-data">
        <summary>Ver datos</summary>
        {method ? <p className="method">{method}</p> : null}
        {data}
        <p className="rawlink"><RawLink file={file} simulated={simulated} />{source ? <span className="muted"> · {source}</span> : null}</p>
      </details>
    </article>
  );
}

/** El archivo del experimento falta o no se pudo leer: se dice cómo generarlo, sin romper la vista. */
export function MissingFile({ ctx, state }: { ctx: ExpContext; state: LabFileState | undefined }) {
  const missing = !state || state.status === "falta";
  const { file } = ctx;
  return (
    <article className="panel exp" aria-labelledby="exp-title">
      <ExpHeader title={ctx.meta.title} question={ctx.meta.question} />
      <div className="missing">
        <CircleAlert className="i" aria-hidden="true" />
        <div>
          <b>{missing ? `Todavía no hay results/${file.file}.` : `results/${file.file} no se pudo leer.`}</b>
          {!missing && state?.detail ? <span className="mono"> {state.detail}</span> : null}
          <p>Genérelo desde la raíz del repositorio y recargue la página:</p>
          <pre className="cmd">{file.command}</pre>
        </div>
      </div>
    </article>
  );
}

/** experimentos.json existe pero no trae el bloque de este experimento (p. ej. sin «impostor»). */
export function ExperimentBlockMissing({ ctx, what }: { ctx: ExpContext; what: string }) {
  return (
    <article className="panel exp" aria-labelledby="exp-title">
      <ExpHeader title={ctx.meta.title} question={ctx.meta.question} />
      <div className="missing">
        <CircleAlert className="i" aria-hidden="true" />
        <div><b>{`results/${ctx.file.file} no trae «${what}».`}</b><p>Vuelva a generarlo desde la raíz del repositorio:</p><pre className="cmd">{ctx.file.command}</pre></div>
      </div>
    </article>
  );
}

const TONE_ICON = { ok: CircleCheck, warn: TriangleAlert, bad: CircleX } as const;

/** Veredicto con ícono y texto (el color nunca va solo). */
export function Verdict({ tone, children }: { tone: Tone; children: ReactNode }) {
  const Icon = TONE_ICON[tone];
  return <span className={`verdict ${tone}`}><Icon className="i" aria-hidden="true" />{children}</span>;
}

/** Cifra grande con su explicación (para los experimentos que se resumen en un conteo). */
export function Tally({ value, of, label, tone = "ok" }: { value: number; of?: number; label: ReactNode; tone?: Tone }) {
  return (
    <div className={`tally ${tone}`}>
      <span className="v">{value.toLocaleString("es-CR")}{of !== undefined ? <small> / {of.toLocaleString("es-CR")}</small> : null}</span>
      <span className="lb">{label}</span>
    </div>
  );
}
