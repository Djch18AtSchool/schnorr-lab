/** Ataques: el impostor sin x (tasa frente a 1/q) y el simulador (transcripciones reales frente a simuladas). */
import { BarRows } from "../../../components/charts/BarRows";
import { Legend, type SeriesStyle } from "../../../components/charts/marks";
import { XYChart } from "../../../components/charts/XYChart";
import type { ImpostorResults, SimulatorResults } from "../../../data/labTypes";
import { logDomain, powerTicks } from "../../../lib/charts";
import { impostorByQ, impostorConvergence, sameDistribution, simulatorBars, successWithin } from "../../../lib/labExperiments";
import { fmtInt } from "../../../lib/format";
import { DataTable, ExperimentFrame, Verdict, type ExpContext } from "../Experiment";

const IMPOSTOR_LEGEND: readonly SeriesStyle[] = [
  { key: "m", label: "tasa medida", color: "var(--s1)", shape: "circle" },
  { key: "e", label: "1/q (teoría)", color: "var(--s2)", line: "dashed" },
];

const pct = (v: number, digits = 2): string => `${(v * 100).toFixed(digits)} %`;
const CONV_DOMAIN: readonly [number, number] = [8, 25000];

function ConvergenceChart({ imp }: { imp: ImpostorResults }) {
  const points = impostorConvergence(imp).map((p) => ({ ...p, tip: <><b>{fmtInt(p.x)} intentos</b><br />tasa {pct(p.y)} (1/q = {pct(imp.expected)})</> }));
  const yMax = Math.max(0.15, ...points.map((p) => p.y)) * 1.1;
  return (
    <XYChart aria={`Tasa de éxito del impostor según el número de intentos, q = ${imp.q}`} height={290} margin={{ l: 52, r: 20, t: 30, b: 44 }}
      x={{ domain: CONV_DOMAIN, log: true, ticks: [10, 100, 1000, 10000], fmt: fmtInt, title: "intentos (escala logarítmica)" }}
      y={{ domain: [0, yMax], ticks: [0, 0.05, 0.1, 0.15].filter((t) => t <= yMax), fmt: (v) => `${Math.round(v * 100)} %`, title: "tasa de éxito" }}
      refs={[{ y: imp.expected, label: `1/q = 1/${imp.q} ≈ ${pct(imp.expected)}` }]}
      series={[{ key: "rate", color: "var(--s1)", shape: "circle", points }]} />
  );
}

function ByQChart({ imp }: { imp: ImpostorResults }) {
  const { measured, expected } = impostorByQ(imp);
  const xDomain = logDomain(expected.map((p) => p.x));
  const yDomain = logDomain([...measured, ...expected].map((p) => p.y));
  return (
    <XYChart aria="Tasa del impostor frente a 1/q para varios tamaños de q, escala logarítmica" height={290} margin={{ l: 52, r: 20, t: 30, b: 44 }}
      x={{ domain: xDomain, log: true, ticks: powerTicks(xDomain), fmt: fmtInt, title: "q (escala logarítmica)" }}
      y={{ domain: yDomain, log: true, ticks: powerTicks(yDomain), fmt: (v) => `${Number((v * 100).toPrecision(2))} %`, title: "tasa de éxito" }}
      series={[
        { key: "exp", color: "var(--s2)", dash: "5 4", points: expected },
        { key: "rate", color: "var(--s1)", shape: "circle", line: false, points: measured.map((p) => ({ ...p, tip: <><b>{p.label}</b><br />medida {pct(p.y, 3)}<br />1/q = {pct(1 / p.x, 3)}</> })) },
      ]} />
  );
}

