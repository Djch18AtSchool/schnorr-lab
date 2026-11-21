/** Piezas pequeñas reutilizadas por varias secciones (con el lenguaje visual del Escenario). */
import { CircleAlert, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { Alert } from "../../shared/types";
import { codeSpans, supSpans } from "../lib/alerts";
import { durationParts, sciParts } from "../lib/format";
import type { Tone } from "../lib/requests";

export function ViewHead({ title, children, tools }: { title: string; children: ReactNode; tools?: ReactNode }) {
  return (
    <header className="vhead">
      <div><h1>{title}</h1><p>{children}</p></div>
      {tools ? <div className="tools">{tools}</div> : null}
    </header>
  );
}

export function PanelHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return <div className="ph"><h2>{title}</h2>{children}</div>;
}

function MathText({ text }: { text: string }) {
  return <>{supSpans(text).map((part, i) => (part.sup ? <sup key={i}>{part.text}</sup> : <span key={i}>{part.text}</span>))}</>;
}

/** Texto plano con `código` y exponentes (g^s) resaltados. */
export function CodeText({ text }: { text: string }) {
  return <>{codeSpans(text).map((part, i) => (part.code ? <code key={i}>{part.text}</code> : <MathText key={i} text={part.text} />))}</>;
}

/** Número en notación científica con el exponente en <sup> (texto HTML, no SVG). */
export function Sci({ value, digits = 1 }: { value: number; digits?: number }) {
  const { mantissa, exponent } = sciParts(value, digits);
  return exponent === null ? <>{mantissa}</> : <>{mantissa}·10<sup>{exponent}</sup></>;
}

/** Duración dada como log10 de años, con el exponente en <sup>: «4.6 h», «1.6·10⁶ años». */
export function Duration({ log10 }: { log10: number }) {
  const { mantissa, exponent, unit } = durationParts(log10);
  return exponent === null ? <>{mantissa} {unit}</> : <>{mantissa}·10<sup>{exponent}</sup> {unit}</>;
}

const SEVERITY_NAME: Readonly<Record<Alert["severity"], string>> = { alta: "Alta", media: "Media", baja: "Baja" };
const SEVERITY_ICON: Readonly<Record<Alert["severity"], LucideIcon>> = { alta: TriangleAlert, media: CircleAlert, baja: Info };

export function Severity({ severity }: { severity: Alert["severity"] }) {
  const SeverityIcon = SEVERITY_ICON[severity];
  return (
    <span className={`sev ${severity}`} title={`Severidad ${SEVERITY_NAME[severity].toLowerCase()}`}>
      <SeverityIcon aria-hidden="true" />
      <span className="sr">Severidad {SEVERITY_NAME[severity].toLowerCase()}</span>
    </span>
  );
}

/** Resultado con su color y un punto (el texto siempre acompaña al color). */
export function Outcome({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`outcome ${tone}`}>{children}</span>;
}

/** Aviso de un recurso que no se pudo leer (nunca se reemplaza en silencio por datos inventados). */
export function Unavailable({ what, error }: { what: string; error: string | undefined }) {
  return (
    <div className="unavailable">
      <CircleAlert aria-hidden="true" />
      <span><b>{what} no disponible.</b> {error ? <span className="mono">{error}</span> : "Cargando…"}</span>
    </div>
  );
}

/** Estado vacío: qué falta y cómo generarlo. */
export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <Icon aria-hidden="true" />
      <b>{title}</b>
      <p>{children}</p>
    </div>
  );
}

interface SegOption<T extends string> {
  value: T;
  label: string;
}

export function Seg<T extends string>({ options, value, onChange, label }: { options: ReadonlyArray<SegOption<T>>; value: T; onChange: (value: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" className={o.value === value ? "sel" : undefined} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}
