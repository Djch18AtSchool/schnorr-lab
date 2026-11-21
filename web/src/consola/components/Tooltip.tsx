/** Tooltip flotante compartido por las gráficas: sigue al puntero y no se sale de la ventana. */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";

const OFFSET = 14;
const EDGE = 8;

interface TipApi {
  show: (content: ReactNode, event: MouseEvent) => void;
  move: (event: MouseEvent) => void;
  hide: () => void;
}

const TipContext = createContext<TipApi>({ show: () => undefined, move: () => undefined, hide: () => undefined });

export const useTip = (): TipApi => useContext(TipContext);

/** Props para cualquier elemento SVG/HTML que muestre un tooltip al pasar el puntero. */
export function tipHandlers(tip: TipApi, content: ReactNode) {
  return { onMouseEnter: (e: MouseEvent) => tip.show(content, e), onMouseMove: tip.move, onMouseLeave: tip.hide };
}

export function TipProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode>(null);
  const box = useRef<HTMLDivElement>(null);
  const place = useCallback((event: MouseEvent) => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = event.clientX + OFFSET + r.width > window.innerWidth - EDGE ? event.clientX - r.width - OFFSET : event.clientX + OFFSET;
    const y = event.clientY + OFFSET + r.height > window.innerHeight - EDGE ? event.clientY - r.height - OFFSET : event.clientY + OFFSET;
    el.style.left = `${Math.max(EDGE, x)}px`;
    el.style.top = `${Math.max(EDGE, y)}px`;
  }, []);
  const api = useMemo<TipApi>(() => ({
    show: (next, event) => { setContent(next); place(event); },
    move: place,
    hide: () => setContent(null),
  }), [place]);
  return (
    <TipContext.Provider value={api}>
      {children}
      <div ref={box} className={`tip${content ? " on" : ""}`} role="tooltip">{content}</div>
    </TipContext.Provider>
  );
}

