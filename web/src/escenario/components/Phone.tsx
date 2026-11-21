/** Celular de Ana: marco realista y la pantalla que corresponde al beat. */
import { useEffect, useState, type RefObject } from "react";
import type { PhoneView } from "../model/types";
import { HomeScreen } from "./HomeScreen";
import { useMotionSettings } from "./motion";
import { attemptsText, LoginScreen, RestScreen, ResultScreen, SignupScreen, VerifyingScreen, type FingerprintState } from "./PhoneScreens";

const FP_SCAN_MS = 1250;

function StatusBar() {
  return (
    <div className="statusbar">
      <span>9:41</span>
      <span>
        <svg viewBox="0 0 18 11" fill="#121826" aria-hidden="true"><rect x="0" y="7" width="3" height="4" rx="1" /><rect x="5" y="5" width="3" height="6" rx="1" /><rect x="10" y="2.5" width="3" height="8.5" rx="1" /><rect x="15" y="0" width="3" height="11" rx="1" /></svg>
        <svg viewBox="0 0 16 11" fill="#121826" aria-hidden="true"><path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.3A10.4 10.4 0 0 0 8 .4 10.4 10.4 0 0 0 .8 3.3L2 4.6a8.6 8.6 0 0 1 6-2.4zm0 3.5c1.4 0 2.6.5 3.6 1.4l1.2-1.3A7 7 0 0 0 8 3.9a7 7 0 0 0-4.8 1.9l1.2 1.3c1-.9 2.2-1.4 3.6-1.4zM8 9.2l1.9-2a2.8 2.8 0 0 0-3.8 0z" /></svg>
        <svg viewBox="0 0 26 12" fill="none" aria-hidden="true"><rect x=".5" y=".5" width="22" height="11" rx="3" stroke="#121826" opacity=".4" /><rect x="2" y="2" width="16" height="8" rx="1.6" fill="#121826" /><path d="M24 4v4c.8-.3 1.3-1 1.3-2s-.5-1.7-1.3-2z" fill="#121826" opacity=".4" /></svg>
      </span>
    </div>
  );
}

/** La huella se lee al llegar a la hoja biométrica y queda reconocida. */
function useFingerprint(screen: PhoneView["screen"]): FingerprintState {
  const { speed, reduced } = useMotionSettings();
  const [state, setState] = useState<FingerprintState>("idle");
  useEffect(() => {
    if (screen !== "biometric") {
      setState("idle");
      return undefined;
    }
    if (reduced) {
      setState("ok");
      return undefined;
    }
    setState("scan");
    const timer = window.setTimeout(() => setState("ok"), FP_SCAN_MS / speed);
    return () => window.clearTimeout(timer);
  }, [screen, speed, reduced]);
  return state;
}

interface PhoneProps {
  view: PhoneView;
  dim: boolean;
  actorRef: RefObject<HTMLDivElement | null>;
}

export function Phone({ view, dim, actorRef }: PhoneProps) {
  const fp = useFingerprint(view.screen);
  const s = view.screen;
  const loginActive = s === "login" || s === "biometric";
  return (
    <div ref={actorRef} className={`actor phone${dim ? " dim" : ""}${s === "rest" ? " resting" : ""}`} aria-label="Celular de Ana">
      <div className="phone-body">
        <div className="phone-screen">
          <div className="island" />
          <StatusBar />
          <RestScreen active={s === "rest"} />
          <SignupScreen active={s === "signup"} />
          <VerifyingScreen active={s === "keygen"} title="Generando su clave segura…" text="Se crea dentro del chip del teléfono y nunca sale de él." />
          <ResultScreen active={s === "created"} tone="ok" title="Cuenta creada" text="Ya puede entrar con su huella, sin contraseña." action="Ir a mi cuenta" />
          <LoginScreen active={loginActive} sheet={s === "biometric"} fp={fp} />
          <VerifyingScreen active={s === "verifying"} title="Verificando con el banco…" text="Esto toma un momento. No cierre la aplicación." />
          <HomeScreen active={s === "home"} />
          <ResultScreen active={s === "error"} tone="bad" title="No pudimos verificar su identidad" text={view.reason ?? ""} extra={attemptsText(view)} action="Intentar de nuevo" />
          <ResultScreen active={s === "locked"} tone="lock" title="Cuenta bloqueada" text={view.reason ?? ""} extra="Contacte a Banco Lab para desbloquearla." action="Llamar a Banco Lab" />
        </div>
      </div>
      <div className="actor-tag"><i style={{ background: "var(--ana)" }} />Celular de Ana</div>
    </div>
  );
}
