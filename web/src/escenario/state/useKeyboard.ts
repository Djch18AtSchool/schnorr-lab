/** Atajos para presentar: → o Espacio, ←, R, D, C, M y Esc. */
import { useEffect, useRef } from "react";

export interface KeyHandlers {
  next: () => void;
  togglePlay: () => void;
  prev: () => void;
  restart: () => void;
  toggleDrawer: () => void;
  toggleCam: () => void;
  toggleMath: () => void;
  escape: () => void;
}

const TYPING_TAGS = ["input", "textarea", "select"];

/** Traduce una tecla en la acción que corresponde (función pura, para probarla). */
export function actionForKey(key: string): keyof KeyHandlers | null {
  switch (key) {
    case "ArrowRight":
      return "next";
    case " ":
      return "togglePlay";
    case "ArrowLeft":
      return "prev";
    case "r":
    case "R":
      return "restart";
    case "d":
    case "D":
      return "toggleDrawer";
    case "c":
    case "C":
      return "toggleCam";
    case "m":
    case "M":
      return "toggleMath";
    case "Escape":
      return "escape";
    default:
      return null;
  }
}

export function useKeyboard(handlers: KeyHandlers): void {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  }, [handlers]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && TYPING_TAGS.includes(target.tagName.toLowerCase())) return;
      const action = actionForKey(event.key);
      if (!action) return;
      if (action === "togglePlay" && target?.closest("button, [role=button], a")) return;
      if (action === "next" || action === "prev" || action === "togglePlay") event.preventDefault();
      ref.current[action]();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}