export function ImpostorExperiment({ ctx, imp }: { ctx: ExpContext; imp: ImpostorResults }) {
  const last = imp.convergence[imp.convergence.length - 1];
  const largest = [...imp.byQ].sort((a, b) => b.q - a.q)[0];
  return (
    <ExperimentFrame ctx={ctx} source={`${fmtInt(imp.trials)} intentos por tamaño de q`} legend={<Legend items={IMPOSTOR_LEGEND} />}
      conclusion={<>Sin x, el impostor solo acierta si adivina el reto: con q = {imp.q} la tasa converge a <b>{last ? pct(last.rate) : "—"}</b> (1/q = {pct(imp.expected)})
        {largest ? <> y con q = {fmtInt(largest.q)} ya es <b>{pct(largest.rate, 3)}</b></> : null}. Con los {imp.maxAttempts} intentos antes del bloqueo y q = {imp.q} entraría
        {" "}{pct(imp.beforeLockout, 1)} de las veces (teoría {pct(successWithin(imp.q, imp.maxAttempts), 1)}); con q de 224 bits, 2<sup>−224</sup> por intento.</>}
      data={<DataTable head={["p", "q", "bits q", "intentos", "tasa medida", "1/q"]}
        rows={imp.byQ.map((b) => [b.p, b.q, b.qBits, fmtInt(b.trials), pct(b.rate, 3), pct(b.expected, 3)])} />}>
      <div className="two-charts">
        <figure><figcaption>Convergencia con q = {imp.q}</figcaption><ConvergenceChart imp={imp} /></figure>
        <figure><figcaption>Tasa frente a 1/q para {imp.byQ.length} tamaños de q</figcaption><ByQChart imp={imp} /></figure>
      </div>
    </ExperimentFrame>
  );
}

const SIM_SERIES: readonly SeriesStyle[] = [
  { key: "real", label: "Transcripciones reales (con x)", color: "var(--s1)" },
  { key: "simulada", label: "Simuladas (sin x)", color: "var(--s3)" },
];

export function SimulatorExperiment({ ctx, sim }: { ctx: ExpContext; sim: SimulatorResults }) {
  const same = sameDistribution(sim);
  return (
    <ExperimentFrame ctx={ctx} source={`grupo del escrito: q = ${sim.q}, x = ${sim.x}, y = ${sim.y}`} legend={<Legend items={SIM_SERIES} />}
      conclusion={<>Las {sim.real} transcripciones reales y las {sim.simulated} simuladas tienen <b>{same ? "exactamente la misma distribución" : "distribuciones distintas"}</b> por
        compromiso t{sim.allVerify ? ", y todas las simuladas pasan la verificación" : ""}. Como cualquiera puede fabricarlas sin x, una transcripción no enseña nada sobre x:
        eso es el conocimiento cero.{sim.example ? <> Ejemplo simulado: elegir c = {sim.example.c} y s = {sim.example.s}, y despejar t = g<sup>s</sup>·y<sup>−c</sup> mod p = {sim.example.t}.</> : null}</>}
      data={<DataTable head={["t", "reales", "simuladas"]} rows={sim.byT.map((b) => [b.t, b.real, b.simulated])} />}>
      <div className="verdicts">
        {same ? <Verdict tone="ok">Distribuciones idénticas</Verdict> : <Verdict tone="bad">Las distribuciones difieren</Verdict>}
        {sim.allVerify ? <Verdict tone="ok">Todas las simuladas verifican</Verdict> : <Verdict tone="bad">Alguna simulada no verifica</Verdict>}
        <span className="muted">Total: {sim.real} reales, {sim.simulated} simuladas ({sim.identical ? "conjuntos iguales" : "conjuntos distintos"})</span>
      </div>
      <BarRows aria="Transcripciones reales y simuladas por compromiso t" rows={simulatorBars(sim)} series={SIM_SERIES} mode="grouped"
        title="transcripciones con ese t" value={(v) => String(Math.round(v))} labelWidth={90} dense
        note={(row) => `${row.values.real} reales · ${row.values.simulada} simuladas`}
        tip={(row, s) => <><b>{row.label}</b><br />{s.label}: {row.values[s.key]}</>} />
      <p className="cap">Cada uno de los {sim.byT.length} compromisos t = g<sup>r</sup> aparece con los {sim.q} retos posibles: {sim.real} transcripciones válidas, en ambos casos.</p>
    </ExperimentFrame>
  );
}
