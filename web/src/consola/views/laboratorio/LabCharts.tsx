/** Gráficas del laboratorio en escala logarítmica: latencia según p y despeje de x con BSGS. */
import type { ReactNode } from "react";
import { PanelHead, Sci } from "../../components/Common";
import { XYChart, type Shape, type XYLabel, type XYSeries } from "../../components/charts/XYChart";
import type { BsgsResults, LatencyResults } from "../../data/source";
import { BACKENDS, bsgsSeries, latencyGroups, latencySeries, type LatencyGroup } from "../../lib/charts";
import { fmtInt, sci } from "../../lib/format";

const STYLE: Readonly<Record<string, { color: string; shape: Shape; label: string; dy: number }>> = {
  propia: { color: "var(--s1)", shape: "circle", label: "propia (mod_pow)", dy: -2 },
  nativa: { color: "var(--s2)", shape: "square", label: "nativa (pow)", dy: 12 },
  gmpy2: { color: "var(--s3)", shape: "diamond", label: "gmpy2", dy: 4 },
};
const YEAR_S = 365.25 * 24 * 3600;
const Pow10 = ({ v }: { v: number }) => (v === 1 ? <>1</> : <>10<tspan dy={-5} fontSize={8.5}>{Math.round(Math.log10(v))}</tspan></>);

function tipFor(g: LatencyGroup, backend: string): ReactNode {
  return <><b>{g.name}</b> · {STYLE[backend].label}<br />{g.ms[backend].toFixed(2)} ms<br /><span className="muted">q de {g.bitsQ} bits, seguridad {g.security}</span></>;
}

function DataTable({ head, rows }: { head: readonly string[]; rows: ReadonlyArray<readonly ReactNode[]> }) {
  return (
    <details className="dt"><summary>Ver tabla de datos</summary>
      <div className="tablewrap"><table className="t">
        <thead><tr>{head.map((h, i) => <th key={h} className={i > 0 && i < head.length ? "r" : ""}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className={`mono${j > 0 ? " r" : ""}`}>{cell}</td>)}</tr>)}</tbody>
      </table></div>
    </details>
  );
}

export function LatencyPanel({ results }: { results: LatencyResults }) {
  const groups = latencyGroups(results);
  const series = latencySeries(groups);
  const lastSafe = groups.filter((g) => g.family !== "schnorr").pop();
  const xy: XYSeries[] = series.flatMap((s) => [
    { key: `${s.backend}-safe`, color: STYLE[s.backend].color, shape: STYLE[s.backend].shape, points: s.safe.map((p) => ({ ...p, tip: tipFor(groups.find((g) => g.name === p.label) ?? groups[0], s.backend) })) },
    { key: `${s.backend}-sch`, color: STYLE[s.backend].color, shape: STYLE[s.backend].shape, hollow: true, dash: "4 4", points: s.schnorr.map((p) => ({ ...p, tip: tipFor(groups.find((g) => g.name === p.label) ?? groups[0], s.backend) })) },
  ]);
  const labels: XYLabel[] = lastSafe ? BACKENDS.filter((b) => lastSafe.ms[b] != null).map((b) => ({ x: lastSafe.bitsP, y: lastSafe.ms[b], text: b, dx: 10, dy: STYLE[b].dy, strong: true })) : [];
  const rfc = groups.find((g) => g.name === "rfc-2048");
  const sch = groups.find((g) => g.name === "schnorr-2048");
  return (
    <div className="panel">
      <PanelHead title="Inicio de sesión completo según el tamaño de p">
        <div className="legend">
          {BACKENDS.map((b) => <span key={b}><i style={{ background: STYLE[b].color }} />{STYLE[b].label}</span>)}
          <span><i style={{ background: "transparent", border: "1.5px solid var(--muted)", borderRadius: "50%" }} />grupo de Schnorr</span>
        </div>
      </PanelHead>
      <div className="pb" style={{ display: "grid", gap: 12 }}>
        <XYChart aria="Latencia de un inicio de sesión según bits de p y aritmética" height={310} margin={{ l: 58, r: 58, t: 26, b: 40 }}
          x={{ domain: [220, 3500], log: true, ticks: [256, 512, 1024, 2048, 3072], fmt: (v) => v, title: "bits de p" }}
          y={{ domain: [0.08, 600], ticks: [0.1, 1, 10, 100], fmt: (v) => v, title: "ms" }} series={xy} labels={labels} />
        {rfc && sch ? (
          <p className="cap">Mediana de {results.rows[0]?.reps || 31} repeticiones, en escala logarítmica. Con rfc-2048 un inicio completo tarda <b>{rfc.ms.propia?.toFixed(1)} ms</b> con
            la aritmética propia y <b>{rfc.ms.gmpy2?.toFixed(1)} ms</b> con gmpy2. Un grupo de Schnorr del mismo p (q de {sch.bitsQ} bits) baja la propia
            a <b>{sch.ms.propia?.toFixed(1)} ms</b>: los exponentes son de {sch.bitsQ} bits, no de {rfc.bitsQ}.</p>
        ) : <p className="cap">Mediana por grupo y aritmética, en escala logarítmica.</p>}
        <DataTable head={["Grupo", "bits p", "bits q", "Seguridad", "propia", "nativa", "gmpy2"]}
          rows={groups.map((g) => [g.name, g.bitsP, g.bitsQ, g.security, ...BACKENDS.map((b) => (g.ms[b] != null ? `${g.ms[b].toFixed(2)} ms` : "–"))])} />
      </div>
    </div>
  );
}

