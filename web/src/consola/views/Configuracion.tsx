/** Sección Configuración: grupo activo (con comprobaciones en el navegador), políticas, grupos y mecanismos. */
import { Check, CircleAlert, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { BankMechanism } from "../../shared/types";
import { PanelHead, Unavailable, ViewHead } from "../components/Common";
import type { LabResults } from "../data/source";
import { latencyGroups } from "../lib/charts";
import { shortNum } from "../lib/format";
import { checkGroup, isToyGroup, type GroupInfo } from "../lib/group";

const ARM_MS = 4000;

interface ConfigProps {
  group: GroupInfo | null;
  mechanisms: readonly BankMechanism[] | null;
  mechanismsError: string | undefined;
  results: LabResults | null;
  onReset: () => Promise<void>;
}

function ResetButton({ onReset }: { onReset: () => Promise<void> }) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const click = (): void => {
    if (timer.current) clearTimeout(timer.current);
    if (!armed) {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), ARM_MS);
      return;
    }
    setArmed(false);
    setError(null);
    onReset().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };
  return (
    <>
      {error ? <span className="badc" role="alert">No se pudo reiniciar: {error}</span> : null}
      <button type="button" className={`btn danger${armed ? " armed" : ""}`} onClick={click}>
        <RotateCcw className="i" aria-hidden="true" /><span>{armed ? "Confirmar: borra usuarios y auditoría" : "Reiniciar banco"}</span>
      </button>
    </>
  );
}

