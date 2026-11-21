/** Cuatro indicadores del rango elegido; cada número abre las peticiones que lo forman. */
import type { ReactNode } from "react";
import { linkOutcome, linkSince } from "../../lib/activityQuery";
import { fmtClock, fmtMsNumber, plural } from "../../lib/format";
import type { AccountsStatus, SeverityCounts, TrafficStats } from "../../lib/stats";
import type { ConsoleNav } from "../SectionView";

interface KpisProps {
  stats: TrafficStats;
  accounts: AccountsStatus | null;
  alerts: SeverityCounts;
  since: number | null;
  rangeLabel: string;
  nav: ConsoleNav;
}

function Kpi({ label, tone, children, sub }: { label: string; tone: string; children: ReactNode; sub: ReactNode }) {
  return (
    <div className="kpi" data-tone={tone}>
      <span className="kpi-label">{label}</span>
      <div className="kpi-values">{children}</div>
      <span className="kpi-sub">{sub}</span>
    </div>
  );
}

function Value({ value, unit, tone, onClick, title }: { value: ReactNode; unit: string; tone?: string; onClick: () => void; title: string }) {
  return (
    <button type="button" className={`kpi-value${tone ? ` ${tone}` : ""}`} onClick={onClick} title={title}>
      <b>{value}</b><small>{unit}</small>
    </button>
  );
}

function accountsSub(accounts: AccountsStatus): ReactNode {
  const fixed = accounts.unlocked[accounts.unlocked.length - 1];
  if (accounts.locked.length) return <>Bloqueada: <b>{accounts.locked.join(", ")}</b>. Soporte puede desbloquearla.</>;
  if (fixed) return <>{fixed.user} se bloqueó a las {fmtClock(fixed.lockedAt)}; soporte la desbloqueó a las {fmtClock(fixed.unlockedAt)}.</>;
  return accounts.total ? "Ninguna cuenta bloqueada." : "Aún no hay cuentas registradas.";
}

export function Kpis({ stats, accounts, alerts, since, rangeLabel, nav }: KpisProps) {
  const totalAlerts = alerts.alta + alerts.media + alerts.baja;
  return (
    <div className="kpis">
      <Kpi label="Inicios de sesión" tone="auth" sub={`${rangeLabel} · ${plural(stats.granted + stats.rejected, "intento decidido", "intentos decididos")}`}>
        <Value value={stats.granted} unit="concedidos" tone="ok" title="Ver los accesos concedidos" onClick={() => nav.openActivity(linkOutcome("concedido", since, `Accesos concedidos · ${rangeLabel}`))} />
        <Value value={stats.rejected} unit="rechazados" tone="bad" title="Ver los intentos rechazados" onClick={() => nav.openActivity(linkOutcome("rechazado", since, `Intentos rechazados · ${rangeLabel}`))} />
      </Kpi>
      <Kpi label="Tiempo de respuesta del banco" tone="bank" sub={`${rangeLabel} · ${plural(stats.requests, "petición", "peticiones")}; mediana y percentil 95`}>
        <Value value={stats.requests ? fmtMsNumber(stats.p50) : "–"} unit="ms p50" title="Ver las peticiones del rango" onClick={() => nav.openActivity(linkSince(since, `Peticiones · ${rangeLabel}`))} />
        <Value value={stats.requests ? fmtMsNumber(stats.p95) : "–"} unit="ms p95" title="Ver las peticiones del rango" onClick={() => nav.openActivity(linkSince(since, `Peticiones · ${rangeLabel}`))} />
      </Kpi>
      <Kpi label="Cuentas" tone="accounts" sub={accounts ? accountsSub(accounts) : "No se pudieron leer las cuentas."}>
        <Value value={accounts?.active ?? "–"} unit={accounts?.active === 1 ? "activa" : "activas"} title="Ver los clientes" onClick={() => nav.go("clientes")} />
        <Value value={accounts?.locked.length ?? "–"} unit={accounts?.locked.length === 1 ? "bloqueada" : "bloqueadas"} tone={accounts?.locked.length ? "bad" : undefined} title="Ver los clientes" onClick={() => nav.go("clientes")} />
      </Kpi>
      <Kpi label="Alertas de seguridad" tone="alerts" sub={totalAlerts ? `${rangeLabel} · ${alerts.alta} altas, ${alerts.media} medias, ${alerts.baja} bajas` : `${rangeLabel} · sin alertas`}>
        <Value value={totalAlerts} unit={totalAlerts === 1 ? "alerta" : "alertas"} tone={alerts.alta ? "bad" : totalAlerts ? "warn" : undefined} title="Ver quién ataca en Seguridad" onClick={() => nav.go("seguridad")} />
      </Kpi>
    </div>
  );
}
