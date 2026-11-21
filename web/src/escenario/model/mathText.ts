/** Convierte la notación de texto del backend ("4^5", "(y^c)^−1") en trozos con exponentes. */

export interface MathPiece {
  text: string;
  sup: boolean;
}

const EXPONENT_RE = /\^(\([^)]*\)|[−-]?\w+)/g;

export function mathPieces(text: string): MathPiece[] {
  const pieces: MathPiece[] = [];
  let last = 0;
  for (const match of text.matchAll(EXPONENT_RE)) {
    const at = match.index ?? 0;
    if (at > last) pieces.push({ text: text.slice(last, at), sup: false });
    const exp = match[1].startsWith("(") && match[1].endsWith(")") ? match[1].slice(1, -1) : match[1];
    pieces.push({ text: exp, sup: true });
    last = at + match[0].length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last), sup: false });
  return pieces;
}
