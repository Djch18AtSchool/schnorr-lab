/** Celular de Ana: marco realista y la pantalla que corresponde al beat. */
import { BatteryFull, Signal, Wifi } from "lucide-react";
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
        <Signal strokeWidth={2.5} />
        <Wifi strokeWidth={2.5} />
        <BatteryFull strokeWidth={2} />
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
