/**
 * Tipos propios del Escenario (derivados del contrato en shared/types.ts).
 * Todo lo que se dibuja sale de funciones puras sobre ActRun + BankEvent[].
 */
import type { Actor, CodeSpan } from "../../shared/types";

/** Carriles del diagrama de secuencia, de izquierda a derecha. */
export type Lane = "ana" | "net" | "bank" | "eve";

/** A quién enfoca la cámara. */
export type Focus = "ana" | "eve" | "bank" | "net" | "wide" | "summary";

export type BeatKind =
  | "intro"
  | "biometric"
  | "compute"
  | "attack"
  | "narration"
  | "request"
  | "server"
  | "response"
  | "outcome"
  | "summary";

/** Un «beat» es una toma de cámara: el presentador avanza de beat en beat. */
export interface Beat {
  id: string;
  kind: BeatKind;
  /** Paso del backend al que pertenece; null en las tomas que agrega el Escenario. */
  stepIndex: number | null;
  exchangeIndex: number | null;
  /** Quién actúa en esta toma. */
  actor: Actor;
  /** true si el paso ya se ejecutó en el backend (hay record). */
  ready: boolean;
  /** Rótulo corto para la tira inferior. */
  short: string;
}

export interface Verdict {
  ok: boolean;
  text: string;
}

export interface KeyValue {
  key: string;
  value: string;
}

export type DiagramRow =
  | {
      type: "msg";
      id: string;
      from: Lane;
      to: Lane;
      /** "GET /zkp/params" o "200" en la respuesta. */
      lead: string;
      label: string;
      short: string;
      body: KeyValue[] | null;
      verdict: Verdict | null;
      tap: boolean;
      copied: boolean;
      tag: string | null;
    }
  | {
      type: "local";
      id: string;
      at: "ana" | "eve";
      icon: "chip" | "rec";
      label: string;
      fact: string;
      short: string;
    }
  | { type: "srv"; id: string; bad: boolean; short: string };

export interface RowView {
  row: DiagramRow;
  dim: boolean;
  now: boolean;
  fresh: boolean;
}

export interface PhaseView {
  n: number;
  stepIndex: number;
  title: string;
  compact: boolean;
  later: boolean;
  rows: RowView[];
}

export interface DiagramView {
  hasEve: boolean;
  phases: PhaseView[];
  showEmpty: boolean;
}

export type LogLevel = "INFO" | "WARN" | "ERROR";
export type TokenClass = "plain" | "src" | "req" | "st" | "ms" | "k" | "ok" | "bad";

export interface LogToken {
  text: string;
  cls: TokenClass;
}

export interface LogLine {
  level: LogLevel;
  tokens: LogToken[];
}

export interface TermEntry {
  key: string;
  origin: Actor;
  lines: LogLine[];
  current: boolean;
  fresh: boolean;
}

export interface BankTerminalView {
  entries: TermEntry[];
  span: CodeSpan | null;
  waiting: boolean;
  showCode: boolean;
}

export type EveLineKind = "cmd" | "out" | "dim" | "ok" | "bad" | "cap";

export interface EveLine {
  key: string;
  kind: EveLineKind;
  text: string;
  fresh: boolean;
}

export type PhoneScreen =
  | "rest"
  | "signup"
  | "keygen"
  | "created"
  | "login"
  | "biometric"
  | "verifying"
  | "home"
  | "error"
  | "locked";

export interface PhoneView {
  screen: PhoneScreen;
  /** Texto del motivo en la pantalla de error (sin nada técnico). */
  reason: string | null;
  attemptsLeft: number | null;
}

export interface MathRow {
  term: string;
  detail: string;
  tone: "plain" | "ok" | "bad";
}

export interface NoteView {
  focus: Focus;
  who: string;
  title: string;
  text: string;
  math: MathRow[];
}
