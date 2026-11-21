/** Comparación: cuánto tarda el ataque fuera de línea con la base robada (diccionario, al azar o BSGS). */
import { CodeText, Duration } from "../../../components/Common";
import { DotPlot, type DotRow } from "../../../components/charts/DotPlot";
import { Legend, PartsSvg, Pow10Svg, type SeriesStyle } from "../../../components/charts/marks";
import type { ComparisonResults } from "../../../data/labTypes";
import { powerTicks } from "../../../lib/charts";
import { stolenRows, type AttackKind, type StolenRow } from "../../../lib/labComparison";
import { durationParts, fmtDuration } from "../../../lib/format";
import { DataTable, ExperimentFrame, type ExpContext } from "../Experiment";

const SERIES: readonly SeriesStyle[] = [
  { key: "diccionario", label: "Diccionario de 10⁶ contraseñas", color: "var(--s1)", shape: "circle" },
  { key: "aleatoria", label: "8 caracteres al azar (94⁸)", color: "var(--s2)", shape: "square" },
  { key: "bsgs", label: "ZKP: despejar x con BSGS", color: "var(--s3)", shape: "diamond" },
];

const ATTACKS: readonly AttackKind[] = ["diccionario", "aleatoria", "bsgs"];
const DOMAIN: readonly [number, number] = [1e-6, 1e30];
const DAY_YEARS = 1 / 365.25;
const UNIVERSE_YEARS = 1.38e10;

function dotRows(rows: readonly StolenRow[]): DotRow[] {
  return rows.map((r) => ({
    key: r.key, label: r.label, emphasis: r.emphasis,
    points: ATTACKS.flatMap((kind) => {
      const log10 = r.log10Years[kind];
      if (log10 == null) return [];
      const label = SERIES.find((s) => s.key === kind)?.label ?? kind;
      return [{ series: kind, value: 10 ** log10, tip: <><b>{r.label}</b><br />{label}<br />{fmtDuration(log10)}</> }];
    }),
  }));
}

function Conclusion({ c, rows }: { c: ComparisonResults; rows: readonly StolenRow[] }) {
  const pick = (key: string, kind: AttackKind): number | undefined => rows.find((r) => r.key === key)?.log10Years[kind];
  const pwdDict = pick("password", "diccionario");
  const srpGmpy2 = pick("srp-gmpy2", "diccionario");
  const srpDict = srpGmpy2 ?? pick("srp", "diccionario");
  const zkpRows = rows.filter((r) => r.log10Years.bsgs != null);
  if (pwdDict == null || !zkpRows.length) return <>Tiempo de cada ataque en un núcleo de este equipo.</>;
  return (
    <>
      Con la base robada, una contraseña de diccionario cae en <b><Duration log10={pwdDict} /></b> con Argon2id
      {srpDict != null ? <> y en <b><Duration log10={srpDict} /></b> con SRP{srpGmpy2 != null ? " y gmpy2" : ""}</> : null}; el segundo factor de TOTP queda {c.stolen?.totpSecondFactor || "comprometido: su clave K está en la base"}.
      El ZKP no tiene contraseña que adivinar: despejar x con BSGS llevaría {zkpRows.map((r, i) => (
        <span key={r.key}>{i ? " y " : ""}<b><Duration log10={r.log10Years.bsgs ?? 0} /></b> con {r.label.replace("ZKP · ", "")}</span>
      ))}.
    </>
  );
}

export function ComparisonStolen({ ctx, c }: { ctx: ExpContext; c: ComparisonResults }) {
  const rows = stolenRows(c);
  const method = <CodeText text={c.notes.filter((n) => /base robada|bsgs/i.test(n)).join(" ")} />;
  return (
    <ExperimentFrame ctx={ctx} source="un núcleo de este equipo" legend={<Legend items={SERIES} />} conclusion={<Conclusion c={c} rows={rows} />} method={method}
      data={<DataTable head={["Credencial", "Diccionario 10⁶", "8 caracteres al azar", "BSGS"]}
        rows={rows.map((r) => [r.label, ...ATTACKS.map((k) => (r.log10Years[k] == null ? "no aplica" : fmtDuration(r.log10Years[k] ?? 0)))])} />}>
      <DotPlot aria="Años para recuperar la credencial con la base robada, escala logarítmica" rows={dotRows(rows)} series={SERIES} labelWidth={200}
        x={{ domain: DOMAIN, log: true, ticks: powerTicks(DOMAIN, 6), fmt: (v) => <Pow10Svg value={v} />, title: "años (escala logarítmica)" }}
        refs={[{ x: DAY_YEARS, label: "1 día" }, { x: UNIVERSE_YEARS, label: "edad del universo" }]}
        clipLabel={(v) => <PartsSvg {...durationParts(Math.log10(v))} />} />
    </ExperimentFrame>
  );
}
