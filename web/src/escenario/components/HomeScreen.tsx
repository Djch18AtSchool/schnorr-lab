/** Cuenta de Ana en Banco Lab (datos ficticios en colones) con la notificación de ingreso. */
import { ArrowLeftRight, Bell, CircleCheck, CircleDollarSign, CircleUser, CreditCard, Ellipsis, House, Receipt, Smartphone, type LucideIcon } from "lucide-react";

const MOVEMENTS = [
  { label: "Supermercado La Esquina", when: "Hoy, 8:12", amount: "−₡18 450", income: false },
  { label: "Salario noviembre", when: "Ayer", amount: "+₡845 000", income: true },
  { label: "Recibo de electricidad", when: "18 nov.", amount: "−₡23 900", income: false },
] as const;

const ICON_STROKE = 1.8;

const QUICK: ReadonlyArray<{ label: string; icon: LucideIcon }> = [
  { label: "Transferir", icon: ArrowLeftRight },
  { label: "Pagar", icon: Receipt },
  { label: "Recargar", icon: Smartphone },
  { label: "Más", icon: Ellipsis },
];

const TABS: ReadonlyArray<{ label: string; icon: LucideIcon; current?: boolean }> = [
  { label: "Inicio", icon: House, current: true },
  { label: "Tarjetas", icon: CreditCard },
  { label: "Pagos", icon: CircleDollarSign },
  { label: "Perfil", icon: CircleUser },
];

function TabBar() {
  return (
    <div className="tabbar">
      {TABS.map(({ label, icon: TabIcon, current }) => (
        <div key={label} className={current ? "cur" : undefined}><TabIcon strokeWidth={ICON_STROKE} />{label}</div>
      ))}
    </div>
  );
}

export function HomeScreen({ active }: { active: boolean }) {
  return (
    <section className={`scr${active ? " active" : ""}`} aria-hidden={!active}>
      <div className="welcome-toast">
        <CircleCheck strokeWidth={2.2} />
        Ingreso verificado · Banco Lab
      </div>
      <div className="home-head">
        <div><div className="hi">Buenos días,</div><div className="nm">Ana Solano</div></div>
        <div className="bell"><Bell color="#3b4357" strokeWidth={ICON_STROKE} /></div>
      </div>
      <div className="acct">
        <div className="lbl">Cuenta de ahorros en colones</div>
        <div className="bal">₡1 284 650,00</div>
        <div className="num">CR21 0152 0200 1026 4821</div>
      </div>
      <div className="quick">
        {QUICK.map(({ label, icon: QuickIcon }) => (
          <div key={label}><span><QuickIcon strokeWidth={ICON_STROKE} /></span>{label}</div>
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
