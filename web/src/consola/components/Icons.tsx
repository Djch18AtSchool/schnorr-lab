/** Íconos SVG en línea (sin emojis): un sprite de símbolos y un componente para usarlos. */
import type { CSSProperties } from "react";

const PATHS = {
  resumen: <path d="M2.5 2.5h4.5v5.5H2.5zM9 2.5h4.5v3.5H9zM2.5 10h4.5v3.5H2.5zM9 8h4.5v5.5H9z" />,
  trafico: <path d="M2.5 5.5h10l-2.5-2.5M13.5 10.5h-10l2.5 2.5" />,
  logs: <path d="M2.5 3.5h11M2.5 6.5h7M2.5 9.5h11M2.5 12.5h5" />,
  usuarios: <><circle cx="8" cy="5.5" r="2.5" /><path d="M3 13.5c.8-2.6 2.7-4 5-4s4.2 1.4 5 4" /></>,
  auditoria: <><path d="M5.5 2h5v2h-5z" /><path d="M5 3H3.5v11h9V3H11" /><path d="M5.8 9.2l1.6 1.6 3-3.2" /></>,
  laboratorio: <><path d="M6 2h4M6.5 2v4.5L3 13a.9.9 0 0 0 .8 1.3h8.4A.9.9 0 0 0 13 13L9.5 6.5V2" /><path d="M4.6 10.5h6.8" /></>,
  api: <path d="M5.5 2.5c-1.4 0-2 .7-2 2v1.4c0 1.1-.5 2.1-1.5 2.1 1 0 1.5 1 1.5 2.1v1.4c0 1.3.6 2 2 2M10.5 2.5c1.4 0 2 .7 2 2v1.4c0 1.1.5 2.1 1.5 2.1-1 0-1.5 1-1.5 2.1v1.4c0 1.3-.6 2-2 2" />,
  configuracion: <><path d="M2.5 4.5h7M12.5 4.5h1M2.5 11.5h1M6.5 11.5h7" /><circle cx="11" cy="4.5" r="1.5" /><circle cx="5" cy="11.5" r="1.5" /></>,
  theme: <><circle cx="8" cy="8" r="5.5" /><path d="M8 2.5v11a5.5 5.5 0 0 0 0-11z" fill="currentColor" /></>,
  alta: <><path d="M8 2.5l6 10.5H2z" /><path d="M8 6.8v2.6M8 11.3v.1" /></>,
  media: <><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.4M8 10.8v.1" /></>,
  baja: <><circle cx="8" cy="8" r="5.5" /><path d="M8 7.4v3.6M8 5.2v.1" /></>,
  check: <path d="M3.5 8.5l3 3 6-7" />,
  lock: <><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></>,
  shield: <><path d="M8 2l5 2v4c0 3-2.2 5.2-5 6-2.8-.8-5-3-5-6V4z" /><path d="M5.8 8.2l1.5 1.5 3-3" /></>,
  ext: <path d="M9 2.5h4.5V7M13.5 2.5L7.5 8.5M11.5 9.5v4h-9v-9h4" />,
  pause: <path d="M5.5 3.5v9M10.5 3.5v9" />,
  play: <path d="M5 3.5l7 4.5-7 4.5z" />,
  reset: <path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.8v2.8h2.8" />,
  x: <path d="M4 4l8 8M12 4l-8 8" />,
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  style?: CSSProperties;
  title?: string;
}

export function Icon({ name, style, title }: IconProps) {
  return (
    <svg className="i" viewBox="0 0 16 16" style={style} aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  );
}

export function BrandMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="var(--banco)" />
      <path d="M7 17V7h5.2a2.6 2.6 0 0 1 0 5.2H7m5.2 0h.6a2.4 2.4 0 0 1 0 4.8H7" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
