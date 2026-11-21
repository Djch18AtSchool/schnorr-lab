/** Formateos de horas, latencias, números grandes y notación científica. Funciones puras. */

const pad = (value: number, width = 2): string => String(value).padStart(width, "0");

/** Marca de tiempo en segundos (epoch) → "HH:MM:SS" en la hora local. */
export function fmtClock(ts: number): string {
  const d = new Date(ts * 1000);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function fmtClockMs(ts: number): string {
  const d = new Date(ts * 1000);
  return `${fmtClock(ts)}.${pad(d.getMilliseconds(), 3)}`;
}

export function fmtHM(ts: number): string {
  const d = new Date(ts * 1000);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Tiempo relativo en español: "ahora", "hace 12 s", "hace 3 min", "hace 1 h 5 min". */
export function rel(ts: number, now: number): string {
  const s = Math.max(0, Math.round(now - ts));
  if (s < 5) return "ahora";
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `hace ${m} min` : `hace ${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Diferencia legible entre dos instantes: "40 s antes", "3 min antes". */
export function ago(from: number, to: number): string {
  const sec = Math.max(0, Math.round(to - from));
  return sec < 90 ? `${sec} s antes` : `${Math.round(sec / 60)} min antes`;
}

export function fmtMs(ms: number | null | undefined): string {
  return ms == null || !Number.isFinite(ms) ? "–" : `${ms.toFixed(2)} ms`;
}

/** Recorta enteros grandes (p de 2048 bits) para la tabla: "3231…8719 (617 dígitos)". */
export function shortNum(value: string, keep = 12): string {
  if (value.length <= keep * 2 + 1) return value;
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
}

export function shortId(value: string | null | undefined, keep = 8): string {
  if (!value) return "";
  return value.length > keep ? `${value.slice(0, keep)}…` : value;
}

const SUPERSCRIPTS: Record<string, string> = {
  "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
};

export function sup(value: number | string): string {
  return String(value).split("").map((ch) => SUPERSCRIPTS[ch] ?? ch).join("");
}

/** Notación científica compacta: 1.5·10¹⁰ (o el número tal cual si es pequeño). */
export function sci(value: number, digits = 1): string {
  const parts = sciParts(value, digits);
  return parts.exponent === null ? parts.mantissa : `${parts.mantissa}·10${sup(parts.exponent)}`;
}

/** Mantisa y exponente por separado (para escribir el exponente con <sup> en HTML). */
export function sciParts(value: number, digits = 1): { mantissa: string; exponent: number | null } {
  if (value === 0) return { mantissa: "0", exponent: null };
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  if (exponent >= -2 && exponent < 4) return { mantissa: String(Number(value.toPrecision(3))), exponent: null };
  return { mantissa: (value / 10 ** exponent).toFixed(digits), exponent };
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function fmtInt(value: number): string {
  return value.toLocaleString("es-CR");
}

/** Bytes legibles en base 10: «751 B», «8.3 kB». */
export function fmtBytes(bytes: number): string {
  return bytes < 1000 ? `${Math.round(bytes)} B` : `${(bytes / 1000).toFixed(1)} kB`;
}

/** Milisegundos con las cifras justas, sin unidad: «0.56», «9.1», «154». */
export function fmtMsNumber(ms: number): string {
  if (ms < 1) return ms.toFixed(2);
  return ms < 10 ? ms.toFixed(1) : String(Math.round(ms));
}

/** Milisegundos con las cifras justas: «0.56 ms», «9.1 ms», «154 ms». */
export const fmtMsShort = (ms: number): string => `${fmtMsNumber(ms)} ms`;

/** Duración de un intento: «0.88 ms», «3.0 ms» o, desde un segundo, «4.5 s». */
export const fmtElapsed = (ms: number): string => (ms < 1000 ? fmtMsShort(ms) : `${(ms / 1000).toFixed(1)} s`);

/** Razón «8.6×» con una cifra decimal. */
export const fmtTimes = (ratio: number): string => `${ratio.toFixed(ratio < 10 ? 1 : 0)}×`;

const YEAR_S = 365.25 * 24 * 3600;
const SPANS: ReadonlyArray<readonly [number, string, number]> = [[60, "s", 1], [3600, "min", 60], [48 * 3600, "h", 3600], [YEAR_S, "días", 86400]];
const MAX_PLAIN_YEARS = 1e4;

export interface DurationParts {
  mantissa: string;
  exponent: number | null;
  unit: string;
}

/** Duración dada como log10 de años, en la unidad legible: «4.6 h», «18 días», «1.6·10⁶ años» (por partes). */
export function durationParts(log10Years: number): DurationParts {
  const years = 10 ** log10Years;
  const seconds = years * YEAR_S;
  const span = SPANS.find(([limit]) => seconds < limit);
  if (span) return { mantissa: String(Number((seconds / span[2]).toPrecision(2))), exponent: null, unit: span[1] };
  if (years < MAX_PLAIN_YEARS) return { mantissa: String(Number(years.toPrecision(2))), exponent: null, unit: "años" };
  const exponent = Math.floor(log10Years);
  return { mantissa: (10 ** (log10Years - exponent)).toFixed(1), exponent, unit: "años" };
}

/** Lo mismo como texto plano con exponente Unicode (para tooltips y títulos). */
export function fmtDuration(log10Years: number): string {
  const d = durationParts(log10Years);
  return d.exponent === null ? `${d.mantissa} ${d.unit}` : `${d.mantissa}·10${sup(d.exponent)} ${d.unit}`;
}
