/** Navegación lateral: 8 secciones con atajos 1–8, alertas sin ver y el grupo activo. */
import type { MouseEvent } from "react";
import type { GroupInfo } from "../lib/group";
import { shortNum } from "../lib/format";
import { SECTIONS, type Section } from "../state/sections";
import { Icon } from "./Icons";

interface SideNavProps {
  current: Section;
  onGo: (section: Section) => void;
  unseenAlerts: number;
  group: GroupInfo | null;
  simulated: boolean;
}

export function SideNav({ current, onGo, unseenAlerts, group, simulated }: SideNavProps) {
  const click = (section: Section) => (event: MouseEvent) => {
    event.preventDefault();
    onGo(section);
  };
  const otherSource = simulated ? "?" : "?fuente=simulada";
  return (
    <nav className="side" aria-label="Secciones">
      {SECTIONS.map((s, i) => (
        <div key={s.id} style={{ display: "contents" }}>
          {i > 0 && s.group !== SECTIONS[i - 1].group ? <div className="grp">Sistema</div> : null}
          <a className="nav" href={`#${s.id}`} aria-current={current === s.id ? "page" : undefined} onClick={click(s.id)}>
            <Icon name={s.icon} />{s.title}
            {s.id === "resumen" && unseenAlerts > 0 && current !== "resumen" ? <span className="badge" title="Alertas sin ver">{unseenAlerts}</span> : null}
            <span className="key">{i + 1}</span>
          </a>
        </div>
      ))}
      <div className="foot">
        <div className="groupchip">
          <span>Grupo activo</span>
          <b>{group ? `${group.name} · ${group.bits} bits` : "—"}</b>
          <span>{group ? `p = ${shortNum(group.p, 4)}, q = ${shortNum(group.q, 4)}, g = ${shortNum(group.g, 4)}` : "sin datos de /mechanisms"}</span>
        </div>
        <div>Atajos: 1–8 secciones, P pausa, / buscar</div>
        <div className="sketch">
          <span>Fuente: {simulated ? "simulada" : "banco"}</span>
          <a href={`${otherSource}${window.location.hash}`} title={simulated ? "Leer el banco real de este origen" : "Abrir la Consola con datos simulados"}>cambiar</a>
        </div>
      </div>
    </nav>
  );
}
