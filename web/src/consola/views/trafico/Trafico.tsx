/** Sección Tráfico: cada petición que llega al servidor, en vivo, con su inspector. */
import { useMemo, useState, type RefObject } from "react";
import type { RequestRecord } from "../../../shared/types";
import { Seg, ViewHead } from "../../components/Common";
import type { GroupInfo } from "../../lib/group";
import { flowOf, isBad, matchesTraffic, outcomeOf, type TrafficFilter, type TrafficQuery } from "../../lib/requests";
import type { ConsoleState } from "../../state/store";
import { Inspector } from "./Inspector";
import { MAX_TRAFFIC_ROWS, TrafficTable } from "./TrafficTable";

interface TraficoProps {
  state: ConsoleState;
  now: number;
  users: ReadonlyMap<number, string>;
  group: GroupInfo | null;
  query: TrafficQuery;
  onQuery: (query: TrafficQuery) => void;
  selected: number | null;
  onSelect: (id: number) => void;
  searchRef: RefObject<HTMLInputElement | null>;
}

const FILTERS: ReadonlyArray<{ value: TrafficFilter; label: string }> = [
  { value: "all", label: "Todo" }, { value: "write", label: "Escrituras" }, { value: "bad", label: "Rechazos y errores" },
];

/** Sin selección explícita, se muestra el acceso concedido más reciente (o la última petición). */
function pickDefault(rows: readonly RequestRecord[]): number | null {
  const granted = rows.find((r) => r.path.endsWith("/login/respond") && outcomeOf(r) === "granted");
  return (granted ?? rows[0])?.id ?? null;
}

export function Trafico({ state, now, users, group, query, onQuery, selected, onSelect, searchRef }: TraficoProps) {
  const [hoverFlow, setHoverFlow] = useState<string | null>(null);
  const rows = useMemo(
    () => state.requests.filter((r) => matchesTraffic(r, query, users.get(r.id))).slice(-MAX_TRAFFIC_ROWS).reverse(),
    [state.requests, query, users],
  );
  const current = state.requests.find((r) => r.id === selected) ?? state.requests.find((r) => r.id === pickDefault(rows)) ?? null;
  const windowS = state.summary?.window_s ?? 900;
  const recent = state.requests.filter((r) => r.timestamp >= now - windowS);
  const flow = current ? state.requests.filter((r) => flowOf(r) === flowOf(current)) : [];
  const user = current ? users.get(current.id) : undefined;
  const y = state.accounts?.find((a) => a.user_id === user)?.stored.y ?? null;
  const route = current ? state.summary?.routes.find((s) => s.route === current.route && s.method === current.method) : undefined;
  const related = current ? state.alerts.filter((a) => a.evidence[a.evidence.length - 1] === current.id) : [];
  return (
    <>
      <ViewHead title="Tráfico" tools={<>
        <Seg label="Filtrar" options={FILTERS} value={query.filter} onChange={(filter) => onQuery({ ...query, filter })} />
        <input ref={searchRef} className="field" type="search" placeholder="Buscar usuario, sesión, IP…" aria-label="Buscar en el tráfico"
          value={query.search} onChange={(e) => onQuery({ ...query, search: e.target.value })} />
      </>}>
        Cada petición que llega al servidor, en vivo. Selecciona una para ver los cuerpos enviados y recibidos.
      </ViewHead>
      <div className="traffic">
        <TrafficTable rows={rows} selected={current?.id ?? null} hoverFlow={hoverFlow} onSelect={onSelect} onHoverFlow={setHoverFlow}
          summaryText={`${recent.length} peticiones en ${Math.round(windowS / 60)} min, ${recent.filter(isBad).length} rechazos o errores`} />
        <Inspector request={current} flow={flow} alerts={related} group={group} y={y} route={route} onSelect={onSelect} />
      </div>
    </>
  );
}
