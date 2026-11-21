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
  if (value === 0) return "0";
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  if (exponent >= -2 && exponent < 4) return String(Number(value.toPrecision(3)));
  const mantissa = value / 10 ** exponent;
  return `${mantissa.toFixed(digits)}·10${sup(exponent)}`;
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function fmtInt(value: number): string {
  return value.toLocaleString("es-CR");
}
