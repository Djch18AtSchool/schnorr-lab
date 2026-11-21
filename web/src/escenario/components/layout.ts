/** Geometría del «mundo» (unidades = px a escala 1), igual que en el boceto E. */
import type { Lane } from "../model/types";

export const LANE_X: Readonly<Record<Lane, number>> = { ana: 470, net: 820, bank: 1230, eve: 1470 };
export const LANE_ORDER: readonly Lane[] = ["ana", "net", "bank", "eve"];
export const PHONE = { x: 40, w: 320, h: 660 } as const;
export const LAPTOP = { w: 470, h: 320 } as const;
export const TERM = { w: 600, gap: 90, top: 56, belowLaptop: 84 } as const;
export const DIAGRAM_W = { base: 1300, eve: 1530 } as const;
export const HEADS_H = 64;
export const PHONE_BOTTOM_GAP = 30;

/** Columna derecha: la terminal del banco sola, o la laptop de Eve encima de ella. */
export function rightColumn(hasEve: boolean): { termX: number; termY: number; lapX: number; lapY: number } {
  const x = (hasEve ? LANE_X.eve : LANE_X.bank) + TERM.gap;
  return {
    termX: x,
    termY: hasEve ? TERM.top + LAPTOP.h + TERM.belowLaptop : TERM.top,
    lapX: x + (TERM.w - LAPTOP.w) / 2,
    lapY: TERM.top,
  };
}

export function midX(from: Lane, to: Lane): number {
  return (LANE_X[from] + LANE_X[to]) / 2;
}

export function isRightward(from: Lane, to: Lane): boolean {
  return LANE_ORDER.indexOf(to) > LANE_ORDER.indexOf(from);
}

export const LANE_COLOR: Readonly<Record<Lane, string>> = {
  ana: "var(--ana)",
  net: "var(--net)",
  bank: "var(--bank)",
  eve: "var(--eve)",
};

export const LANE_INK: Readonly<Record<Lane, string>> = {
  ana: "var(--ana-ink)",
  net: "var(--ink)",
  bank: "var(--bank-ink)",
  eve: "var(--eve-ink)",
};
