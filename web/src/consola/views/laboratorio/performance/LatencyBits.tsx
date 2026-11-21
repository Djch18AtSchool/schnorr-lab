/** Rendimiento: latencia de un inicio de sesión según los bits de p, por familia de grupos. */
import { useState, type ReactNode } from "react";
import { Seg } from "../../../components/Common";
import { Legend, type SeriesStyle } from "../../../components/charts/marks";
import { XYChart, type XYLabel, type XYSeries } from "../../../components/charts/XYChart";
import type { LatencyResults } from "../../../data/source";
import { latencyGroups, powerTicks, type LatencyGroup } from "../../../lib/charts";
import { familySeries, FAMILIES, type Backend, type FamilyKey } from "../../../lib/labLatency";
import { fmtMsShort, fmtTimes } from "../../../lib/format";
import { DataTable, ExperimentFrame, type ExpContext } from "../Experiment";

export const BACKEND_OPTIONS: ReadonlyArray<{ value: Backend; label: string }> = [
  { value: "propia", label: "propia (mod_pow)" },
  { value: "nativa", label: "nativa (pow)" },
  { value: "gmpy2", label: "gmpy2" },
];

const FAMILY_STYLE: Readonly<Record<FamilyKey, Omit<SeriesStyle, "key" | "label"> & { short: string; dy: number }>> = {
  seguro: { color: "var(--s1)", shape: "circle", short: "primo seguro", dy: -12 },
  ffdhe: { color: "var(--s2)", shape: "square", hollow: true, short: "ffdhe", dy: 20 },
  schnorr: { color: "var(--s3)", shape: "diamond", short: "Schnorr", dy: -12 },
};

const Y_DOMAIN: readonly [number, number] = [0.1, 1000];
const X_DOMAIN: readonly [number, number] = [220, 3500];

const legendItems = (families: readonly FamilyKey[]): SeriesStyle[] =>
  FAMILIES.filter((f) => families.includes(f.key)).map((f) => ({ key: f.key, label: f.label, ...FAMILY_STYLE[f.key] }));

function tipFor(g: LatencyGroup, backend: Backend): ReactNode {
  return <><b>{g.name}</b> · {backend}<br />{fmtMsShort(g.ms[backend])}<br /><span className="muted">p de {g.bitsP} bits, q de {g.bitsQ} bits, seguridad {g.security}</span></>;
}

function Conclusion({ groups, backend }: { groups: readonly LatencyGroup[]; backend: Backend }) {
  const byName = (name: string): number | undefined => groups.find((g) => g.name === name)?.ms[backend];
  const rfc = byName("rfc-2048");
  const ffdhe = byName("ffdhe-2048");
  const schnorr = groups.find((g) => g.name === "schnorr-2048");
  const rfc3 = byName("rfc-3072");
  if (rfc == null) return <>Mediana de un inicio de sesión completo por grupo.</>;
  return (
    <>
      Con la aritmética {backend}, rfc-2048 tarda <b>{fmtMsShort(rfc)}</b>
      {ffdhe != null ? <> y ffdhe-2048, otro primo seguro de 2048 bits, <b>{fmtMsShort(ffdhe)}</b>: el costo depende del tamaño, no de qué primo se use</> : null}.
      {schnorr?.ms[backend] != null ? <> Un grupo de Schnorr del mismo p baja a <b>{fmtMsShort(schnorr.ms[backend])}</b> ({fmtTimes(rfc / schnorr.ms[backend])} menos) porque los exponentes miden {schnorr.bitsQ} bits y no 2047.</> : null}
      {rfc3 != null ? <> Pasar de 2048 a 3072 bits multiplica el tiempo por {(rfc3 / rfc).toFixed(2)}.</> : null}
    </>
  );
}

export function LatencyBits({ ctx, results }: { ctx: ExpContext; results: LatencyResults }) {
  const [backend, setBackend] = useState<Backend>("propia");
  const groups = latencyGroups(results);
  const families = familySeries(groups, backend);
  const series: XYSeries[] = families.map((f) => ({
    key: f.family, color: FAMILY_STYLE[f.family].color, shape: FAMILY_STYLE[f.family].shape, hollow: FAMILY_STYLE[f.family].hollow,
    dash: f.family === "ffdhe" ? "5 4" : undefined, points: f.points.map((p) => ({ ...p, tip: tipFor(p.group, backend) })),
  }));
  const labels: XYLabel[] = families.map((f) => {
    const last = f.points[f.points.length - 1];
    return { x: last.x, y: last.y, text: FAMILY_STYLE[f.family].short, dx: -12, dy: FAMILY_STYLE[f.family].dy, anchor: "end", strong: true };
  });
  return (
    <ExperimentFrame ctx={ctx} source={`mediana de ${results.rows[0]?.reps ?? "–"} repeticiones, Python ${results.python}`}
      legend={<Legend items={legendItems(families.map((f) => f.family))} />}
      tools={<Seg options={BACKEND_OPTIONS} value={backend} onChange={setBackend} label="Aritmética" />}
      conclusion={<Conclusion groups={groups} backend={backend} />}
      method="Un inicio de sesión completo: generar r, t = gʳ mod p, reto, s = r + c·x mod q y la verificación gˢ ≡ t·yᶜ (mod p). Ambos ejes en escala logarítmica."
      data={<DataTable head={["Grupo", "bits p", "bits q", "Seguridad", "propia", "nativa", "gmpy2"]}
        rows={groups.map((g) => [g.name, g.bitsP, g.bitsQ, g.security, ...BACKEND_OPTIONS.map((b) => (g.ms[b.value] != null ? fmtMsShort(g.ms[b.value]) : "–"))])} />}>
      <XYChart aria={`Latencia de un inicio de sesión según bits de p, aritmética ${backend}`} height={330} margin={{ l: 56, r: 30, t: 30, b: 44 }}
        x={{ domain: X_DOMAIN, log: true, ticks: [256, 512, 1024, 2048, 3072], fmt: (v) => v, title: "bits de p (escala logarítmica)" }}
        y={{ domain: Y_DOMAIN, log: true, ticks: powerTicks(Y_DOMAIN), fmt: (v) => v, title: "ms" }} series={series} labels={labels} />
    </ExperimentFrame>
  );
}