function GroupPanel({ group }: { group: GroupInfo }) {
  const checks = checkGroup(group);
  const toy = isToyGroup(group);
  return (
    <div className="panel">
      <PanelHead title={`Grupo activo: ${group.name}`}><span className="muted">GET /mechanisms</span></PanelHead>
      <div className="pb" style={{ display: "grid", gap: 14 }}>
        <dl className="kv">
          <dt>p {checks.safePrime ? "(primo seguro)" : "(primo)"}</dt><dd title={group.p}>{shortNum(group.p, 16)}</dd>
          <dt>{checks.safePrime ? "q = (p − 1) / 2" : "q (divide a p − 1)"}</dt><dd title={group.q}>{shortNum(group.q, 16)}</dd>
          <dt>g (genera el subgrupo de orden q)</dt><dd title={group.g}>{shortNum(group.g, 16)}</dd>
          <dt>Bits de p / de q</dt><dd>{group.bits} / {group.qBits || "?"}</dd>
        </dl>
        <ul className="checks">
          <li className={checks.safePrime || checks.qDividesP1 ? "" : "bad"}><Check className="i" aria-hidden="true" /><span>{checks.safePrime ? "p = 2q + 1" : checks.qDividesP1 ? "q divide a p − 1" : "q no divide a p − 1"}</span></li>
          <li className={checks.generatorOrder ? "" : "bad"}><Check className="i" aria-hidden="true" /><span>g<sup>q</sup> ≡ 1 (mod p) y g ≠ 1</span></li>
          <li className="faint"><span>Comprobado en este navegador con BigInt; la primalidad la verifica el banco al arrancar (core/params.py).</span></li>
        </ul>
        {toy ? (
          <div className="warnbox"><CircleAlert className="i" aria-hidden="true" style={{ flex: "none", marginTop: 2 }} />
            <span>Grupo de ejemplo, solo para aprender: con q = {group.q} hay {group.q} retos posibles y un impostor acierta con probabilidad 1/{group.q}. Para una demostración realista reinicia con rfc-2048 o schnorr-2048.</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Policies({ maxAttempts }: { maxAttempts: number }) {
  return (
    <div className="panel">
      <PanelHead title="Políticas del verificador"><span className="muted">protocol/bank.py</span></PanelHead>
      <div className="pb">
        <dl className="kv prose">
          <dt>Intentos antes de bloquear</dt><dd>{maxAttempts} (se reinician al acceder)</dd>
          <dt>Reto c</dt><dd>secrets.randbelow(q), uno por sesión</dd>
          <dt>Sesión</dt><dd>un solo uso; se consume al verificar</dd>
          <dt>Sesión pendiente descartada</dt><dd>cuenta como intento fallido</dd>
          <dt>Ventana de m (Fiat-Shamir)</dt><dd>30 s</dd>
          <dt>Pruebas no interactivas repetidas</dt><dd>se rechazan por el par (t, s)</dd>
          <dt>Orígenes CORS</dt><dd>http://127.0.0.1:8001, http://localhost:8001</dd>
        </dl>
      </div>
    </div>
  );
}

const FAMILY: Readonly<Record<string, string>> = { schnorr: "Schnorr", rfc: "RFC 3526", ffdhe: "RFC 7919", safe: "primo seguro" };

function GroupsTable({ results, active }: { results: LabResults | null; active: string }) {
  const groups = results?.latency ? latencyGroups(results.latency) : [];
  const isActive = (name: string): boolean => active === name || active.startsWith(`${name}-`);
  return (
    <div className="panel">
      <PanelHead title="Grupos disponibles"><span className="muted">el cambio se aplica con POST /lab/reset y borra usuarios y sesiones</span></PanelHead>
      <div className="tablewrap"><table className="t">
        <thead><tr><th>Grupo</th><th>Familia</th><th className="r">bits p</th><th className="r">bits q</th><th>Seguridad (bits)</th><th className="r">Inicio completo (gmpy2)</th><th className="r">Inicio completo (propia)</th><th /></tr></thead>
        <tbody>
          <tr className={isActive("toy") ? "active" : ""}><td className="mono">toy (toy-23)</td><td>ejemplo</td><td className="r mono">5</td><td className="r mono">4</td><td className="mono">ninguna</td><td className="r mono">&lt; 0.01 ms</td><td className="r mono">&lt; 0.01 ms</td><td>{isActive("toy") ? <span className="state on">activo</span> : null}</td></tr>
          {groups.map((g) => (
            <tr key={g.name} className={isActive(g.name) ? "active" : ""}>
              <td className="mono">{g.name}</td><td>{FAMILY[g.family] ?? g.family}</td><td className="r mono">{g.bitsP}</td><td className="r mono">{g.bitsQ}</td><td className="mono">{g.security}</td>
              <td className="r mono">{g.ms.gmpy2 != null ? `${g.ms.gmpy2.toFixed(2)} ms` : "–"}</td><td className="r mono">{g.ms.propia != null ? `${g.ms.propia.toFixed(2)} ms` : "–"}</td>
              <td>{isActive(g.name) ? <span className="state on">activo</span> : null}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}

function Mechanisms({ mechanisms }: { mechanisms: readonly BankMechanism[] }) {
  return (
    <div className="panel">
      <PanelHead title="Mecanismos registrados"><span className="muted">GET /mechanisms</span></PanelHead>
      <div className="pb mechs">
        {mechanisms.map((m) => (
          <div className="mech" key={m.id}>
            <h3>{m.name}<span className="state on"><Check className="i" aria-hidden="true" />activo</span></h3>
            <span className="muted mono" style={{ fontSize: 12 }}>id: {m.id} · prefijo /{m.id}</span>
            <ul>
              <li>Flujos: {m.flows.map((f) => f.title).join(", ") || "ninguno"}</li>
              {m.summary ? <li>{m.summary}</li> : null}
            </ul>
          </div>
        ))}
        <div className="mech empty">
          <h3>Espacio para otro mecanismo</h3>
          <span style={{ fontSize: 12.5 }}>El servidor es agnóstico al mecanismo: cada uno registra sus rutas, lo que guarda y sus flujos en <span className="mono">mechanisms/</span>, y aparece aquí, en la API y en la auditoría sin tocar la consola.</span>
        </div>
      </div>
    </div>
  );
}

export function Configuracion({ group, mechanisms, mechanismsError, results, onReset }: ConfigProps) {
  return (
    <>
      <ViewHead title="Configuración" tools={<ResetButton onReset={onReset} />}>Parámetros públicos del grupo activo, mecanismos registrados y políticas del verificador.</ViewHead>
      <div className="two">
        {group ? <GroupPanel group={group} /> : <Unavailable what="El grupo activo" error={mechanismsError} />}
        <Policies maxAttempts={group?.maxAttempts ?? 3} />
      </div>
      <GroupsTable results={results} active={group?.name ?? ""} />
      {mechanisms ? <Mechanisms mechanisms={mechanisms} /> : null}
    </>
  );
}
