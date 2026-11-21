/** Cuenta de Ana en Banco Lab (datos ficticios en colones) con la notificación de ingreso. */

const MOVEMENTS = [
  { label: "Supermercado La Esquina", when: "Hoy, 8:12", amount: "−₡18 450", income: false },
  { label: "Salario noviembre", when: "Ayer", amount: "+₡845 000", income: true },
  { label: "Recibo de electricidad", when: "18 nov.", amount: "−₡23 900", income: false },
] as const;

const QUICK = ["Transferir", "Pagar", "Recargar", "Más"] as const;

function QuickIcon({ label }: { label: (typeof QUICK)[number] }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, "aria-hidden": true };
  if (label === "Transferir") return <svg {...common} strokeLinejoin="round"><path d="M4 8h14l-3-3M20 16H6l3 3" /></svg>;
  if (label === "Pagar") return <svg {...common}><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 10h8M8 14h5" /></svg>;
  if (label === "Recargar") return <svg {...common}><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18h2" /></svg>;
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="6" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18" cy="12" r="1.6" /></svg>;
}

function TabBar() {
  return (
    <div className="tabbar">
      <div className="cur"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z" /></svg>Inicio</div>
      <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /></svg>Tarjetas</div>
      <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 4v16M8 8h6a2.5 2.5 0 0 1 0 5h-4a2.5 2.5 0 0 0 0 5h6" /></svg>Pagos</div>
      <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="9" r="4" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>Perfil</div>
    </div>
  );
}

export function HomeScreen({ active }: { active: boolean }) {
  return (
    <section className={`scr${active ? " active" : ""}`} aria-hidden={!active}>
      <div className="welcome-toast">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 12.5l4 4 8-9" /></svg>
        Ingreso verificado · Banco Lab
      </div>
      <div className="home-head">
        <div><div className="hi">Buenos días,</div><div className="nm">Ana Solano</div></div>
        <div className="bell"><svg viewBox="0 0 24 24" fill="none" stroke="#3b4357" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" /></svg></div>
      </div>
      <div className="acct">
        <div className="lbl">Cuenta de ahorros en colones</div>
        <div className="bal">₡1 284 650,00</div>
        <div className="num">CR21 0152 0200 1026 4821</div>
      </div>
      <div className="quick">
        {QUICK.map((label) => (
          <div key={label}><span><QuickIcon label={label} /></span>{label}</div>
        ))}
      </div>
      <div className="mov-h">Movimientos <span>Ver todos</span></div>
      <div className="mov">
        {MOVEMENTS.map((m) => (
          <div key={m.label}>
            <span>{m.label}<small>{m.when}</small></span>
            <b className={m.income ? "in" : undefined}>{m.amount}</b>
          </div>
        ))}
      </div>
      <TabBar />
    </section>
  );
}
