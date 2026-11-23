/** Seguridad: ¿quién está atacando y cómo? Alertas por origen, con su evidencia, y lo que hizo soporte. */
import { Headset, ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import { Empty, PanelHead, ViewHead } from "../../components/Common";
import { fmtClock, plural } from "../../lib/format";
import { alertsByOrigin } from "../../lib/security";
import { supportActions, type SupportAction } from "../../lib/stats";
import type { ConsoleState } from "../../state/store";
import type { ConsoleNav, Derived } from "../SectionView";
import { OriginCard } from "./OriginCard";

interface SeguridadProps {
  state: ConsoleState;
  derived: Derived;
  nav: ConsoleNav;
}

const ACTION_TEXT: Readonly<Record<SupportAction["action"], string>> = { unlock: "desbloqueó la cuenta de", remove: "dio de baja la cuenta de" };

function SupportCard({ actions, nav }: { actions: readonly SupportAction[]; nav: ConsoleNav }) {
  return (
    <aside className="panel support">
      <PanelHead title="Acciones de soporte"><span className="muted">{actions.length ? plural(actions.length, "acción", "acciones") : ""}</span></PanelHead>
      {actions.length ? (
        <ol className="support-list">
          {actions.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => nav.openRequest(a.id)}>
                <Headset aria-hidden="true" />
                <span>Soporte {ACTION_TEXT[a.action]} <b>{a.user}</b></span>
                <time className="mono">{fmtClock(a.timestamp)}</time>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <Empty icon={Headset} title="Sin intervenciones">Cuando una cuenta queda bloqueada, soporte la desbloquea antes del acto siguiente; aparecerá aquí.</Empty>
      )}
    </aside>
  );
}

export function Seguridad({ state, derived, nav }: SeguridadProps) {
  const groups = useMemo(() => alertsByOrigin(state.alerts, derived.requestsById), [state.alerts, derived.requestsById]);
  const actions = useMemo(() => [...supportActions(state.requests)].reverse(), [state.requests]);
  const users = [...new Set(groups.flatMap((g) => g.users))];
  return (
    <>
      <ViewHead title="Seguridad" />
      {groups.length ? (
        <p className="lede">
          {plural(state.alerts.length, "alerta", "alertas")} de {plural(groups.length, "origen", "orígenes")}
          {users.length ? <> · {users.length === 1 ? "cuenta afectada" : "cuentas afectadas"}: <b>{users.join(", ")}</b></> : null}
        </p>
      ) : null}
      <div className="security">
        <div className="origins">
          {groups.length ? groups.map((g) => <OriginCard key={g.key} group={g} byId={derived.requestsById} nav={nav} />) : (
            <div className="panel"><Empty icon={ShieldCheck} title="Ningún ataque detectado">Los actos de Eve en el Escenario (repetir una respuesta, hacerse pasar por Ana) producen alertas que aparecen aquí con su evidencia.</Empty></div>
          )}
        </div>
        <SupportCard actions={actions} nav={nav} />
      </div>
    </>
  );
}
