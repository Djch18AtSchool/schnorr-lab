/**
 * Pantalla del celular de Ana en cada beat. Es una app bancaria: nada técnico adentro.
 * Inicio → hoja biométrica → «Verificando con el banco…» → cuenta, error o bloqueo.
 * En el registro: crear cuenta → generando clave segura → cuenta creada.
 */
import type { ActRun } from "../../shared/types";
import { anaActs, exchangeOf, isRunFinished, isSignupAct, stepOf } from "./beats";
import { attemptsLeftOf, isPresent, isRegistration, isSuccess, verdictOf } from "./format";
import type { Beat, PhoneView } from "./types";

const LOCKED_RE = /bloquead/i;
const ERROR_TEXT = "No pudimos verificar su identidad. Intente de nuevo.";
const LOCKED_TEXT = "Por seguridad, su cuenta se bloqueó tras varios intentos fallidos.";
const SIGNUP_ERROR_TEXT = "No pudimos crear su cuenta. Intente de nuevo.";

export function involvesAna(run: ActRun, beat: Beat): boolean {
  if (beat.kind === "biometric") return true;
  if (beat.kind === "request" || beat.kind === "server" || beat.kind === "response") {
    return exchangeOf(run, beat)?.origin === "ana";
  }
  const step = stepOf(run, beat);
  return step !== null && step.actor === "ana";
}

const view = (screen: PhoneView["screen"], reason: string | null = null, attemptsLeft: number | null = null): PhoneView => ({
  screen,
  reason,
  attemptsLeft,
});

function signupView(run: ActRun, anaBeats: Beat[]): PhoneView {
  if (!anaBeats.length) return view("signup");
  const answered = anaBeats.filter((b) => b.kind === "response").map((b) => exchangeOf(run, b)).filter(isPresent).filter(isRegistration);
  const last = answered[answered.length - 1];
  if (!last) return view("keygen");
  return isSuccess(last.status) ? view("created") : view("error", SIGNUP_ERROR_TEXT);
}

function loginView(run: ActRun, anaBeats: Beat[], finished: boolean): PhoneView {
  if (!anaBeats.length) return view("login");
  const decided = anaBeats
    .filter((b) => b.kind === "response")
    .map((b) => exchangeOf(run, b))
    .filter(isPresent)
    .filter((ex) => verdictOf(ex) !== null);
  const last = decided[decided.length - 1];
  if (last) {
    const verdict = verdictOf(last);
    if (verdict?.ok) return view("home");
    const attempts = attemptsLeftOf(last);
    const locked = attempts === 0 || LOCKED_RE.test(verdict?.text ?? "");
    return locked ? view("locked", LOCKED_TEXT, 0) : view("error", ERROR_TEXT, attempts);
  }
  if (finished && run.status === "aceptado") return view("home");
  if (finished && (run.status === "rechazado" || run.status === "error")) return view("error", ERROR_TEXT);
  return anaBeats[anaBeats.length - 1].kind === "biometric" ? view("biometric") : view("verifying");
}

export function phoneView(run: ActRun, beats: readonly Beat[], index: number): PhoneView {
  if (!anaActs(run)) return view("rest");
  const anaBeats = beats.slice(0, index + 1).filter((b) => b.ready && involvesAna(run, b));
  if (isSignupAct(run)) return signupView(run, anaBeats);
  const atEnd = beats[index]?.kind === "outcome" || beats[index]?.kind === "summary";
  return loginView(run, anaBeats, atEnd && isRunFinished(run));
}
