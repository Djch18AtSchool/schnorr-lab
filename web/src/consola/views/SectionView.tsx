/** La sección activa con los datos que necesita cada una. */
import type { RequestRecord } from "../../shared/types";
import type { ConsoleDataSource } from "../data/source";
import type { ActivityQuery } from "../lib/activityQuery";
import type { Attempt } from "../lib/attempts";
import type { RangeKey } from "../lib/timeline";
import type { Section } from "../state/sections";
import type { ConsoleState } from "../state/store";
import { Actividad } from "./actividad/Actividad";
import { Clientes } from "./clientes/Clientes";
import { Laboratorio } from "./laboratorio/Laboratorio";
import { Pruebas } from "./pruebas/Pruebas";
import { Resumen } from "./resumen/Resumen";
import { Seguridad } from "./seguridad/Seguridad";
import { Sistema } from "./sistema/Sistema";

/** Lo que se calcula una vez con las peticiones y comparten varias secciones. */
export interface Derived {
  attempts: readonly Attempt[];
  byRequest: ReadonlyMap<number, Attempt>;
  requestsById: ReadonlyMap<number, RequestRecord>;
}

export interface ConsoleNav {
  go: (section: Section) => void;
  /** Abre Actividad con un filtro (y opcionalmente una petición elegida). */
  openActivity: (query: ActivityQuery, select?: number | null) => void;
  /** Abre una petición en Actividad, sin filtros. */
  openRequest: (id: number) => void;
  setQuery: (query: ActivityQuery) => void;
  select: (id: number | null) => void;
}

export interface SectionViewProps {
  section: Section;
  state: ConsoleState;
  derived: Derived;
  now: number;
  simulated: boolean;
  source: ConsoleDataSource;
  nav: ConsoleNav;
  query: ActivityQuery;
  selected: number | null;
  range: RangeKey;
  onRange: (range: RangeKey) => void;
}

export function SectionView(p: SectionViewProps) {
  const { state, derived, now, nav } = p;
  switch (p.section) {
    case "resumen":
      return <Resumen state={state} derived={derived} now={now} nav={nav} range={p.range} onRange={p.onRange} />;
    case "actividad":
      return <Actividad state={state} derived={derived} nav={nav} query={p.query} selected={p.selected} source={p.source} />;
    case "seguridad":
      return <Seguridad state={state} derived={derived} nav={nav} />;
    case "clientes":
      return <Clientes state={state} derived={derived} now={now} nav={nav} />;
    case "laboratorio":
      return <Laboratorio results={state.results} resultsError={state.errors.results} simulated={p.simulated} />;
    case "pruebas":
      return <Pruebas tests={state.tests} testsError={state.errors.tests} />;
    case "sistema":
      return <Sistema state={state} simulated={p.simulated} />;
  }
}
