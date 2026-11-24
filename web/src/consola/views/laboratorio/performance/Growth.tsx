/** Rendimiento: comparación de aritméticas (propia, nativa, gmpy2) y razón medida frente a k³ y k^2.585. */
import { useState } from "react";
import { Seg } from "../../../components/Common";
import { DotPlot, type DotRow } from "../../../components/charts/DotPlot";
import { Legend, type SeriesStyle } from "../../../components/charts/marks";
import type { LatencyResults } from "../../../data/source";
import { latencyGroups, powerTicks, type LatencyGroup } from "../../../lib/charts";
import { meanErrors, ratioRows, speedup, type Backend, type RatioRow } from "../../../lib/labLatency";
import { fmtMsShort, fmtTimes } from "../../../lib/format";
import { DataTable, ExperimentFrame, type ExpContext } from "../Experiment";
import { BACKEND_OPTIONS } from "./LatencyBits";

const BACKEND_SERIES: readonly SeriesStyle[] = [
  { key: "propia", label: "propia (mod_pow en Python)", color: "var(--s1)", shape: "circle" },
  { key: "nativa", label: "nativa (pow de Python, en C)", color: "var(--s2)", shape: "square" },
  { key: "gmpy2", label: "gmpy2 (GMP)", color: "var(--s3)", shape: "diamond" },
];

const MS_DOMAIN: readonly [number, number] = [0.1, 1000];

function backendRows(groups: readonly LatencyGroup[]): DotRow[] {
  return groups.map((g) => ({
    key: g.name, label: `${g.name} (q de ${g.bitsQ} bits)`,
    points: BACKEND_SERIES.flatMap((s) => (g.ms[s.key] == null ? [] : [{
      series: s.key, value: g.ms[s.key], tip: <><b>{g.name}</b><br />{s.label}: {fmtMsShort(g.ms[s.key])}</>,
    }])),
  }));
}

function gmpyGain(g: LatencyGroup): string {
  const v = speedup(g, "propia", "gmpy2");
  return v == null ? "–" : fmtTimes(v);
}

function BackendsConclusion({ groups }: { groups: readonly LatencyGroup[] }) {
  const g = groups.find((x) => x.name === "rfc-2048") ?? groups[groups.length - 1];
  const gmp = speedup(g, "propia", "gmpy2");
  const nat = speedup(g, "propia", "nativa");
  if (!g || gmp == null || nat == null) return <>Mediana por grupo y aritmética.</>;
  return (
    <>
      En {g.name}, gmpy2 es <b>{fmtTimes(gmp)}</b> más rápida que la aritmética propia, pero pow de Python solo <b>{fmtTimes(nat)}</b>: la potencia modular propia
      cuesta casi lo mismo que la nativa porque ambas multiplican con los enteros de Python; GMP gana con mejores algoritmos de multiplicación.
    </>
  );
}

export function LatencyBackends({ ctx, results }: { ctx: ExpContext; results: LatencyResults }) {
  const groups = latencyGroups(results);
  return (
    <ExperimentFrame ctx={ctx} source={`mediana de ${results.rows[0]?.reps ?? "–"} repeticiones, Python ${results.python}`} legend={<Legend items={BACKEND_SERIES} />}
      conclusion={<BackendsConclusion groups={groups} />}
      data={<DataTable head={["Grupo", "propia", "nativa", "gmpy2", "propia / gmpy2"]}
        rows={groups.map((g) => [g.name, ...BACKEND_SERIES.map((s) => (g.ms[s.key] != null ? fmtMsShort(g.ms[s.key]) : "–")), gmpyGain(g)])} />}>
      <DotPlot aria="Latencia por grupo con cada aritmética, escala logarítmica" rows={backendRows(groups)} series={BACKEND_SERIES} connect labelWidth={210}
        x={{ domain: MS_DOMAIN, log: true, ticks: powerTicks(MS_DOMAIN), fmt: (v) => v, title: "ms por inicio de sesión (escala logarítmica)" }} />
    </ExperimentFrame>
  );
}

const RATIO_SERIES: readonly SeriesStyle[] = [
  { key: "medida", label: "Razón medida", color: "var(--s1)", shape: "circle" },
  { key: "k3", label: "Predicha k³", color: "var(--s2)", shape: "square", hollow: true },
  { key: "karatsuba", label: "Predicha k^2.585 (Karatsuba)", color: "var(--s3)", shape: "diamond", hollow: true },
];

