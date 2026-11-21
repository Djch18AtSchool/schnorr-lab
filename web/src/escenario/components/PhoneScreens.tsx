/** Pantallas de la app de Banco Lab. Solo lo que vería una clienta: nada técnico. */
import { Check, FingerprintPattern, Lock, X } from "lucide-react";
import type { PhoneView } from "../model/types";
import { BrandMark } from "./icons";

export type FingerprintState = "idle" | "scan" | "ok";

function Brand({ centered = false }: { centered?: boolean }) {
  return (
    <div className="brand" style={centered ? { justifyContent: "center" } : undefined}>
      <BrandMark />
      Banco Lab
    </div>
  );
}

function Fingerprint({ state }: { state: FingerprintState }) {
  return (
    <div className="fp" data-fp={state}>
      <svg className="ring" viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="46" /></svg>
      <FingerprintPattern className="fpi" strokeWidth={1.5} />
      <div className="check">
        <Check color="#fff" strokeWidth={2.6} />
      </div>
    </div>
  );
}

const FP_LABEL: Readonly<Record<FingerprintState, string>> = {
  idle: "Toque el sensor",
  scan: "Leyendo huella…",
  ok: "Huella reconocida",
};

export function LoginScreen({ active, sheet, fp }: { active: boolean; sheet: boolean; fp: FingerprintState }) {
  return (
    <section className={`scr${active ? " active" : ""}`} aria-hidden={!active}>
      <Brand />
      <div className="login-mid">
        <div className="avatar">A</div>
        <h3>Hola, Ana</h3>
        <p>Cuenta de ahorros •••• 4821</p>
      </div>
      <div className="fp-wrap">
        <div className="fp-btn">
          <FingerprintPattern className="fpi-sm" strokeWidth={1.75} />
          Entrar con huella
        </div>
        <div className="fp-alt">Usar código de acceso</div>
      </div>
      <div className={`bio-sheet${sheet ? " up" : ""}`}>
        <div className="grab" />
        <b>Banco Lab</b>
        <span>Confirme que es usted para entrar</span>
        <Fingerprint state={fp} />
        <div className="fp-label">{FP_LABEL[fp]}</div>
        <div className="fp-alt">Cancelar</div>
      </div>
    </section>
  );
}

export function VerifyingScreen({ active, title, text }: { active: boolean; title: string; text: string }) {
  return (
    <section className={`scr${active ? " active" : ""}`} aria-hidden={!active}>
      <Brand centered />
      <div className="verify-mid">
        <div className="spinner" />
        <h4>{title}</h4>
        <p>{text}</p>
      </div>
      <div className="lock-note"><Lock />Su clave nunca sale de este teléfono</div>
    </section>
  );
}

export function RestScreen({ active }: { active: boolean }) {
  return (
    <section className={`scr rest${active ? " active" : ""}`} aria-hidden={!active}>
      <div className="rest-time">9:41</div>
      <div className="rest-date">sábado, 21 de noviembre</div>
      <div className="rest-hint">El celular de Ana no participa en este acto</div>
    </section>
  );
}

export function SignupScreen({ active }: { active: boolean }) {
  return (
    <section className={`scr${active ? " active" : ""}`} aria-hidden={!active}>
      <Brand />
      <div className="signup-mid">
        <h3>Abra su cuenta digital</h3>
        <p>Su teléfono será su llave. No necesitará contraseña.</p>
        <div className="field"><small>Nombre</small>Ana Solano</div>
        <div className="field"><small>Usuario</small>ana</div>
      </div>
      <div className="cta">Crear cuenta</div>
    </section>
  );
}

type ResultTone = "ok" | "bad" | "lock";

const RESULT_ICON = { ok: Check, bad: X, lock: Lock } as const;

function ResultIcon({ tone }: { tone: ResultTone }) {
  const ToneIcon = RESULT_ICON[tone];
  return <ToneIcon strokeWidth={tone === "lock" ? 2 : 2.6} />;
}

export function ResultScreen({ active, tone, title, text, extra, action }: {
  active: boolean;
  tone: ResultTone;
  title: string;
  text: string;
  extra?: string;
  action: string;
}) {
  return (
    <section className={`scr${active ? " active" : ""}`} aria-hidden={!active}>
      <Brand centered />
      <div className={`result-mid ${tone}`}>
        <div className="result-icon">
          <ResultIcon tone={tone} />
        </div>
        <h4>{title}</h4>
        <p>{text}</p>
        {extra && <p className="extra">{extra}</p>}
      </div>
      <div className={`cta${tone === "ok" ? "" : " ghost"}`}>{action}</div>
    </section>
  );
}

export function attemptsText(view: PhoneView): string | undefined {
  if (view.attemptsLeft === null || view.attemptsLeft <= 0) return undefined;
  return view.attemptsLeft === 1 ? "Le queda 1 intento." : `Le quedan ${view.attemptsLeft} intentos.`;
}
