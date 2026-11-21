/** Ataques: despejar x de y con baby-step giant-step, medido hasta q de 40 bits y extrapolado. */
import { Sci } from "../../../components/Common";
import { Legend, Pow10Svg, SciSvg, type SeriesStyle } from "../../../components/charts/marks";
import { XYChart, type XYLabel, type XYSeries } from "../../../components/charts/XYChart";
import type { BsgsResults } from "../../../data/source";
import { bsgsSeries } from "../../../lib/charts";
import { fmtInt } from "../../../lib/format";
import { DataTable, ExperimentFrame, type ExpContext } from "../Experiment";

const YEAR_S = 365.25 * 24 * 3600;
const LEGEND: readonly SeriesStyle[] = [
  { key: "m", label: "medido", color: "var(--s1)", shape: "circle" },
  { key: "p", label: "extrapolado", color: "var(--s1)", shape: "circle", hollow: true },
  { key: "f", label: "ajuste 1.5·2^(q/2) operaciones", color: "var(--s1)", line: "dashed" },
];

function chartSeries(results: BsgsResults): { series: XYSeries[]; labels: XYLabel[] } {
  const s = bsgsSeries(results);
  const lastMeasured = s.measured[s.measured.length - 1];
  const series: XYSeries[] = [
    { key: "fit", color: "var(--s1)", points: s.fitSolid },
    { key: "extra", color: "var(--s1)", dash: "5 5", points: s.fitDashed },
    { key: "measured", color: "var(--s1)", shape: "circle", line: false, points: results.rows.map((r) => ({ x: r.q_bits, y: r.seconds, tip: <><b>q de {r.q_bits} bits</b> (medido)<br />{fmtInt(r.operations)} operaciones<br /><Sci value={r.seconds} digits={2} /> s</> })) },
    { key: "pred", color: "var(--s1)", shape: "circle", hollow: true, line: false, points: s.predicted.map((p) => ({ ...p, tip: <><b>q de {p.x} bits</b> (extrapolado)<br /><Sci value={p.y} digits={2} /> s ≈ <Sci value={p.years} /> años</> })) },
  ];
  const labels: XYLabel[] = [
    ...s.predicted.map((p, i) => ({ x: p.x, y: p.y, text: <SciSvg value={p.years} suffix=" años" />, dx: -12, dy: i === 0 ? -10 : 5, anchor: "end" as const, strong: i === 0 })),
    ...(lastMeasured ? [{ x: lastMeasured.x, y: lastMeasured.y, text: `medido hasta q = ${lastMeasured.x}`, dx: 12, dy: 5 }] : []),
  ];
  return { series, labels };
}

export function BsgsExperiment({ ctx, results }: { ctx: ExpContext; results: BsgsResults }) {
  const s = bsgsSeries(results);
  const first = results.predictions[0];
  const { series, labels } = chartSeries(results);
  return (
    <ExperimentFrame ctx={ctx} source="un núcleo de este equipo" legend={<Legend items={LEGEND} />}
      conclusion={<>El tiempo crece como 2<sup>q/2</sup>: el exponente medido es {results.fit.growth_exponent.toFixed(3)} (se esperaba {results.fit.expected_growth_exponent}),
        con <Sci value={s.secondsPerOp} digits={2} /> s por operación.{first ? <> Con q = {first.q_bits} ya harían falta <b><Sci value={first.years} /> años</b>, más que la edad del universo.</> : null}
        {" "}Con q de 224 o 256 bits, robar y no sirve para entrar.</>}
      method={<>Validación: el ajuste hecho sin la medición de q = {results.holdout.q_bits} la predice con un error relativo de {(results.holdout.relative_error * 100).toFixed(0)} %.
        En cada medición, la x encontrada es igual a la real.</>}
      data={<DataTable head={["bits q", "operaciones", "segundos", "Origen"]}
        rows={[...results.rows.map((r) => [r.q_bits, fmtInt(r.operations), <Sci value={r.seconds} digits={2} />, r.x_found === r.x_real ? "medido, x encontrada = x real" : "medido"]),
          ...results.predictions.map((p) => [p.q_bits, <Sci value={p.seconds / s.secondsPerOp} digits={2} />, <Sci value={p.seconds} digits={2} />, <>extrapolado: <Sci value={p.years} /> años</>])]} />}>
      <XYChart aria="Tiempo de BSGS según bits de q, medido y extrapolado" height={330} margin={{ l: 52, r: 22, t: 30, b: 44 }}
        x={{ domain: [0, 270], ticks: [16, 40, 64, 96, 128, 160, 192, 224, 256], fmt: (v) => v, title: "bits de q" }}
        y={{ domain: [1e-5, 1e34], log: true, ticks: [1e-4, 1, 1e4, 1e8, 1e12, 1e16, 1e20, 1e24, 1e28, 1e32], fmt: (v) => <Pow10Svg value={v} />, title: "segundos" }}
        refs={[{ y: YEAR_S, label: "1 año" }, { y: results.universe_age_years * YEAR_S, label: "edad del universo" }]} series={series} labels={labels} />
    </ExperimentFrame>
  );
}
