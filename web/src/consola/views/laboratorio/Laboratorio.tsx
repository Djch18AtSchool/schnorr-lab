/** Sección Laboratorio: resultados medidos de los experimentos y trazabilidad R1–R11. */
import type { TestReport } from "../../../shared/types";
import { PanelHead, Unavailable, ViewHead } from "../../components/Common";
import { Icon } from "../../components/Icons";
import { tipHandlers, useTip } from "../../components/Tooltip";
import type { LabResults } from "../../data/source";
import { fmtClock, plural } from "../../lib/format";
import { REQUIREMENT_SOURCES, requirementFiles, requirementStatus, testsByFile, type RequirementStatus } from "../../lib/lab";
import { BsgsPanel, LatencyPanel } from "./LabCharts";

interface LaboratorioProps {
  results: LabResults | null;
  resultsError: string | undefined;
  tests: TestReport | null;
  testsError: string | undefined;
}

const STATUS_TEXT: Readonly<Record<RequirementStatus, string>> = { aprobado: "Aprobado", fallido: "Con fallos", omitido: "Omitido", pendiente: "Sin pruebas" };

function TestsPanel({ report }: { report: TestReport }) {
  const tip = useTip();
  const files = testsByFile(report);
  const allPassed = report.failed === 0;
  return (
    <div className="panel">
      <PanelHead title="Pruebas automatizadas"><span className="muted">pytest, ejecución de las {fmtClock(report.generated_at)} ({report.duration_s.toFixed(1)} s)</span></PanelHead>
      <div className="pb runline">
        <span className={`big${allPassed ? "" : " bad"}`}>{report.passed}</span>
        <span><b style={{ fontWeight: 600 }}>pruebas aprobadas</b><br /><span className="muted">{report.failed} fallidas, {report.skipped} omitidas, {plural(files.length, "archivo", "archivos")}</span></span>
        <div className="testbar" title="Una franja por archivo, proporcional a sus pruebas">
          {files.map((f) => <i key={f.file} className={f.passed < f.total ? "bad" : ""} style={{ flex: f.total }} {...tipHandlers(tip, <><b>{f.file}</b><br />{f.passed} de {f.total} aprobadas</>)} />)}
        </div>
      </div>
      <div className="tablewrap">
        <table className="t reqs">
          <thead><tr><th>Req.</th><th>Qué se exige</th><th>Dónde está</th><th>Pruebas</th><th>Estado</th></tr></thead>
          <tbody>
            {report.requirements.map((req) => {
              const status = requirementStatus(req);
              return (
                <tr key={req.id}>
                  <td>{req.id}</td><td>{req.title}</td>
                  <td className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{REQUIREMENT_SOURCES[req.id] ?? "—"}</td>
                  <td><div className="files">{requirementFiles(req).map((f) => <code key={f.file}>{f.file}<b>{f.count}</b></code>)}</div></td>
                  <td><span className={`passed ${status}`}>{status === "aprobado" ? <Icon name="check" /> : <Icon name="media" />}{STATUS_TEXT[status]}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Laboratorio({ results, resultsError, tests, testsError }: LaboratorioProps) {
  return (
    <>
      <ViewHead title="Laboratorio">
        Resultados medidos de los experimentos del repositorio (<span className="mono">results/latency.json</span> y <span className="mono">results/bsgs.json</span>
        {results?.latency?.python ? `, Python ${results.latency.python}` : ""}) y trazabilidad de requerimientos.
      </ViewHead>
      <div className="lab2">
        {results?.latency ? <LatencyPanel results={results.latency} /> : <Unavailable what="results/latency.json" error={resultsError ?? (results ? "archivo ausente o mal formado" : undefined)} />}
        {results?.bsgs ? <BsgsPanel results={results.bsgs} /> : <Unavailable what="results/bsgs.json" error={resultsError ?? (results ? "archivo ausente o mal formado" : undefined)} />}
      </div>
      {tests ? <TestsPanel report={tests} /> : <Unavailable what="El informe de pruebas (GET /lab/tests)" error={testsError} />}
    </>
  );
}
