/** Filtros simples de Actividad: dispositivo, resultado, cuenta y búsqueda, más el filtro que trajo un enlace. */
import { Search, X } from "lucide-react";
import { Seg } from "../../components/Common";
import { EMPTY_QUERY, isFiltered, type ActivityQuery, type OutcomeFilter } from "../../lib/activityQuery";
import { deviceInfo } from "../../lib/devices";

interface FiltersProps {
  query: ActivityQuery;
  onQuery: (query: ActivityQuery) => void;
  devices: readonly string[];
  users: readonly string[];
  shown: number;
  total: number;
}

const OUTCOMES: ReadonlyArray<{ value: OutcomeFilter; label: string }> = [
  { value: "todos", label: "Todos" }, { value: "concedido", label: "Concedidos" }, { value: "rechazado", label: "Rechazados" }, { value: "otros", label: "Otros" },
];

const ALL = "__todos__";

export function Filters({ query, onQuery, devices, users, shown, total }: FiltersProps) {
  const set = (patch: Partial<ActivityQuery>): void => onQuery({ ...query, ...patch });
  return (
    <div className="filters">
      <div className="filters-row">
        <label className="field-wrap">
          <span className="sr">Dispositivo</span>
          <select className="field" value={query.device ?? ALL} onChange={(e) => set({ device: e.target.value === ALL ? null : e.target.value })}>
            <option value={ALL}>Todos los dispositivos</option>
            {devices.map((d) => <option key={d} value={d}>{deviceInfo(d).label}</option>)}
          </select>
        </label>
        <label className="field-wrap">
          <span className="sr">Cuenta</span>
          <select className="field" value={query.user ?? ALL} onChange={(e) => set({ user: e.target.value === ALL ? null : e.target.value })}>
            <option value={ALL}>Todas las cuentas</option>
            {users.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <Seg label="Resultado" value={query.outcome} onChange={(outcome) => set({ outcome })} options={OUTCOMES} />
        <label className="search">
          <Search aria-hidden="true" />
          <span className="sr">Buscar</span>
          <input className="field" type="search" placeholder="Buscar ruta, IP, sesión…" value={query.search} onChange={(e) => set({ search: e.target.value })} />
        </label>
      </div>
      <div className="filters-row meta">
        <span className="muted">{shown === total ? `${total} intentos` : `${shown} de ${total} intentos`}</span>
        {query.label ? <span className="scope">{query.label}<button type="button" aria-label="Quitar este filtro" onClick={() => set({ ids: null, since: null, label: null })}><X aria-hidden="true" /></button></span> : null}
        {isFiltered(query) ? <button type="button" className="link" onClick={() => onQuery(EMPTY_QUERY)}>Quitar filtros</button> : null}
      </div>
    </div>
  );
}
