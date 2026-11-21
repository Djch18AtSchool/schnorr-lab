/** Comparación: latencia de registro e inicio de sesión, y lo que cuesta cada flujo en la red. */
import { useState } from "react";
import { Seg } from "../../../components/Common";
import { BarRows } from "../../../components/charts/BarRows";
import { Legend, type SeriesStyle } from "../../../components/charts/marks";
import type { ComparisonResults } from "../../../data/labTypes";
import { latencyBars, networkBars, referenceZkp, rowByKey, type Flow, type NetworkRowData } from "../../../lib/labComparison";
import { fmtBytes, fmtMsShort, fmtTimes } from "../../../lib/format";
import { DataTable, ExperimentFrame, type ExpContext } from "../Experiment";

const LATENCY_SERIES: readonly SeriesStyle[] = [
  { key: "registro", label: "Registro", color: "var(--s1)" },
  { key: "inicio", label: "Inicio de sesión", color: "var(--s2)" },
  { key: "sinParametros", label: "Inicio sin descargar p, q, g", color: "var(--s3)" },
];

const NETWORK_SERIES: readonly SeriesStyle[] = [
  { key: "enviados", label: "Bytes enviados por el celular", color: "var(--s1)" },
  { key: "recibidos", label: "Bytes recibidos del banco", color: "var(--s2)" },
];

const notesAbout = (c: ComparisonResults, words: readonly string[]): string[] => c.notes.filter((n) => words.some((w) => n.toLowerCase().includes(w)));

/** «: los exponentes pasan de 224 a 2047 bits» si el archivo trae los bits de q de ambos grupos. */
function exponentBits(c: ComparisonResults, from: string, to: string): string {
  const bits = (group: string): number | undefined => c.stolen?.bsgs.find((g) => g.group === group)?.qBits;
  const a = bits(from);
  const b = bits(to);
  return a && b ? `: los exponentes pasan de ${a} a ${b} bits` : "";
}

function LatencyConclusion({ c }: { c: ComparisonResults }) {
  const password = rowByKey(c, "password");
  const srp = rowByKey(c, "srp");
  const zkp = referenceZkp(c);
  const rfc = c.rows.find((r) => r.mechanism === "zkp" && r.group.startsWith("rfc"));
  if (!password || !zkp) return <>Mediana de cada flujo, de punta a punta.</>;
  return (
    <>
      Con {zkp.group}, el ZKP inicia sesión en <b>{fmtMsShort(zkp.loginMs)}</b> ({fmtMsShort(zkp.loginWithoutParamsMs)} si el celular ya tiene p, q y g), del mismo orden
      que la contraseña con Argon2id ({fmtMsShort(password.loginMs)}, lenta a propósito){srp ? <> y que SRP-6a ({fmtMsShort(srp.loginMs)})</> : null}.
      {rfc ? <> Con {rfc.group} sube a <b>{fmtMsShort(rfc.loginMs)}</b> ({fmtTimes(rfc.loginMs / zkp.loginMs)}){exponentBits(c, zkp.group, rfc.group)}.</> : null}
    </>
  );
}

export function ComparisonLatency({ ctx, c }: { ctx: ExpContext; c: ComparisonResults }) {
  const rows = latencyBars(c);
  return (
    <ExperimentFrame ctx={ctx} source={`mediana de ${c.reps} repeticiones, aritmética ${c.backend}`} legend={<Legend items={LATENCY_SERIES} />}
      conclusion={<LatencyConclusion c={c} />} method={notesAbout(c, ["latencia", "login_without_params"]).join(" ")}
      data={<DataTable head={["Mecanismo", "Registro", "Inicio de sesión", "Inicio sin parámetros", "Seguridad (bits)"]}
        rows={c.rows.map((r) => [r.label, fmtMsShort(r.registerMs), fmtMsShort(r.loginMs), fmtMsShort(r.loginWithoutParamsMs), r.securityBits])} />}>
      <BarRows aria="Latencia de registro e inicio de sesión por mecanismo, en milisegundos" rows={rows} series={LATENCY_SERIES} mode="grouped"
        title="milisegundos (mediana)" value={fmtMsShort} tick={String} labelWidth={230}
        tip={(row, s) => <><b>{row.label}</b><br />{s.label}: {fmtMsShort(row.values[s.key] ?? 0)}</>} />
    </ExperimentFrame>
  );
}

const FLOWS = [{ value: "login" as const, label: "Inicio de sesión" }, { value: "register" as const, label: "Registro" }];

function networkNote(row: NetworkRowData): string {
  return `${row.roundTrips} ${row.roundTrips === 1 ? "ida y vuelta" : "idas y vueltas"} · ${fmtBytes(row.totalBytes)}`;
}

function NetworkConclusion({ c }: { c: ComparisonResults }) {
  const rows = networkBars(c, "login");
  const password = rows.find((r) => r.key === "password");
  const zkp = rows.find((r) => r.key === referenceZkp(c)?.key);
  const nizk = rows.find((r) => r.key.includes("nizk"));
  if (!password || !zkp) return <>Idas y vueltas y bytes de los cuerpos JSON de cada flujo.</>;
  return (
    <>
      La contraseña inicia sesión en <b>{networkNote(password)}</b>. El ZKP interactivo necesita <b>{zkp.roundTrips}</b> (parámetros, compromiso y respuesta)
      {nizk ? <> y Fiat-Shamir {nizk.roundTrips}, porque el reto lo calcula el propio celular</> : null}; sus {fmtBytes(zkp.totalBytes)} son sobre todo números
      de 2048 bits y los valores intermedios que la interfaz muestra.
    </>
  );
}

export function ComparisonNetwork({ ctx, c }: { ctx: ExpContext; c: ComparisonResults }) {
  const [flow, setFlow] = useState<Flow>("login");
  const rows = networkBars(c, flow);
  return (
    <ExperimentFrame ctx={ctx} source="bytes de los cuerpos JSON" legend={<Legend items={NETWORK_SERIES} />}
      tools={<Seg options={FLOWS} value={flow} onChange={setFlow} label="Flujo" />}
      conclusion={<NetworkConclusion c={c} />} method={notesAbout(c, ["bytes"]).join(" ")}
      data={<DataTable head={["Mecanismo", "Idas y vueltas", "POST", "Enviados", "Recibidos", "Rutas"]}
        rows={rows.map((r) => [r.label, r.roundTrips, c.rows.find((x) => x.key === r.key)?.[flow].posts ?? "—", fmtBytes(r.values.enviados), fmtBytes(r.values.recibidos),
          <span className="paths">{r.paths.join(" → ")}</span>])} />}>
      <BarRows aria={`Bytes enviados y recibidos por mecanismo en el ${flow === "login" ? "inicio de sesión" : "registro"}`} rows={rows} series={NETWORK_SERIES} mode="stacked"
        title="bytes en la red" value={fmtBytes} tick={(v) => (v ? fmtBytes(v) : "0")} labelWidth={230} note={networkNote}
        tip={(row, s) => <><b>{row.label}</b><br />{s.label}: {fmtBytes(row.values[s.key] ?? 0)}<br /><span className="muted">{row.paths.join(" → ")}</span></>} />
    </ExperimentFrame>
  );
}
