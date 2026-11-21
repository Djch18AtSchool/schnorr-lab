import { describe, expect, test } from "vitest";
import { mathPieces } from "./mathText";

describe("mathPieces", () => {
  test("sube los exponentes simples y entre paréntesis", () => {
    expect(mathPieces("t = 4^5 mod 23")).toEqual([
      { text: "t = 4", sup: false },
      { text: "5", sup: true },
      { text: " mod 23", sup: false },
    ]);
    expect(mathPieces("(y^c)^−1")).toEqual([
      { text: "(y", sup: false },
      { text: "c", sup: true },
      { text: ")", sup: false },
      { text: "−1", sup: true },
    ]);
    expect(mathPieces("g^(r+c)")).toEqual([{ text: "g", sup: false }, { text: "r+c", sup: true }]);
  });

  test("deja intacto el texto sin exponentes", () => {
    expect(mathPieces("c = 3")).toEqual([{ text: "c = 3", sup: false }]);
    expect(mathPieces("")).toEqual([]);
  });
});
