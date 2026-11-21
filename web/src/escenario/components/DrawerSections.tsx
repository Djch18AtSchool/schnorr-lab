/** Secciones del drawer «Dirección». */
import { ExternalLink } from "lucide-react";
import type { PhoneConfig } from "../../shared/types";
import type { SourceKind } from "../data/source";
import type { MotionPref } from "../model/motion";
import { SPEEDS, type Prefs } from "../state/prefs";
import { Seg, Switch } from "./Controls";

const CAST_LABEL: Readonly<Record<string, string>> = { ana: "Ana", red: "La red", banco: "Banco", eve: "Eve" };

const MOTION_OPTIONS: ReadonlyArray<{ value: MotionPref; label: string }> = [
  { value: "full", label: "Completas" },
  { value: "reduced", label: "Reducidas" },
  { value: "system", label: "Según el sistema" },
];

const SHORTCUTS: ReadonlyArray<[string[], string]> = [
  [["→", "Espacio"], "Siguiente paso, o reproducir y pausar en automático"],
  [["←"], "Paso anterior"],
  [["R"], "Reiniciar el acto"],
  [["C"], "Seguir al actor o plano general"],
  [["M"], "Mostrar u ocultar matemáticas"],
  [["Esc"], "Volver al paso actual o cerrar este panel"],
  [["D"], "Abrir o cerrar este panel"],
];

export function ActSection({ config, actId, onAct }: { config: PhoneConfig | null; actId: string | null; onAct: (id: string) => void }) {
  return (
    <section>
      <h3>Acto</h3>
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
    </section>
  );
}

type PrefsProps = { prefs: Prefs; onPrefs: (patch: Partial<Prefs>) => void };

export function PlaybackSection({ prefs, onPrefs }: PrefsProps) {
  return (
    <section>
      <h3>Reproducción</h3>
      <div className="drow">
        <span>Modo</span>
        <Seg label="Modo" value={prefs.mode} onChange={(mode) => onPrefs({ mode })} options={[{ value: "step", label: "Paso a paso" }, { value: "auto", label: "Automático" }]} />
      </div>
      <div className="drow">
        <span>Velocidad</span>
        <Seg label="Velocidad" value={prefs.speed} onChange={(speed) => onPrefs({ speed })} options={SPEEDS.map((s) => ({ value: s, label: `${String(s).replace(".", ",")}×` }))} />
      </div>
    </section>
  );
}

export function MotionSection({ prefs, onPrefs }: PrefsProps) {
  return (
    <section>
      <h3>Animaciones</h3>
      <Seg label="Animaciones" value={prefs.motion} onChange={(motion) => onPrefs({ motion })} options={MOTION_OPTIONS} />
      <p className="muted">«Completas» anima igual en cualquier equipo, aunque el sistema pida menos movimiento. «Reducidas» quita los movimientos de cámara y lo que se repite en bucle.</p>
    </section>
  );
}

export function CameraSection({ prefs, onPrefs }: PrefsProps) {
  return (
    <section>
      <h3>Cámara</h3>
      <div className="drow">
        <span>Encuadre</span>
        <Seg label="Encuadre" value={prefs.cam} onChange={(cam) => onPrefs({ cam })} options={[{ value: "follow", label: "Seguir al actor" }, { value: "wide", label: "Plano general" }]} />
      </div>
      <Switch label="Atenuar a quien no actúa" checked={prefs.dim} onChange={(dim) => onPrefs({ dim })} />
      <Switch label="Mostrar matemáticas" checked={prefs.math} onChange={(math) => onPrefs({ math })} />
      <p className="muted">En el diagrama, los pasos anteriores se compactan. Haga clic en uno para revisarlo.</p>
    </section>
  );
}

export function GroupSection({ config, onGroup }: { config: PhoneConfig | null; onGroup: (group: string) => void }) {
  return (
    <section>
      <h3>Grupo</h3>
      <div className="group-list">
        {(config?.groups ?? []).map((g) => (
          <button key={g.id} type="button" className={`act-opt${g.id === config?.group ? " sel" : ""}`} onClick={() => onGroup(g.id)}>
            <span>{g.label}</span>
            <small>{g.bits} bits</small>
          </button>
        ))}
      </div>
      <p className="muted">Cambiar de grupo reinicia el banco y el celular, y vuelve a preparar el acto.</p>
    </section>
  );
}

export function LookSection({ prefs, onPrefs, source, onSource, consoleUrl }: PrefsProps & { source: SourceKind; onSource: (kind: SourceKind) => void; consoleUrl: string | null }) {
  return (
    <>
      <section>
        <h3>Tema</h3>
        <Seg label="Tema" value={prefs.theme} onChange={(theme) => onPrefs({ theme })} options={[{ value: "light", label: "Claro" }, { value: "dark", label: "Oscuro" }, { value: "system", label: "Sistema" }]} />
      </section>
      <section>
        <h3>Fuente de datos</h3>
        <Seg label="Fuente de datos" value={source} onChange={onSource} options={[{ value: "real", label: "Banco en vivo" }, { value: "simulada", label: "Simulación" }]} />
        <div className="links">
          {consoleUrl && <a href={consoleUrl} target="_blank" rel="noreferrer">Consola del banco <ExternalLink /></a>}
        </div>
      </section>
    </>
  );
}

export function ShortcutsSection() {
  return (
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
  );
}
