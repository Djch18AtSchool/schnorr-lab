/**
 * Íconos del Escenario: los de Lucide para cada actor y marca del diagrama, y el logotipo de
 * Banco Lab (la única pieza propia, porque es la marca ficticia del banco).
 */
import { CircleDot, Cpu, Laptop, Server, Smartphone, Wifi, type LucideIcon } from "lucide-react";
import type { Lane } from "../model/types";

export const LANE_ICON: Readonly<Record<Lane, LucideIcon>> = {
  ana: Smartphone,
  net: Wifi,
  bank: Server,
  eve: Laptop,
};

/** Marcas de cálculo local: el chip seguro del celular o una captura de Eve. */
export const MARK_ICON: Readonly<Record<"chip" | "rec", LucideIcon>> = {
  chip: Cpu,
  rec: CircleDot,
};

export function BrandMark() {
  return (
    <span className="brand-mark">
      <svg viewBox="0 0 14 14" fill="#fff" aria-hidden="true">
        <rect x="2" y="2" width="10" height="3" rx="1.2" />
        <rect x="2" y="6.5" width="6.5" height="3" rx="1.2" />
        <rect x="2" y="11" width="10" height="1.6" rx=".8" opacity=".6" />
      </svg>
    </span>
  );
}
