/** Piezas pequeñas reutilizadas por varias secciones. */
import type { ReactNode } from "react";
import type { Alert } from "../../shared/types";
import { codeSpans, supSpans } from "../lib/alerts";
import { sciParts } from "../lib/format";
import { statusClass, type Outcome } from "../lib/requests";
import { Icon } from "./Icons";

export function ViewHead({ title, children, tools }: { title: string; children: ReactNode; tools?: ReactNode }) {
  return (
    <div className="vhead">
      <div><h1>{title}</h1><p>{children}</p></div>
      {tools ? <div className="tools">{tools}</div> : null}
    </div>
  );
}

export function PanelHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return <div className="ph"><h2>{title}</h2>{children}</div>;
}

export const Method = ({ method }: { method: string }) => <span className={`m ${method}`}>{method}</span>;

export const Status = ({ status }: { status: number }) => <span className={`st ${statusClass(status)}`}>{status}</span>;

export function Result({ outcome, text }: { outcome: Outcome; text: string }) {
  return <span className={`res ${outcome}`} title={text}>{text}</span>;
}

function MathText({ text }: { text: string }) {
  return <>{supSpans(text).map((part, i) => (part.sup ? <sup key={i}>{part.text}</sup> : <span key={i}>{part.text}</span>))}</>;
}

/** Texto plano con `código` y exponentes (g^s) resaltados: así llega el detalle de las alertas. */
export function CodeText({ text }: { text: string }) {
  return <>{codeSpans(text).map((part, i) => (part.code ? <code key={i}>{part.text}</code> : <MathText key={i} text={part.text} />))}</>;
}

/** Número en notación científica con el exponente en <sup> (texto HTML, no SVG). */
export function Sci({ value, digits = 1 }: { value: number; digits?: number }) {
  const { mantissa, exponent } = sciParts(value, digits);
  return exponent === null ? <>{mantissa}</> : <>{mantissa}·10<sup>{exponent}</sup></>;
}

const SEVERITY_NAME: Readonly<Record<Alert["severity"], string>> = { alta: "Alta", media: "Media", baja: "Baja" };

export function Severity({ severity }: { severity: Alert["severity"] }) {
  return (
    <span className={`sev ${severity}`} title={`Severidad ${SEVERITY_NAME[severity]}`}>
      <Icon name={severity} />
      <span className="sr">Severidad {SEVERITY_NAME[severity]}</span>
    </span>
  );
}

/** Aviso de un recurso que no se pudo leer (nunca se reemplaza en silencio por datos inventados). */
export function Unavailable({ what, error }: { what: string; error: string | undefined }) {
  return (
    <div className="unavailable">
      <Icon name="media" />
      <span><b>{what} no disponible.</b> {error ? <span className="mono">{error}</span> : "Cargando…"}</span>
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
      {options.map((o) => <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

export function Fact({ label, value, tone, children }: { label: string; value?: ReactNode; tone?: "ok"; children?: ReactNode }) {
  return (
    <div className="fact">
      <span className="lb">{label}</span>
      {value !== undefined ? <span className={`v ${tone ?? ""}`}>{value}</span> : null}
      {children}
    </div>
  );
}
