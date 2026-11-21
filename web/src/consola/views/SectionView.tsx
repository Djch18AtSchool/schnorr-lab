/** La sección activa con los datos que necesita cada una. */
import type { RefObject } from "react";
import type { RequestRecord } from "../../shared/types";
import type { GroupInfo } from "../lib/group";
import type { TrafficQuery } from "../lib/requests";
import type { Section } from "../state/sections";
import type { ConsoleState } from "../state/store";
import type { AlertsUi } from "../state/useAlertsUi";
import { Api } from "./Api";
import { Auditoria } from "./Auditoria";
import { Configuracion } from "./Configuracion";
import { Laboratorio } from "./laboratorio/Laboratorio";
import { Logs } from "./Logs";
import { Resumen } from "./resumen/Resumen";
import { Trafico } from "./trafico/Trafico";
import { Usuarios } from "./Usuarios";

export interface SectionViewProps {
  section: Section;
  state: ConsoleState;
  now: number;
  simulated: boolean;
  group: GroupInfo | null;
  users: ReadonlyMap<number, string>;
  requestsById: ReadonlyMap<number, RequestRecord>;
  alertsUi: AlertsUi;
  query: TrafficQuery;
  onQuery: (query: TrafficQuery) => void;
  selected: number | null;
  onSelect: (id: number) => void;
  onOpenRequest: (id: number) => void;
  onUserTraffic: (user: string) => void;
  onReset: () => Promise<void>;
  trafficSearch: RefObject<HTMLInputElement | null>;
  logSearch: RefObject<HTMLInputElement | null>;
}

export function SectionView(p: SectionViewProps) {
  const { state, now } = p;
  switch (p.section) {
    case "resumen":
      return <Resumen state={state} now={now} requestsById={p.requestsById} openAlert={p.alertsUi.openAlert} freshAlerts={p.alertsUi.fresh}
        onToggleAlert={p.alertsUi.toggleAlert} onOpenRequest={p.onOpenRequest} />;
    case "trafico":
      return <Trafico state={state} now={now} users={p.users} group={p.group} query={p.query} onQuery={p.onQuery}
        selected={p.selected} onSelect={p.onSelect} searchRef={p.trafficSearch} />;
    case "logs":
      return <Logs events={state.events} startedAt={state.summary?.started_at ?? null} searchRef={p.logSearch} />;
    case "usuarios":
      return <Usuarios accounts={state.accounts} error={state.errors.accounts} requests={state.requests} users={p.users}
        maxAttempts={p.group?.maxAttempts ?? 3} now={now} onTraffic={p.onUserTraffic} />;
    case "auditoria":
      return <Auditoria entries={state.audit} error={state.errors.audit} requests={state.requests} onOpenRequest={p.onOpenRequest} />;
    case "laboratorio":
      return <Laboratorio results={state.results} resultsError={state.errors.results} tests={state.tests} testsError={state.errors.tests} />;
    case "api":
      return <Api routes={state.routes} stats={state.summary?.routes ?? []} requests={state.requests} now={now} simulated={p.simulated} />;
    case "configuracion":
      return <Configuracion group={p.group} mechanisms={state.mechanisms} mechanismsError={state.errors.mechanisms} results={state.results} onReset={p.onReset} />;
  }
}
