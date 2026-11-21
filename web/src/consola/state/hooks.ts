/** Hooks de la interfaz: sección en el hash, tema, reloj y ancho de un elemento. */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { isSection, type Section } from "./sections";

const THEME_KEY = "consola-theme";
const CLOCK_MS = 1000;

function sectionFromHash(): Section {
  const hash = window.location.hash.slice(1);
  return isSection(hash) ? hash : "resumen";
}

export function useHashRoute(): [Section, (section: Section) => void] {
  const [section, setSection] = useState<Section>(sectionFromHash);
  useEffect(() => {
    const onHash = (): void => setSection(sectionFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = useCallback((next: Section) => {
    if (window.location.hash !== `#${next}`) window.history.replaceState(null, "", `#${next}`);
    setSection(next);
  }, []);
  return [section, go];
}

type Theme = "light" | "dark";

function readTheme(): Theme | null {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    return saved === "dark" || saved === "light" ? saved : null;
  } catch {
    return null; // almacenamiento bloqueado: se usa la preferencia del sistema
  }
}

/** Tema claro por defecto; el botón alterna y recuerda la elección (si el navegador lo permite). */
export function useTheme(): () => void {
  useEffect(() => {
    const saved = readTheme();
    if (saved) document.documentElement.dataset.theme = saved;
  }, []);
  return useCallback(() => {
    const root = document.documentElement;
    const current = root.dataset.theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next: Theme = current === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // sin almacenamiento: el tema dura lo que dure la pestaña
    }
  }, []);
}

/** Hora actual en segundos, actualizada cada segundo. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() / 1000), CLOCK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Ancho disponible de un contenedor (las gráficas SVG se dibujan a su medida). */
export function useWidth<T extends HTMLElement>(fallback: number): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export const prefersReducedMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
