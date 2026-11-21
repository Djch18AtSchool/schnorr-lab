/** Sección Usuarios: todo lo que el banco guarda de cada cliente (id y clave pública y). */
import type { Account, RequestRecord } from "../../shared/types";
import { Fact, PanelHead, Unavailable, ViewHead } from "../components/Common";
import { Icon } from "../components/Icons";
import { JsonView } from "../components/JsonView";
import { fmtClock, rel, shortNum } from "../lib/format";
import { outcomeOf } from "../lib/requests";

interface UsuariosProps {
  accounts: readonly Account[] | null;
  error: string | undefined;
  requests: readonly RequestRecord[];
  users: ReadonlyMap<number, string>;
  maxAttempts: number;
  now: number;
  onTraffic: (user: string) => void;
}

function Attempts({ left, max }: { left: number | null; max: number }) {
  if (left == null) return <span className="faint">—</span>;
  return (
    <>
      <span className={`pips${left < max ? " low" : ""}`} title={`${left} de ${max} intentos`}>
        {Array.from({ length: max }, (_, i) => <i key={i} className={i < left ? "" : "off"} />)}
      </span>{" "}
      <span className="mono faint" style={{ fontSize: 12 }}>{left}/{max}</span>
    </>
  );
}

/** Lo guardado por mecanismo y usuario, con la misma forma que GET /bank/users. */
const storedView = (accounts: readonly Account[]): Record<string, Record<string, Record<string, string>>> =>
  accounts.reduce<Record<string, Record<string, Record<string, string>>>>(
    (acc, a) => ({ ...acc, [a.mechanism]: { ...(acc[a.mechanism] ?? {}), [a.user_id]: a.stored } }), {});

function AccountRow({ a, logins, maxAttempts, now, onTraffic }: { a: Account; logins: number; maxAttempts: number; now: number; onTraffic: (user: string) => void }) {
  const y = a.stored.y ?? Object.values(a.stored)[0] ?? "";
  return (
    <tr>
      <td><b style={{ fontWeight: 550 }}>{a.user_id}</b></td>
      <td className="mono" title={y}>{shortNum(y, 8)}</td>
      <td><span className="tag">{a.mechanism}</span></td>
      <td className="mono">{a.created_at ? fmtClock(a.created_at) : "—"}</td>
      <td>{a.last_login_at ? <span title={fmtClock(a.last_login_at)}>{rel(a.last_login_at, now)}</span> : <span className="faint">nunca</span>}</td>
      <td className="r mono">{logins}</td>
      <td><Attempts left={a.attempts_left} max={maxAttempts} /></td>
      <td>{a.status === "bloqueada" ? <span className="state lock"><Icon name="lock" />Bloqueada</span> : <span className="state on">Activa</span>}</td>
      <td><button type="button" className="linkbtn" onClick={() => onTraffic(a.user_id)}>Ver tráfico</button></td>
    </tr>
  );
}

export function Usuarios({ accounts, error, requests, users, maxAttempts, now, onTraffic }: UsuariosProps) {
  const intro = "Esto es todo lo que el banco guarda de cada cliente: un identificador y su clave pública y. Ni x, ni r, ni contraseñas.";
  if (!accounts) return <><ViewHead title="Usuarios">{intro}</ViewHead><Unavailable what="La lista de cuentas" error={error} /></>;
  const logins = requests.filter((r) => outcomeOf(r) === "granted").reduce<Record<string, number>>((acc, r) => {
    const user = users.get(r.id);
    return user ? { ...acc, [user]: (acc[user] ?? 0) + 1 } : acc;
  }, {});
  const fields = [...new Set(accounts.flatMap((a) => Object.keys(a.stored)))];
  const secrets = accounts.filter((a) => Object.keys(a.stored).some((k) => k === "x" || k === "r" || k.includes("password"))).length;
  return (
    <>
      <ViewHead title="Usuarios">{intro}</ViewHead>
      <div className="panel facts">
        <Fact label="Usuarios registrados" value={accounts.length} />
        <Fact label="Cuentas bloqueadas" value={accounts.filter((a) => a.status === "bloqueada").length} />
        <Fact label="Campos guardados por usuario" value={fields.length}><div className="fields">{fields.map((f) => <code key={f}>{f}</code>)}</div></Fact>
        <Fact label="Secretos guardados" value={secrets} tone={secrets ? undefined : "ok"}><span className="muted" style={{ fontSize: 12 }}>x vive solo en cada celular</span></Fact>
      </div>
      <div className="users-grid">
        <div className="panel">
          <div className="tablewrap">
            <table className="t">
              <thead><tr><th>Usuario</th><th>Clave pública y</th><th>Mecanismo</th><th>Alta</th><th>Último acceso</th><th className="r" title="Accesos concedidos que la consola tiene en memoria">Accesos</th><th>Intentos</th><th>Estado</th><th /></tr></thead>
              <tbody>{accounts.map((a) => <AccountRow key={`${a.mechanism}:${a.user_id}`} a={a} logins={logins[a.user_id] ?? 0} maxAttempts={maxAttempts} now={now} onTraffic={onTraffic} />)}</tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <PanelHead title="Lo que guarda el banco"><span className="muted">campo stored de GET /bank/accounts</span></PanelHead>
          <div className="pb"><JsonView value={storedView(accounts)} /></div>
        </div>
      </div>
    </>
  );
}
