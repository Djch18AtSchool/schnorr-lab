/**
 * Actividad: ¿qué pasó con esta petición? Los intentos en vivo (params → commit → respond) con
 * filtros, y al elegir una petición, lo que hizo el banco al atenderla. El registro crudo es una
 * pestaña secundaria, una línea por petición.
 */
import { Radio } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Empty, Seg, ViewHead } from "../../components/Common";
import type { ConsoleDataSource } from "../../data/source";
import { matchesAttempt, type ActivityQuery } from "../../lib/activityQuery";
import { KNOWN_DEVICES } from "../../lib/devices";
import { groupOf } from "../../lib/group";
import type { ConsoleState } from "../../state/store";
import { useRequestDetail } from "../../state/useRequestDetail";
import type { ConsoleNav, Derived } from "../SectionView";
import { AttemptRow } from "./AttemptRow";
import { Filters } from "./Filters";
import { RawLog } from "./RawLog";
import { RequestPanel } from "./RequestPanel";

type Tab = "intentos" | "registro";

const PAGE = 60;
/** Por debajo de este ancho el detalle queda debajo de la lista: al elegir, se lleva a la vista. */
const STACKED_QUERY = "(max-width: 1180px)";
const UNKNOWN_RANK = KNOWN_DEVICES.length;

const deviceRank = (device: string): number => {
  const i = KNOWN_DEVICES.indexOf(device);
  return i < 0 ? UNKNOWN_RANK : i;
};

interface ActividadProps {
  state: ConsoleState;
  derived: Derived;
  nav: ConsoleNav;
  query: ActivityQuery;
  selected: number | null;
  source: ConsoleDataSource;
}

function useExpanded(selectedKey: string | null): [ReadonlySet<string>, (key: string) => void] {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (selectedKey) setExpanded((current) => (current.has(selectedKey) ? current : new Set([...current, selectedKey])));
  }, [selectedKey]);
  const toggle = (key: string): void => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  return [expanded, toggle];
}

export function Actividad({ state, derived, nav, query, selected, source }: ActividadProps) {
  const [tab, setTab] = useState<Tab>("intentos");
  const [limit, setLimit] = useState(PAGE);
  const filtered = useMemo(() => derived.attempts.filter((a) => matchesAttempt(a, query)).reverse(), [derived.attempts, query]);
  const selectedAttempt = selected !== null ? derived.byRequest.get(selected) : undefined;
  const [expanded, toggle] = useExpanded(selectedAttempt?.key ?? null);
  const detail = useRequestDetail(source, selected);
  const choose = useCallback((id: number, reveal = true) => {
    nav.select(id);
    if (reveal && window.matchMedia(STACKED_QUERY).matches) requestAnimationFrame(() => document.querySelector(".rq")?.scrollIntoView({ block: "start" }));
  }, [nav]);
  const newest = filtered[0];
  useEffect(() => {
    if (selected === null && newest) nav.select(newest.requests[newest.requests.length - 1].id);
  }, [selected, newest, nav]);
  const devices = useMemo(() => [...new Set(derived.attempts.map((a) => a.device))].sort((a, b) => deviceRank(a) - deviceRank(b)), [derived.attempts]);
  const users = useMemo(() => [...new Set(derived.attempts.map((a) => a.user).filter((u): u is string => u !== null))].sort(), [derived.attempts]);
  const tabs = <Seg label="Vista" value={tab} onChange={setTab} options={[{ value: "intentos", label: "Intentos" }, { value: "registro", label: "Registro" }]} />;
  return (
    <>
      <ViewHead title="Actividad" tools={tabs}>¿Qué pasó con cada petición? Cada fila es un intento completo; elija una petición para ver lo que hizo el banco.</ViewHead>
      <Filters query={query} onQuery={nav.setQuery} devices={devices} users={users} shown={filtered.length} total={derived.attempts.length} />
      <div className="activity">
        <div className="panel activity-list">
          {!filtered.length ? (
            <Empty icon={Radio} title={derived.attempts.length ? "Ningún intento coincide" : "Todavía no hay actividad"}>
              {derived.attempts.length ? "Quite algún filtro para ver más." : "Inicie un acto en el Escenario: aquí aparece cada intento en cuanto llega al banco."}
            </Empty>
          ) : tab === "intentos" ? (
            <ul className="attempts">
              {filtered.slice(0, limit).map((a) => <AttemptRow key={a.key} attempt={a} open={expanded.has(a.key)} selected={selected} onToggle={toggle} onSelect={choose} />)}
            </ul>
          ) : (
            <RawLog requests={filtered.flatMap((a) => a.requests)} selected={selected} onSelect={choose} />
          )}
          {tab === "intentos" && filtered.length > limit ? <button type="button" className="more" onClick={() => setLimit(limit + PAGE)}>Mostrar {Math.min(PAGE, filtered.length - limit)} más</button> : null}
        </div>
        <RequestPanel detail={detail} attempt={selectedAttempt} group={groupOf(state.mechanisms ?? [])?.name ?? null} />
      </div>
    </>
  );
}
