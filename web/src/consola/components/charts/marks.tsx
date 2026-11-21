/** Marcas compartidas por las gráficas del laboratorio: marcador por forma, leyenda y exponentes en SVG. */
import type { ReactNode } from "react";
import { sciParts } from "../../lib/format";

/** «arrow» apunta a la derecha: marca un valor que se sale del eje. */
export type Shape = "circle" | "square" | "diamond" | "arrow" | "triangle";

export interface SeriesStyle {
  key: string;
  label: string;
  color: string;
  shape?: Shape;
  hollow?: boolean;
  /** Serie dibujada como línea (en la leyenda se muestra un trazo, no un marcador). */
  line?: "solid" | "dashed";
}

interface MarkerProps {
  shape: Shape;
  cx: number;
  cy: number;
  color: string;
  hollow?: boolean;
  size?: number;
}

/** Marcador de al menos 9 px con anillo del color de la superficie (se distingue al superponerse). */
export function Marker({ shape, cx, cy, color, hollow, size = 5.5 }: MarkerProps) {
  const paint = { fill: hollow ? "var(--surface)" : color, stroke: hollow ? color : "var(--surface)", strokeWidth: 2 };
  if (shape === "square") return <rect x={cx - size + 0.5} y={cy - size + 0.5} width={2 * size - 1} height={2 * size - 1} rx={1.5} {...paint} />;
  if (shape === "diamond") return <path d={`M${cx},${cy - size - 1}L${cx + size + 1},${cy}L${cx},${cy + size + 1}L${cx - size - 1},${cy}Z`} {...paint} />;
  if (shape === "triangle") return <path d={`M${cx},${cy - size - 1}L${cx + size + 1},${cy + size}L${cx - size - 1},${cy + size}Z`} {...paint} />;
  if (shape === "arrow") return <path d={`M${cx + size + 2},${cy}L${cx - size},${cy - size - 1}L${cx - size},${cy + size + 1}Z`} {...paint} />;
  return <circle cx={cx} cy={cy} r={size} {...paint} />;
}

function LegendSwatch({ s }: { s: SeriesStyle }) {
  if (s.line) {
    return <svg width="18" height="10" aria-hidden="true"><line x1="1" x2="17" y1="5" y2="5" stroke={s.color} strokeWidth="2" strokeDasharray={s.line === "dashed" ? "4 3" : undefined} /></svg>;
  }
  if (!s.shape) return <i style={{ background: s.color }} />;
  return <svg width="14" height="14" aria-hidden="true"><Marker shape={s.shape} cx={7} cy={7} color={s.color} hollow={s.hollow} size={4.5} /></svg>;
}

/** Leyenda con la misma forma que en la gráfica: la identidad nunca depende solo del color. */
export function Legend({ items }: { items: readonly SeriesStyle[] }) {
  return (
    <div className="legend">
      {items.map((s) => <span key={s.key}><LegendSwatch s={s} />{s.label}</span>)}
    </div>
  );
}

/** Potencia de 10 dentro de un <text> SVG (las fuentes no traen ⁰–⁹ parejos). */
export function Pow10Svg({ value }: { value: number }) {
  const exponent = Math.round(Math.log10(value));
  if (exponent === 0) return <>1</>;
  if (exponent === 1) return <>10</>;
  return <>10<tspan dy={-5} fontSize="0.75em">{exponent}</tspan></>;
}

/** Notación científica dentro de SVG con sufijo: «1.6·10⁶ años». */
export function SciSvg({ value, suffix = "", digits = 1 }: { value: number; suffix?: string; digits?: number }) {
  const { mantissa, exponent } = sciParts(value, digits);
  if (exponent === null) return <>{mantissa}{suffix}</>;
  return <>{mantissa}·10<tspan dy={-5} fontSize="0.75em">{exponent}</tspan><tspan dy={5}>{suffix}</tspan></>;
}

/** Texto con exponente en SVG a partir de partes ya calculadas. */
export function PartsSvg({ mantissa, exponent, unit }: { mantissa: string; exponent: number | null; unit: string }): ReactNode {
  if (exponent === null) return <>{mantissa} {unit}</>;
  return <>{mantissa}·10<tspan dy={-5} fontSize="0.75em">{exponent}</tspan><tspan dy={5}> {unit}</tspan></>;
}