function ratioDots(rows: readonly RatioRow[]): DotRow[] {
  return rows.map((r) => ({
    key: r.key, label: r.label,
    points: [
      { series: "k3", value: r.predK3, tip: <><b>{r.label}</b><br />k³ predice ×{r.predK3.toFixed(2)} (error {(r.errK3 * 100).toFixed(0)} %)</> },
      { series: "karatsuba", value: r.predKaratsuba, tip: <><b>{r.label}</b><br />k^2.585 predice ×{r.predKaratsuba.toFixed(2)} (error {(r.errKaratsuba * 100).toFixed(0)} %)</> },
      { series: "medida", value: r.measured, tip: <><b>{r.label}</b><br />medida ×{r.measured.toFixed(2)}</> },
    ],
  }));
}

/** CPython 3.12 (longobject.c): KARATSUBA_CUTOFF = 70 dígitos y el doble para los cuadrados. */
const CPYTHON_NOTE = "Aun así, CPython no usa Karatsuba en este rango: multiplica con el método escolar hasta 70 dígitos de 30 bits (unos 2100 bits) y, en los cuadrados, hasta unos 4200 bits. La razón queda bajo k³ por costos que crecen más despacio, como el trabajo fijo de cada operación.";

/** Qué algoritmo de multiplicación usa cada aritmética, para no atribuirle a Karatsuba lo que no hace. */
const MULTIPLICATION_NOTE: Readonly<Record<Backend, string>> = {
  propia: CPYTHON_NOTE,
  nativa: CPYTHON_NOTE,
  gmpy2: "GMP elige el algoritmo de multiplicación según el tamaño de los números, así que ningún exponente único describe todo el rango.",
};

function RatioConclusion({ rows, backend }: { rows: readonly RatioRow[]; backend: Backend }) {
  const errors = meanErrors(rows);
  if (!errors) return <>No hay pasos con razón en el archivo para esta aritmética.</>;
  const closer = errors.karatsuba <= errors.k3 ? "k^2.585" : "k³";
  const below = rows.filter((r) => r.measured < Math.min(r.predK3, r.predKaratsuba)).map((r) => r.label);
  return (
    <>
      Con la aritmética {backend}, la razón medida se aleja en promedio <b>{(errors.k3 * 100).toFixed(0)} %</b> de k³ y <b>{(errors.karatsuba * 100).toFixed(0)} %</b> de
      k^2.585: queda más cerca de <b>{closer}</b>. {MULTIPLICATION_NOTE[backend]}{below.length ? <> En {below.join(", ")} crece menos que ambas predicciones: pesan los costos fijos y, en Schnorr, q crece menos que p.</> : null}
    </>
  );
}

export function LatencyRatio({ ctx, results }: { ctx: ExpContext; results: LatencyResults }) {
  const [backend, setBackend] = useState<Backend>("propia");
  const rows = ratioRows(results, backend);
  return (
    <ExperimentFrame ctx={ctx} source={`Python ${results.python}`} legend={<Legend items={RATIO_SERIES} />}
      tools={<Seg options={BACKEND_OPTIONS} value={backend} onChange={setBackend} label="Aritmética" />}
      conclusion={<RatioConclusion rows={rows} backend={backend} />}
      method="Razón = tiempo del grupo / tiempo del grupo anterior de la misma familia. Si p pasa de k₀ a k₁ bits, k³ predice (k₁/k₀)³ y Karatsuba (k₁/k₀)^2.585."
      data={<DataTable head={["Paso", "Medida", "k³", "error k³", "k^2.585", "error k^2.585"]}
        rows={rows.map((r) => [r.label, `×${r.measured.toFixed(2)}`, `×${r.predK3.toFixed(2)}`, `${(r.errK3 * 100).toFixed(1)} %`, `×${r.predKaratsuba.toFixed(2)}`, `${(r.errKaratsuba * 100).toFixed(1)} %`])} />}>
      <DotPlot aria="Razón de tiempos medida y predicha en cada aumento de p" rows={ratioDots(rows)} series={RATIO_SERIES} connect labelWidth={250}
        x={{ domain: [0, 9], ticks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], fmt: (v) => `×${v}`, title: "cuántas veces más tarda que el grupo anterior" }} />
    </ExperimentFrame>
  );
}
