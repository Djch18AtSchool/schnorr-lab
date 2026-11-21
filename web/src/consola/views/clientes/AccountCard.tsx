/** Una cuenta: lo único que guarda el banco, su estado, los dispositivos vistos y su actividad reciente. */
import { ArrowRight, Check, Copy, Lock } from "lucide-react";
import { useState } from "react";
import type { Account, RequestRecord } from "../../../shared/types";
import { Outcome } from "../../components/Common";
import { DeviceChip } from "../../components/Device";
import { linkUser } from "../../lib/activityQuery";
import type { Attempt } from "../../lib/attempts";
import { fmtClock, plural, rel, shortNum } from "../../lib/format";
import type { ConsoleNav } from "../SectionView";

const RECENT = 5;
const BODIES = 4;
const COPIED_MS = 1500;

interface AccountCardProps {
  account: Account;
  attempts: readonly Attempt[];
  bodies: readonly RequestRecord[];
  maxAttempts: number;
  now: number;
  nav: ConsoleNav;
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    }, () => setCopied(false));
  };
  return (
    <span className="copy">
      <code title={value}>{shortNum(value, 10)}</code>
      <button type="button" className="icon-btn sm" onClick={copy} aria-label="Copiar el valor completo" title={copied ? "Copiado" : "Copiar"}>
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
    </span>
  );
}

function Attempts({ left, max }: { left: number | null; max: number }) {
  if (left === null) return null;
  return (
    <span className="pips" title={`${left} de ${max} intentos antes de bloquear`}>
      {Array.from({ length: max }, (_, i) => <i key={i} className={i < left ? "" : "off"} />)}
      <span>{left} de {max} intentos</span>
    </span>
  );
}

function Recent({ attempts, user, nav }: { attempts: readonly Attempt[]; user: string; nav: ConsoleNav }) {
  if (!attempts.length) return <p className="muted">Sin actividad registrada desde que arrancó el banco.</p>;
  return (
    <ol className="recent">
      {attempts.map((a) => (
        <li key={a.key}>
          <button type="button" onClick={() => nav.openActivity(linkUser(user), a.requests[a.requests.length - 1].id)}>
            <time className="mono">{fmtClock(a.start)}</time>
            <span className="what">{a.title}</span>
            <span className="how"><DeviceChip device={a.device} compact /><Outcome tone={a.outcome.tone}>{a.outcome.label}</Outcome></span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** Dispositivo del último acceso concedido (si fue la laptop de Eve, se ve aquí mismo). */
function lastGrantedDevice(attempts: readonly Attempt[]): string | null {
  const granted = attempts.filter((a) => (a.kind === "interactivo" || a.kind === "no_interactivo") && a.outcome.tone === "ok");
  return granted.length ? granted[granted.length - 1].device : null;
}

export function AccountCard({ account, attempts, bodies, maxAttempts, now, nav }: AccountCardProps) {
  const locked = account.status === "bloqueada";
  const recent = attempts.slice(-RECENT).reverse();
  const lastDevice = lastGrantedDevice(attempts);
  return (
    <article className={`panel account${locked ? " locked" : ""}`}>
      <header className="account-h">
        <span className="avatar" aria-hidden="true">{account.user_id.slice(0, 1).toUpperCase()}</span>
        <div><h2>{account.user_id}</h2><span className="muted">mecanismo {account.mechanism}</span></div>
        <span className={`state ${locked ? "lock" : "on"}`}>{locked ? <><Lock aria-hidden="true" />Bloqueada</> : "Activa"}</span>
        <Attempts left={account.attempts_left} max={maxAttempts} />
      </header>
      <div className="account-b">
        <dl className="kv">
          <dt>Lo único que guarda</dt>
          <dd>{Object.entries(account.stored).map(([k, v]) => <span key={k} className="stored">{k} = <CopyValue value={v} /></span>)}</dd>
          <dt>Alta</dt><dd>{account.created_at ? `${fmtClock(account.created_at)} (${rel(account.created_at, now)})` : "antes de que arrancara la telemetría"}</dd>
          <dt>Último acceso</dt>
          <dd className="last-login">{account.last_login_at ? <>{fmtClock(account.last_login_at)} ({rel(account.last_login_at, now)}){lastDevice ? <> desde <DeviceChip device={lastDevice} compact /></> : null}</> : "nunca"}</dd>
          <dt>Dispositivos vistos</dt>
          <dd>{account.devices.length ? (
            <ul className="device-list">
              {account.devices.map((d) => (
                <li key={d.device}><DeviceChip device={d.device} /><span className="muted">{plural(d.requests, "petición", "peticiones")} · {rel(d.last_seen, now)}</span></li>
              ))}
            </ul>
          ) : "ninguno"}</dd>
        </dl>
        <section>
          <h3>Actividad reciente <button type="button" className="link" onClick={() => nav.openActivity(linkUser(account.user_id))}>Toda<ArrowRight aria-hidden="true" /></button></h3>
          <Recent attempts={recent} user={account.user_id} nav={nav} />
        </section>
        <section>
          <h3>Cuerpos recibidos a su nombre</h3>
          {bodies.length ? (
            <ol className="bodies-list">
              {bodies.slice(0, BODIES).map((r) => (
                <li key={r.id}><span className="mono p">{r.path}</span><code>{JSON.stringify(r.request_body)}</code></li>
              ))}
            </ol>
          ) : <p className="muted">Ninguno todavía.</p>}
        </section>
      </div>
    </article>
  );
}
