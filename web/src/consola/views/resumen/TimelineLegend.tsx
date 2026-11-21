/** Leyenda de la línea de tiempo: forma = dispositivo, color = resultado (el color nunca va solo). */
import { Marker } from "../../components/charts/marks";
import { deviceInfo } from "../../lib/devices";
import type { Tone } from "../../lib/requests";
import { TONE_COLOR } from "./Timeline";

const RESULTS: ReadonlyArray<{ tone: Tone; label: string }> = [
  { tone: "ok", label: "Concedido o creado" },
  { tone: "bad", label: "Rechazado" },
  { tone: "warn", label: "Error" },
  { tone: "neutral", label: "Paso intermedio o consulta" },
];

export function TimelineLegend({ devices }: { devices: readonly string[] }) {
  return (
    <div className="legend">
      {devices.map((device) => {
        const info = deviceInfo(device);
        return <span key={device}><svg width="14" height="14" aria-hidden="true"><Marker shape={info.shape} cx={7} cy={7} color="var(--ink-2)" size={4.5} /></svg>{info.label}</span>;
      })}
      <span className="legend-sep" aria-hidden="true" />
      {RESULTS.map((r) => (
        <span key={r.tone}><svg width="14" height="14" aria-hidden="true"><Marker shape="circle" cx={7} cy={7} color={TONE_COLOR[r.tone]} hollow={r.tone === "neutral"} size={4.5} /></svg>{r.label}</span>
      ))}
    </div>
  );
}
