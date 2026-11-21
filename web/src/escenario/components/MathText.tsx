/** Texto con exponentes: "4^5 mod 23" se dibuja con el 5 en superíndice. */
import { mathPieces } from "../model/mathText";

export function MathText({ text }: { text: string }) {
  return (
    <span className="mt">
      {mathPieces(text).map((piece, i) => (piece.sup ? <sup key={i}>{piece.text}</sup> : <span key={i}>{piece.text}</span>))}
    </span>
  );
}
