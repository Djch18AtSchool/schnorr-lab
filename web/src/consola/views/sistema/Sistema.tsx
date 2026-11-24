/** Sistema: ¿con qué parámetros y rutas funciona el banco? Grupo activo, mecanismos y la API. */
import { Check, CircleAlert, ExternalLink, X } from "lucide-react";
import type { ReactNode } from "react";
import type { BankMechanism } from "../../../shared/types";
import { CodeText, PanelHead, Unavailable, ViewHead } from "../../components/Common";
import type { ApiRoutes } from "../../data/source";
import { plural, shortNum } from "../../lib/format";
import { checkGroup, groupOf, isToyGroup, type GroupInfo } from "../../lib/group";
import type { ConsoleState } from "../../state/store";

function CheckItem({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <li className={ok ? "ok" : "bad"}>{ok ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}<span>{children}</span></li>;
}

function GroupPanel({ group }: { group: GroupInfo }) {
  const checks = checkGroup(group);
  return (
    <div className="panel">
      <PanelHead title={`Grupo activo: ${group.name}`}><span className="muted">{group.bits} bits de p · {group.qBits || "?"} de q</span></PanelHead>
      <div className="pb stack">
        <dl className="kv">
          <dt>p {checks.safePrime ? "(primo seguro)" : "(primo)"}</dt><dd title={group.p}>{shortNum(group.p, 16)}</dd>
          <dt>q, orden del subgrupo</dt><dd title={group.q}>{shortNum(group.q, 16)}</dd>
          <dt>g, generador</dt><dd title={group.g}>{shortNum(group.g, 16)}</dd>
          <dt>Intentos antes de bloquear</dt><dd>{group.maxAttempts}</dd>
        </dl>
        <ul className="checks">
          <CheckItem ok={checks.safePrime || checks.qDividesP1}>{checks.safePrime ? "p = 2q + 1" : "q divide a p − 1"}</CheckItem>
          <CheckItem ok={checks.generatorOrder}>g<sup>q</sup> ≡ 1 (mod p) y g ≠ 1</CheckItem>
        </ul>
        <p className="muted">Comprobado en este navegador con BigInt; la primalidad la verifica el banco al arrancar.</p>
        {isToyGroup(group) ? (
          <div className="warnbox"><CircleAlert aria-hidden="true" />
            <span>Grupo de ejemplo del escrito: con q = {group.q} hay {group.q} retos posibles y un impostor acierta con probabilidad 1/{group.q}. Para una demostración realista, arranque el laboratorio con <code>--group rfc-2048</code>.</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Mechanisms({ mechanisms }: { mechanisms: readonly BankMechanism[] }) {
  return (
    <div className="panel">
      <PanelHead title="Mecanismos registrados"><span className="muted">{plural(mechanisms.length, "mecanismo", "mecanismos")}</span></PanelHead>
      <ul className="mechs">
        {mechanisms.map((m) => (
          <li key={m.id}>
            <b>{m.name}</b> <span className="muted mono">/{m.id}</span>
            <p><CodeText text={m.summary} /></p>
            <span className="muted">Flujos: {m.flows.map((f) => f.title).join(", ") || "ninguno"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Routes({ routes, simulated }: { routes: ApiRoutes; simulated: boolean }) {
  const tags = [...new Set(routes.routes.map((r) => r.tag))];
  return (
    <div className="panel">
      <PanelHead title="Rutas de la API">
        {simulated ? <span className="muted">lista conocida (simulación)</span>
          : <a className="link" href="/docs" target="_blank" rel="noopener">Probar en Swagger<ExternalLink aria-hidden="true" /></a>}
      </PanelHead>
      <div className="tablewrap">
        <table className="t routes">
          <thead><tr><th>Método</th><th>Ruta</th><th>Qué hace</th></tr></thead>
          {tags.map((tag) => (
            <tbody key={tag}>
              <tr className="tag-row"><th colSpan={3}>{tag}</th></tr>
              {routes.routes.filter((r) => r.tag === tag).map((r) => (
                <tr key={`${r.method} ${r.path}`}><td><span className={`m ${r.method}`}>{r.method}</span></td><td className="mono">{r.path}</td><td className="sum">{r.summary}</td></tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      {routes.origin === "respaldo" && !simulated ? <p className="pb muted">No se pudo leer /openapi.json: se muestra la lista conocida.</p> : null}
    </div>
  );
}

export function Sistema({ state, simulated }: { state: ConsoleState; simulated: boolean }) {
  const group = groupOf(state.mechanisms ?? []);
  return (
    <>
      <ViewHead title="Sistema" />
      <div className="two">
        {group ? <GroupPanel group={group} /> : <Unavailable what="El grupo activo (GET /mechanisms)" error={state.errors.mechanisms} />}
        {state.mechanisms ? <Mechanisms mechanisms={state.mechanisms} /> : null}
      </div>
      {state.routes ? <Routes routes={state.routes} simulated={simulated} /> : null}
    </>
  );
}
