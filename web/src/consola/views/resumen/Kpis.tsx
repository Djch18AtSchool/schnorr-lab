/** Fila de indicadores del resumen, todos leídos de /telemetry/summary y /bank/accounts. */
import type { ReactNode } from "react";
import type { Account, TelemetrySummary } from "../../../shared/types";
import { Sparkline } from "../../components/charts/TrafficCharts";
import { perMinute } from "../../lib/charts";
import { rejectionText } from "../../lib/telemetry";

export const P95_TARGET_MS = 50;

function Kpi({ label, value, unit, tone, sub, children }: { label: string; value: string | number; unit?: string; tone?: "ok" | "bad"; sub?: string; children?: ReactNode }) {
  return (
    <div className="kpi">
      <span className="lb">{label}</span>
      <span className={`v ${tone ?? ""}`}>{value}{unit ? <small>{unit}</small> : null}</span>
      {sub !== undefined ? <span className="sub" title={sub}>{sub}</span> : null}
      {children}
    </div>
  );
}

export function Kpis({ summary, accounts }: { summary: TelemetrySummary; accounts: readonly Account[] | null }) {
  const minutes = Math.round(summary.window_s / 60);
  const locked = (accounts ?? []).filter((a) => a.status === "bloqueada").map((a) => a.user_id);
  const reasons = rejectionText(summary.signals);
  return (
    <div className="panel kpis">
      <Kpi label="Peticiones por minuto" value={summary.requests_per_min}>
        <Sparkline values={perMinute(summary.series, summary.bucket_s)} color="var(--banco)" />
      </Kpi>
      <Kpi label="Latencia p50" value={summary.p50_ms.toFixed(2)} unit="ms" sub={`${minutes} min, sin flujos SSE`} />
      <Kpi label="Latencia p95" value={summary.p95_ms.toFixed(2)} unit="ms" sub={`objetivo < ${P95_TARGET_MS} ms`} />
      <Kpi label="Accesos concedidos" value={summary.totals.auth_ok} tone="ok" sub={`${minutes} min, ambos flujos`} />
      <Kpi label="Accesos rechazados" value={summary.totals.auth_rejected} tone="bad" sub={reasons || "ninguno"} />
      <Kpi label="Cuentas bloqueadas" value={summary.totals.locked_accounts} unit={accounts ? `de ${accounts.length}` : undefined}
        sub={locked.length ? locked.join(", ") : "ninguna"} />
    </div>
  );
}
