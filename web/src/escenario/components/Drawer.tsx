/** Drawer «Dirección»: acto, reproducción, animaciones, cámara, grupo, tema, fuente, enlaces y atajos. */
import { useEffect, useRef } from "react";
import type { PhoneConfig } from "../../shared/types";
import type { SourceKind } from "../data/source";
import type { Prefs } from "../state/prefs";
import { X } from "lucide-react";
import { ActSection, CameraSection, GroupSection, LookSection, MotionSection, PlaybackSection, ShortcutsSection } from "./DrawerSections";

interface DrawerProps {
  open: boolean;
  config: PhoneConfig | null;
  actId: string | null;
  prefs: Prefs;
  source: SourceKind;
  onClose: () => void;
  onAct: (actId: string) => void;
  onGroup: (group: string) => void;
  onPrefs: (patch: Partial<Prefs>) => void;
  onSource: (kind: SourceKind) => void;
}

const FOCUS_DELAY_MS = 50;

export function Drawer({ open, config, actId, prefs, source, onClose, onAct, onGroup, onPrefs, onSource }: DrawerProps) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => {
      const target = panel.current?.querySelector<HTMLElement>(".act-opt.sel") ?? panel.current?.querySelector<HTMLElement>("button");
      target?.focus({ preventScroll: true });
    }, FOCUS_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [open]);
  return (
    <aside id="drawer" ref={panel} className={`drawer${open ? " open" : ""}`} aria-label="Dirección" aria-hidden={!open} inert={!open}>
      <header>
        <h2>Dirección</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar dirección (D)"><X /></button>
      </header>
      <div className="body">
        <ActSection config={config} actId={actId} onAct={onAct} />
        <PlaybackSection prefs={prefs} onPrefs={onPrefs} />
        <MotionSection prefs={prefs} onPrefs={onPrefs} />
        <CameraSection prefs={prefs} onPrefs={onPrefs} />
        <GroupSection config={config} onGroup={onGroup} />
        <LookSection prefs={prefs} onPrefs={onPrefs} source={source} onSource={onSource} consoleUrl={config?.console_url ?? null} />
        <ShortcutsSection />
      </div>
    </aside>
  );
}
