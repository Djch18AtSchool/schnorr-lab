/** Clientes: ¿qué sabe el banco de cada cliente? Cuentas, dispositivos, actividad y la auditoría de cuerpos. */
import { ShieldCheck, ShieldX, UserPlus } from "lucide-react";
import { useMemo } from "react";
import type { AuditEntry } from "../../../shared/types";
import { Empty, Unavailable, ViewHead } from "../../components/Common";
import type { Attempt } from "../../lib/attempts";
import { auditFacts, bodiesFor } from "../../lib/audit";
import { DEFAULT_MAX_ATTEMPTS, groupOf } from "../../lib/group";
import type { ConsoleState } from "../../state/store";
import type { ConsoleNav, Derived } from "../SectionView";
import { AccountCard } from "./AccountCard";

interface ClientesProps {
  state: ConsoleState;
  derived: Derived;
  now: number;
  nav: ConsoleNav;
}

/** La comprobación global: qué campos llegaron alguna vez al banco y si x estuvo entre ellos. */
function AuditCheck({ audit, error }: { audit: readonly AuditEntry[] | null; error: string | undefined }) {
  if (!audit) return <Unavailable what="La auditoría (GET /audit/log)" error={error} />;
  const facts = auditFacts(audit);
  const safe = facts.withSecret === 0;
  return (
    <div className={`panel audit-check ${safe ? "ok" : "bad"}`}>
      {safe ? <ShieldCheck aria-hidden="true" /> : <ShieldX aria-hidden="true" />}
      <div>
        <b>{safe ? "x nunca llegó al banco." : `x llegó en ${facts.withSecret} cuerpos.`}</b>
        <p>
          El banco auditó {facts.total} cuerpos del protocolo{facts.invalid ? ` (${facts.invalid} mal formados)` : ""}. Campos vistos:{" "}
          {facts.fields.length ? facts.fields.map((f) => <code key={f}>{f}</code>) : "ninguno"} — <span className={safe ? "ok" : "bad"}>x: {safe ? "nunca" : "sí"}</span>.
        </p>
      </div>
    </div>
  );
}

export function Clientes({ state, derived, now, nav }: ClientesProps) {
  const maxAttempts = groupOf(state.mechanisms ?? [])?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const byUser = useMemo(() => {
    const map = new Map<string, Attempt[]>();
    derived.attempts.forEach((a) => { if (a.user) map.set(a.user, [...(map.get(a.user) ?? []), a]); });
    return map;
  }, [derived.attempts]);
  return (
    <>
      <ViewHead title="Clientes" />
      <AuditCheck audit={state.audit} error={state.errors.audit} />
      {!state.accounts ? <Unavailable what="Las cuentas (GET /bank/accounts)" error={state.errors.accounts} /> : null}
      {state.accounts && !state.accounts.length ? (
        <div className="panel"><Empty icon={UserPlus} title="Ninguna cuenta registrada">Inicie el acto «Registro» en el Escenario: el celular de Ana envía solo y, y la cuenta aparece aquí.</Empty></div>
      ) : null}
      <div className="accounts">
        {(state.accounts ?? []).map((a) => (
          <AccountCard key={`${a.mechanism}:${a.user_id}`} account={a} attempts={byUser.get(a.user_id) ?? []} bodies={bodiesFor(a.user_id, state.requests)}
            maxAttempts={maxAttempts} now={now} nav={nav} />
        ))}
      </div>
    </>
  );
}
