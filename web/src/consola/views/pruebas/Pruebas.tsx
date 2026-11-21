/** Sección Pruebas: la última ejecución de pytest y la trazabilidad de los requerimientos R1–R11 y C1–C5. */
import { CircleAlert, CircleCheck, CircleMinus, CircleX } from "lucide-react";
import type { TestReport } from "../../../shared/types";
import { CodeText, PanelHead, Unavailable, ViewHead } from "../../components/Common";
import { tipHandlers, useTip } from "../../components/Tooltip";
import { fmtClock, plural } from "../../lib/format";
import { REQUIREMENT_SOURCES, requirementFiles, requirementStatus, testsByFile, type RequirementStatus } from "../../lib/lab";

interface PruebasProps {
  tests: TestReport | null;
  testsError: string | undefined;
}

type Requirement = TestReport["requirements"][number];

const STATUS: Readonly<Record<RequirementStatus, { text: string; Icon: typeof CircleCheck }>> = {
  aprobado: { text: "Aprobado", Icon: CircleCheck },
  fallido: { text: "Con fallos", Icon: CircleX },
  omitido: { text: "Omitido", Icon: CircleMinus },
  pendiente: { text: "Sin pruebas", Icon: CircleAlert },
};

const GROUPS: ReadonlyArray<{ prefix: string; title: string }> = [
  { prefix: "R", title: "Requerimientos del protocolo (R1–R11)" },
  { prefix: "C", title: "Comparación con otros mecanismos (C1–C5)" },
];

function RunLine({ report }: { report: TestReport }) {
  const tip = useTip();
  const files = testsByFile(report);
  return (
    <div className="pb runline">
      <span className={`big${report.failed === 0 ? "" : " bad"}`}>{report.passed}</span>
      <span><b style={{ fontWeight: 600 }}>pruebas aprobadas</b><br /><span className="muted">{report.failed} fallidas, {report.skipped} omitidas, {plural(files.length, "archivo", "archivos")}</span></span>
      <div className="testbar" title="Una franja por archivo, proporcional a sus pruebas">
        {files.map((f) => <i key={f.file} className={f.passed < f.total ? "bad" : ""} style={{ flex: f.total }} {...tipHandlers(tip, <><b>{f.file}</b><br />{f.passed} de {f.total} aprobadas</>)} />)}
      </div>
    </div>
  );
}

function RequirementRow({ req }: { req: Requirement }) {
  const status = requirementStatus(req);
  const { text, Icon } = STATUS[status];
  return (
    <tr>
      <td>{req.id}</td><td><CodeText text={req.title} /></td>
      <td className="mono src">{REQUIREMENT_SOURCES[req.id] ?? "—"}</td>
      <td><div className="files">{requirementFiles(req).map((f) => <code key={f.file}>{f.file}<b>{f.count}</b></code>)}</div></td>
      <td><span className={`passed ${status}`}><Icon className="i" aria-hidden="true" />{text}</span></td>
    </tr>
  );
}

function RequirementsTable({ title, reqs }: { title: string; reqs: readonly Requirement[] }) {
  return (
    <div className="panel">
      <PanelHead title={title}><span className="muted">{plural(reqs.length, "requerimiento", "requerimientos")}</span></PanelHead>
      <div className="tablewrap">
        <table className="t reqs">
          <thead><tr><th>Req.</th><th>Qué se exige</th><th>Dónde está</th><th>Pruebas</th><th>Estado</th></tr></thead>
          <tbody>{reqs.map((req) => <RequirementRow key={req.id} req={req} />)}</tbody>
        </table>
      </div>
    </div>
  );
}

export function Pruebas({ tests, testsError }: PruebasProps) {
  const others = tests?.requirements.filter((r) => !GROUPS.some((g) => r.id.startsWith(g.prefix))) ?? [];
  return (
    <>
      <ViewHead title="Pruebas">
        Pruebas automatizadas (pytest) y trazabilidad: qué prueba cubre cada requerimiento del protocolo y de la comparación, y si pasó en la última ejecución.
      </ViewHead>
      {tests ? (
        <>
          <div className="panel">
            <PanelHead title="Última ejecución"><span className="muted">pytest, a las {fmtClock(tests.generated_at)} ({tests.duration_s.toFixed(1)} s)</span></PanelHead>
            <RunLine report={tests} />
          </div>
          {GROUPS.map((g) => {
            const reqs = tests.requirements.filter((r) => r.id.startsWith(g.prefix));
            return reqs.length ? <RequirementsTable key={g.prefix} title={g.title} reqs={reqs} /> : null;
          })}
          {others.length ? <RequirementsTable title="Otros requerimientos" reqs={others} /> : null}
        </>
      ) : <Unavailable what="El informe de pruebas (GET /lab/tests)" error={testsError} />}
    </>
  );
}
