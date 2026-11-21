/** Sección API: enlace a Swagger (/docs) y a /openapi.json, y las rutas con su uso en la ventana. */
import { ExternalLink } from "lucide-react";
import type { RequestRecord, RouteStats } from "../../shared/types";
import { Method, Status, ViewHead } from "../components/Common";
import { isAuditedRoute } from "../data/routes";
import type { ApiRoutes } from "../data/source";
import { rel } from "../lib/format";

interface ApiProps {
  routes: ApiRoutes | null;
  stats: readonly RouteStats[];
  requests: readonly RequestRecord[];
  now: number;
  simulated: boolean;
}

const tagLabel = (tag: string): string => tag || "sin grupo";

export function Api({ routes, stats, requests, now, simulated }: ApiProps) {
  const origin = window.location.origin;
  const list = routes?.routes ?? [];
  return (
    <>
      <ViewHead title="API">Rutas que expone el servidor. Las de protocolo registran su cuerpo en la auditoría.</ViewHead>
      <div className="panel swagger">
        <div style={{ display: "grid", gap: 4 }}>
          <b style={{ fontWeight: 600 }}>Documentación interactiva (Swagger UI)</b>
          <span className="u muted">{origin}/docs</span>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {simulated ? "Con la fuente simulada no hay banco detrás: los enlaces abren el del origen actual si existe." : "OpenAPI generado por FastAPI. Incluye «Crear un cliente de prueba» para probar con clics."}
          </span>
        </div>
        <div className="tools">
          <a className="btn" href="/openapi.json" target="_blank" rel="noopener">openapi.json</a>
          <a className="btn primary" href="/docs" target="_blank" rel="noopener">Abrir Swagger<ExternalLink className="i" aria-hidden="true" /></a>
        </div>
      </div>
      <div className="panel">
        <div className="ph"><h2>{list.length} rutas</h2><span className="muted">{routes?.origin === "openapi" ? "leídas de /openapi.json" : "lista conocida del banco (/openapi.json no disponible)"}</span></div>
        <div className="tablewrap">
          <table className="t routes">
            <thead><tr><th>Método</th><th>Ruta</th><th>Qué hace</th><th>Grupo</th><th className="r">Llamadas 15 min</th><th className="r">p95</th><th>Último estado</th></tr></thead>
            <tbody>
              {list.map((route) => {
                const stat = stats.find((s) => s.method === route.method && s.route === route.path);
                const last = [...requests].reverse().find((r) => r.method === route.method && r.route === route.path);
                const stream = route.path.endsWith("/events/stream");
                return (
                  <tr key={`${route.method} ${route.path}`}>
                    <td><Method method={route.method} /></td>
                    <td><span className="path">{route.path}</span></td>
                    <td className="sum">{route.summary}{isAuditedRoute(route.method, route.path) ? <> <span className="tag aud">auditada</span></> : null}</td>
                    <td><span className="tag">{tagLabel(route.tag)}</span></td>
                    <td className="r mono">{stat?.count ?? 0}</td>
                    <td className="r mono">{stream ? <span className="faint">flujo abierto</span> : stat ? `${stat.p95_ms.toFixed(2)} ms` : "–"}</td>
                    <td>{last ? <><Status status={last.status} /> <span className="faint" style={{ fontSize: 12 }}>{rel(last.timestamp, now)}</span></> : <span className="faint">sin llamadas</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
