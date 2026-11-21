/** Resumen de la comparación en una tabla: lo que cuesta y lo que protege cada mecanismo. */
import { Duration } from "../../../components/Common";
import type { ComparisonResults, ComparisonRow } from "../../../data/labTypes";
import { qualitativeRows, referenceZkp, rowByKey, secretTravels, verdictTone } from "../../../lib/labComparison";
import { fmtBytes, fmtMsShort } from "../../../lib/format";
import { ExperimentFrame, Verdict, type ExpContext } from "../Experiment";

/** «Parcial (cae ante un relevo…)» → «Parcial»: el detalle está en la tabla cualitativa. */
const shortVerdict = (verdict: string): string => verdict.split(" (")[0];

const total = (r: ComparisonRow): number => r.login.sent_bytes + r.login.received_bytes;

function attackCell(r: ComparisonRow) {
  return r.random8Log10Years == null ? "—" : <Duration log10={r.random8Log10Years} />;
}

function ScoreRow({ r, phishing }: { r: ComparisonRow; phishing: string | undefined }) {
  const travels = secretTravels(r.secrets.login) || secretTravels(r.secrets.register);
  return (
    <tr className={r.mechanism === "zkp" ? "hl" : ""}>
      <td className="wrap"><b>{r.label.split(" · ").map((part, i) => <span key={part} className="nobr">{i ? " · " : ""}{part}</span>)}</b></td>
      <td className="r mono">{fmtMsShort(r.loginMs)}</td>
      <td className="r mono">{r.login.round_trips} · {fmtBytes(total(r))}</td>
      <td>{travels ? <Verdict tone="bad">sí</Verdict> : <Verdict tone="ok">no</Verdict>}</td>
      <td>{r.replay.accepted ? <Verdict tone="bad">aceptada</Verdict> : <Verdict tone="ok">rechazada</Verdict>}</td>
      <td>{attackCell(r)}</td>
      <td title={phishing}>{phishing ? <Verdict tone={verdictTone(phishing)}>{shortVerdict(phishing)}</Verdict> : "—"}</td>
    </tr>
  );
}

function SummaryConclusion({ c }: { c: ComparisonResults }) {
  const zkp = referenceZkp(c);
  const password = rowByKey(c, "password");
  const rfc = c.rows.find((r) => r.mechanism === "zkp" && r.group.startsWith("rfc"));
  if (!zkp || !password) return <>Ver la tabla: una fila por mecanismo medido.</>;
  return (
    <>
      El ZKP es el único donde <b>ningún secreto viaja</b> y el banco guarda solo <code>y</code>: con la base robada no hay contraseña que
      adivinar (BSGS con {zkp.group} llevaría <Duration log10={zkp.random8Log10Years ?? 0} />). Cuesta más red
      ({zkp.login.round_trips} idas y vueltas, {fmtBytes(total(zkp))}) y, con {zkp.group}, un inicio de <b>{fmtMsShort(zkp.loginMs)}</b> frente a
      {" "}{fmtMsShort(password.loginMs)} de la contraseña{rfc ? <>; con {rfc.group} sube a {fmtMsShort(rfc.loginMs)}</> : null}.
    </>
  );
}

export function ComparisonSummary({ ctx, c }: { ctx: ExpContext; c: ComparisonResults }) {
  const phishing = new Map(qualitativeRows(c).map((q) => [q.key, q.phishing]));
  return (
    <ExperimentFrame ctx={ctx} source={`mediana de ${c.reps} repeticiones, aritmética ${c.backend}, Python ${c.python}`}
      conclusion={<SummaryConclusion c={c} />}
      method="Cada mecanismo ejecuta los pasos reales del celular contra el banco real (FastAPI en memoria). Los detalles de cada columna están en las subsecciones siguientes."
      data={<ul className="notes">{c.notes.map((n) => <li key={n}>{n}</li>)}</ul>}>
      <div className="tablewrap"><table className="t score">
        <thead><tr>
          <th>Mecanismo</th><th className="r">Inicio</th><th className="r">Red</th>
          <th>¿Viaja un secreto?</th><th>Repetición</th><th>Base robada</th><th>Phishing</th>
        </tr></thead>
        <tbody>{c.rows.map((r) => <ScoreRow key={r.key} r={r} phishing={phishing.get(r.mechanism)} />)}</tbody>
      </table></div>
      <p className="cap">Inicio: mediana de un inicio de sesión. Red: idas y vueltas · bytes del inicio de sesión. Base robada: tiempo, en un núcleo de este equipo, para adivinar ocho caracteres al azar (94<sup>8</sup> posibilidades) o, en el ZKP, para
        despejar x con BSGS. Phishing: veredicto de la tabla cualitativa.</p>
    </ExperimentFrame>
  );
}
