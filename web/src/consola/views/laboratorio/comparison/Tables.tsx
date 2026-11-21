/** Comparación: qué guarda el banco, qué viaja y la repetición; y la tabla cualitativa (phishing, fuerza bruta). */
import { CodeText } from "../../../components/Common";
import type { ComparisonResults, ComparisonRow, ReplayAttempt } from "../../../data/labTypes";
import { qualitativeRows, secretList, secretTravels, verdictTone } from "../../../lib/labComparison";
import { fmtBytes } from "../../../lib/format";
import { DataTable, ExperimentFrame, Verdict, type ExpContext } from "../Experiment";

function travelText(login: boolean, register: boolean): string {
  if (login && register) return "viaja al registrarse y en cada inicio";
  if (register) return "viaja solo al registrarse";
  return login ? "viaja en cada inicio" : "nunca viaja";
}

function Secrets({ row }: { row: ComparisonRow }) {
  const list = secretList(row);
  if (!list.length) return <>—</>;
  return (
    <div className="stack-sm">
      {list.map((s) => (
        <Verdict key={s.name} tone={s.login || s.register ? "bad" : "ok"}>{s.name}: {travelText(s.login, s.register)}</Verdict>
      ))}
    </div>
  );
}

function Replay({ attempt }: { attempt: ReplayAttempt | null }) {
  if (!attempt) return <>—</>;
  return (
    <div className="stack-sm">
      {attempt.accepted ? <Verdict tone="bad">aceptada</Verdict> : <Verdict tone="ok">rechazada</Verdict>}
      <span className="why">{attempt.reason}</span>
    </div>
  );
}

const names = (rows: readonly ComparisonRow[]): string => rows.map((r) => r.label).join(", ") || "ninguno";

export function ComparisonStored({ ctx, c }: { ctx: ExpContext; c: ComparisonResults }) {
  const travel = c.rows.filter((r) => secretTravels(r.secrets.login));
  const replayed = c.rows.filter((r) => r.replay.accepted);
  return (
    <ExperimentFrame ctx={ctx} source="lo que guarda el banco tras registrar y las respuestas reales a la repetición"
      conclusion={<>En cada inicio de sesión viaja la contraseña en: <b>{names(travel)}</b>. SRP y el ZKP no envían ningún secreto y el ZKP guarda solo <code>y</code>.
        Repetir un mensaje capturado funciona solo en: <b>{names(replayed)}</b>; los demás lo rechazan (código ya usado, sesión cerrada o prueba ya vista).</>}
      data={<DataTable numeric={false} head={["Mecanismo", "Campos guardados", "Bytes guardados", "Rutas del inicio de sesión"]}
        rows={c.rows.map((r) => [r.label, r.stored.fields.join(", "), fmtBytes(r.stored.bytes), r.login.paths.join(" → ")])} />}>
      <div className="tablewrap"><table className="t wraptable">
        <thead><tr><th>Mecanismo</th><th>El banco guarda</th><th>Secretos en la red</th><th>Repetir el mismo mensaje</th><th>Repetirlo en una sesión nueva</th></tr></thead>
        <tbody>
          {c.rows.map((r) => (
            <tr key={r.key} className={r.mechanism === "zkp" ? "hl" : ""}>
              <td><b>{r.label}</b></td>
              <td><code>{r.stored.fields.join(", ")}</code><br /><span className="why">{fmtBytes(r.stored.bytes)}</span></td>
              <td><Secrets row={r} /></td>
              <td><Replay attempt={r.replay.verbatim} /></td>
              <td><Replay attempt={r.replay.newSession} /></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </ExperimentFrame>
  );
}

export function ComparisonQualitative({ ctx, c }: { ctx: ExpContext; c: ComparisonResults }) {
  const rows = qualitativeRows(c);
  const resist = rows.filter((r) => verdictTone(r.phishing) === "ok").map((r) => r.label);
  const weak = rows.filter((r) => verdictTone(r.phishing) !== "ok").map((r) => `${r.label} (${r.phishing.toLowerCase()})`);
  return (
    <ExperimentFrame ctx={ctx} source="análisis de cada protocolo, apoyado en las pruebas C1–C4"
      conclusion={<>Resisten un sitio falso: <b>{resist.join(" y ") || "ninguno"}</b>; {weak.join("; ")}. En línea, el bloqueo tras tres intentos limita a todos,
        y contra el ZKP adivinar el reto tiene probabilidad 1/q por intento.</>}
      data={<DataTable numeric={false} head={["Mecanismo", "Phishing", "Fuerza bruta en línea"]} rows={rows.map((r) => [r.label, r.phishing, r.online])} />}>
      <div className="tablewrap"><table className="t wraptable qual">
        <thead><tr><th>Mecanismo</th><th>Phishing (sitio falso)</th><th>Fuerza bruta en línea</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={r.key === "zkp" ? "hl" : ""}>
              <td><b>{r.label}</b></td>
              <td><Verdict tone={verdictTone(r.phishing)}>{r.phishing}</Verdict><p className="why"><CodeText text={r.phishingWhy} /></p></td>
              <td><Verdict tone={verdictTone(r.online)}>{r.online}</Verdict><p className="why"><CodeText text={r.onlineWhy} /></p></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </ExperimentFrame>
  );
}
