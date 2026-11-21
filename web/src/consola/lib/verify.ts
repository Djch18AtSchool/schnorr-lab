/**
 * Verificación que hizo el banco, leída de la respuesta (transcript y details) para el inspector:
 * g^s ≡ t·y^c (mod p) y t = g^s·(y^c)^-1. Los enteros llegan como cadenas y se comparan así.
 */
import type { RequestRecord } from "../../shared/types";
import { asRecord } from "./requests";

export interface Verification {
  nizk: boolean;
  t: string;
  c: string;
  s: string;
  y: string | null;
  gs: string;
  tyc: string;
  yc: string;
  ycInv: string;
  tRec: string;
  congruenceOk: boolean;
  recoveryOk: boolean;
}

const field = (record: Record<string, unknown> | null, key: string): string | null => {
  const value = record?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
};

export function verificationOf(r: RequestRecord, y: string | null): Verification | null {
  const body = asRecord(r.response_body);
  const transcript = asRecord(body?.transcript);
  const details = asRecord(body?.details);
  const [t, c, s] = [field(transcript, "t"), field(transcript, "c"), field(transcript, "s")];
  const [gs, tyc] = [field(details, "gs"), field(details, "tyc")];
  if (!t || !c || !s || !gs || !tyc) return null;
  const tRec = field(details, "t_rec") ?? "";
  return {
    nizk: r.path.endsWith("/nizk"), t, c, s, y, gs, tyc,
    yc: field(details, "yc") ?? "", ycInv: field(details, "yc_inv") ?? "", tRec,
    congruenceOk: gs === tyc, recoveryOk: tRec === t,
  };
}

/** Campos del cuerpo enviados al banco (para la nota «solo valores públicos»). */
export function bodyFields(body: unknown): string[] {
  return Object.keys(asRecord(body) ?? {});
}
