/** Navegación lateral: 9 secciones con atajos 1–9, alertas sin ver y el grupo activo. */
import type { MouseEvent } from "react";
import type { GroupInfo } from "../lib/group";
import { shortNum } from "../lib/format";
import { SECTIONS, type Section } from "../state/sections";

interface SideNavProps {
  current: Section;
  onGo: (section: Section) => void;
  unseenAlerts: number;
  group: GroupInfo | null;
}

export function SideNav({ current, onGo, unseenAlerts, group }: SideNavProps) {
  const click = (section: Section) => (event: MouseEvent) => {
    event.preventDefault();
    onGo(section);
  };
  return (
    <nav className="side" aria-label="Secciones">
      {SECTIONS.map((s, i) => (
        <div key={s.id} style={{ display: "contents" }}>
          {i > 0 && s.group !== SECTIONS[i - 1].group ? <div className="grp">Sistema</div> : null}
          <a className="nav" href={`#${s.id}`} aria-current={current === s.id ? "page" : undefined} onClick={click(s.id)} title={`${s.title} (tecla ${i + 1})`}>
            <s.icon className="i" aria-hidden="true" />{s.title}
            {s.id === "resumen" && unseenAlerts > 0 && current !== "resumen" ? <span className="badge" title="Alertas sin ver">{unseenAlerts}</span> : null}
            <span className="key" aria-hidden="true">{i + 1}</span>
          </a>
        </div>
      ))}
      <div className="foot">
        <div className="groupchip">
          <span>Grupo activo</span>
          <b>{group ? `${group.name} · ${group.bits} bits` : "—"}</b>
          <span>{group ? `p = ${shortNum(group.p, 4)}, q = ${shortNum(group.q, 4)}, g = ${shortNum(group.g, 4)}` : "sin datos de /mechanisms"}</span>
        </div>
      </div>
    </nav>
  );
}