export function BsgsPanel({ results }: { results: BsgsResults }) {
  const s = bsgsSeries(results);
  const first = results.predictions[0];
  const lastMeasured = s.measured[s.measured.length - 1];
  const xy: XYSeries[] = [
    { key: "fit", color: "var(--s1)", points: s.fitSolid },
    { key: "extra", color: "var(--s1)", dash: "5 5", points: s.fitDashed },
    { key: "measured", color: "var(--s1)", shape: "circle", line: false, points: results.rows.map((r) => ({ x: r.q_bits, y: r.seconds, tip: <><b>q de {r.q_bits} bits</b> (medido)<br />{fmtInt(r.operations)} operaciones<br />{sci(r.seconds, 2)} s</> })) },
    { key: "pred", color: "var(--s1)", shape: "circle", hollow: true, line: false, points: s.predicted.map((p) => ({ ...p, tip: <><b>q de {p.x} bits</b> (extrapolado)<br />{sci(p.y, 2)} s ≈ {sci(p.years)} años</> })) },
  ];
  const labels: XYLabel[] = [
    ...s.predicted.map((p, i) => ({ x: p.x, y: p.y, text: `${sci(p.years)} años`, dx: -11, dy: i === 0 ? -9 : 4, anchor: "end" as const, strong: i === 0 })),
    ...(lastMeasured ? [{ x: lastMeasured.x, y: lastMeasured.y, text: `medido hasta q = ${lastMeasured.x}`, dx: 10, dy: 4 }] : []),
  ];
  return (
    <div className="panel">
      <PanelHead title="Robo de la base: despejar x con BSGS">
        <div className="legend"><span><i style={{ background: "var(--s1)", borderRadius: "50%" }} />medido</span><span><i className="ln" style={{ background: "var(--s1)" }} />ajuste √q</span><span><i className="ln" style={{ background: "var(--faint)" }} />referencia</span></div>
      </PanelHead>
      <div className="pb" style={{ display: "grid", gap: 12 }}>
        <XYChart aria="Tiempo de BSGS según bits de q, medido y extrapolado" height={310} margin={{ l: 52, r: 18, t: 26, b: 40 }}
          x={{ domain: [0, 270], ticks: [16, 40, 64, 96, 128, 160, 192, 224, 256], fmt: (v) => v, title: "bits de q" }}
          y={{ domain: [1e-5, 1e34], ticks: [1e-4, 1, 1e4, 1e8, 1e12, 1e16, 1e20, 1e24, 1e28, 1e32], fmt: (v) => <Pow10 v={v} />, title: "segundos" }}
          refs={[{ y: YEAR_S, label: "1 año" }, { y: results.universe_age_years * YEAR_S, label: "edad del universo" }]} series={xy} labels={labels} />
        <p className="cap">Pasos ≈ 1.5·2<sup>q/2</sup>: el exponente medido es {results.fit.growth_exponent.toFixed(3)} (se esperaba {results.fit.expected_growth_exponent}), con <Sci value={s.secondsPerOp} digits={2} /> s
          por operación.{first ? <> Con q = {first.q_bits} ya harían falta <b><Sci value={first.years} /> años</b>, más que la edad del universo.</> : null} El grupo de
          ejemplo (q = 11) cae en 0.03 ms; con rfc-2048 serían ~2<sup>1023</sup> operaciones, unos 1.6·10<sup>294</sup> años.</p>
        <DataTable head={["bits q", "operaciones", "segundos", "Origen"]}
          rows={[...results.rows.map((r) => [r.q_bits, fmtInt(r.operations), sci(r.seconds, 2), r.x_found === r.x_real ? "medido, x encontrado = x real" : "medido"]),
            ...results.predictions.map((p) => [p.q_bits, sci(p.seconds / s.secondsPerOp, 2), sci(p.seconds, 2), `extrapolado: ${sci(p.years, 1)} años`])]} />
      </div>
    </div>
  );
}
