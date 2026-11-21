/** Íconos SVG en línea (sin emojis): un sprite de símbolos y un componente para usarlos. */

export type IconName = "phone" | "net" | "bank" | "laptop" | "chip" | "check" | "x" | "rec";

export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="i-phone" viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M11 18h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></symbol>
        <symbol id="i-net" viewBox="0 0 24 24"><path d="M5 12.5a10 10 0 0 1 14 0M8 15.5a6 6 0 0 1 8 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="12" cy="18.5" r="1.3" fill="currentColor" /></symbol>
        <symbol id="i-bank" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="7" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.8" /><rect x="4" y="13" width="16" height="7" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="8" cy="7.5" r="1" fill="currentColor" /><circle cx="8" cy="16.5" r="1" fill="currentColor" /></symbol>
        <symbol id="i-laptop" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M3 19h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></symbol>
        <symbol id="i-chip" viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M10 3v3M14 3v3M10 18v3M14 18v3M3 10h3M3 14h3M18 10h3M18 14h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M8 12.5l2.8 2.8L16 9.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-x" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M9 9l6 6M15 9l-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></symbol>
        <symbol id="i-rec" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="3.2" fill="currentColor" /></symbol>
      </defs>
    </svg>
  );
}

interface IconProps {
  name: IconName;
  className?: string;
}

export function Icon({ name, className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

export function SlidersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function BrandMark() {
  return (
    <span className="brand-mark">
      <svg viewBox="0 0 14 14" fill="#fff" aria-hidden="true">
        <rect x="2" y="2" width="10" height="3" rx="1.2" />
        <rect x="2" y="6.5" width="6.5" height="3" rx="1.2" />
        <rect x="2" y="11" width="10" height="1.6" rx=".8" opacity=".6" />
      </svg>
    </span>
  );
}

export function FingerprintIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M12 11.2c0 3.6-.9 6.6-2.4 9.3" />
      <path d="M9 11.4a3 3 0 0 1 6 0c0 3.2-.5 6-1.6 8.6" />
      <path d="M6.3 9.4A6 6 0 0 1 18 11.3c0 1.9-.2 3.7-.6 5.3" />
      <path d="M6 12c0 2.2-.4 3.9-1.2 5.3" />
      <path d="M4.4 7.6A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 8.2 6.6" />
      <path d="M20.4 12.8c0 1-.1 2-.3 3" />
    </svg>
  );
}
