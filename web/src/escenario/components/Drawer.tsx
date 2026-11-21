/** Drawer «Dirección»: acto, reproducción, cámara, grupo, tema, enlaces y atajos. */
import { useEffect, useRef } from "react";
import type { PhoneConfig } from "../../shared/types";
import type { SourceKind } from "../data/source";
import type { Prefs } from "../state/prefs";
import { SPEEDS } from "../state/prefs";
import { Seg, Switch } from "./Controls";
import { CloseIcon } from "./icons";

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

const SHORTCUTS: ReadonlyArray<[string[], string]> = [
  [["→", "Espacio"], "Siguiente paso, o reproducir y pausar en automático"],
  [["←"], "Paso anterior"],
  [["R"], "Reiniciar el acto"],
  [["C"], "Seguir al actor o plano general"],
  [["M"], "Mostrar u ocultar matemáticas"],
  [["Esc"], "Volver al paso actual o cerrar este panel"],
  [["D"], "Abrir o cerrar este panel"],
];

const CAST_LABEL: Readonly<Record<string, string>> = { ana: "Ana", red: "La red", banco: "Banco", eve: "Eve" };

function ActList({ config, actId, onAct }: Pick<DrawerProps, "config" | "actId" | "onAct">) {
  return (
    <div className="acts">
      {(config?.acts ?? []).map((act) => (
        <button key={act.id} type="button" className={`act-opt${act.id === actId ? " sel" : ""}`} disabled={!act.available} onClick={() => onAct(act.id)} title={act.summary}>
          <span>
            {act.title}
            {act.cast.includes("eve") && <span className="eve-dot" title="Aparece Eve" />}
          </span>
          <small>{!act.available ? "no disponible" : act.id === actId ? "en escena" : act.cast.map((c) => CAST_LABEL[c] ?? c).join(" · ")}</small>
        </button>
      ))}
    </div>
  );
}

export function Drawer(props: DrawerProps) {
  const { open, config, actId, prefs, source, onClose, onAct, onGroup, onPrefs, onSource } = props;
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => panel.current?.querySelector<HTMLElement>(".act-opt.sel, button")?.focus({ preventScroll: true }), 50);
    return () => window.clearTimeout(timer);
  }, [open]);
  const groups = config?.groups ?? [];
  return (
    <aside ref={panel} className={`drawer${open ? " open" : ""}`} aria-label="Dirección" aria-hidden={!open} inert={!open}>
      <header>
        <h2>Dirección</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar dirección (D)"><CloseIcon /></button>
      </header>
      <div className="body">
        <section>
          <h3>Acto</h3>
          <ActList config={config} actId={actId} onAct={onAct} />
        </section>
        <section>
          <h3>Reproducción</h3>
          <div className="drow"><span>Modo</span><Seg label="Modo" value={prefs.mode} onChange={(mode) => onPrefs({ mode })} options={[{ value: "step", label: "Paso a paso" }, { value: "auto", label: "Automático" }]} /></div>
          <div className="drow"><span>Velocidad</span><Seg label="Velocidad" value={prefs.speed} onChange={(speed) => onPrefs({ speed })} options={SPEEDS.map((s) => ({ value: s, label: `${String(s).replace(".", ",")}×` }))} /></div>
        </section>
        <section>
          <h3>Cámara</h3>
          <div className="drow"><span>Encuadre</span><Seg label="Encuadre" value={prefs.cam} onChange={(cam) => onPrefs({ cam })} options={[{ value: "follow", label: "Seguir al actor" }, { value: "wide", label: "Plano general" }]} /></div>
          <Switch label="Atenuar a quien no actúa" checked={prefs.dim} onChange={(dim) => onPrefs({ dim })} />
          <Switch label="Mostrar matemáticas" checked={prefs.math} onChange={(math) => onPrefs({ math })} />
          <p className="muted">En el diagrama, los pasos anteriores se compactan. Haga clic en uno para revisarlo.</p>
        </section>
        <section>
          <h3>Grupo</h3>
          <div className="group-list">
            {groups.map((g) => (
              <button key={g.id} type="button" className={`act-opt${g.id === config?.group ? " sel" : ""}`} onClick={() => onGroup(g.id)}>
                <span>{g.label}</span><small>{g.bits} bits</small>
              </button>
            ))}
          </div>
          <p className="muted">Cambiar de grupo reinicia el banco y el celular, y vuelve a preparar el acto.</p>
        </section>
        <section>
          <h3>Tema</h3>
          <Seg label="Tema" value={prefs.theme} onChange={(theme) => onPrefs({ theme })} options={[{ value: "light", label: "Claro" }, { value: "dark", label: "Oscuro" }, { value: "system", label: "Sistema" }]} />
        </section>
        <section>
          <h3>Fuente de datos</h3>
          <Seg label="Fuente de datos" value={source} onChange={onSource} options={[{ value: "real", label: "Banco en vivo" }, { value: "simulada", label: "Simulación" }]} />
          <div className="links">
            {config?.console_url && <a href={config.console_url} target="_blank" rel="noreferrer">Consola del banco ↗</a>}
            <a href="/clasico">Interfaz clásica</a>
          </div>
        </section>
        <section>
          <h3>Atajos</h3>
          <div className="keys">
            {SHORTCUTS.map(([keys, text]) => (
              <div key={text} className="key-row">
                <span>{keys.map((k) => <kbd key={k}>{k}</kbd>)}</span>
                <div>{text}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
