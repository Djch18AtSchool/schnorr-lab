/** Navegación lateral: 7 secciones en 3 grupos; Seguridad lleva las alertas nuevas sin ver. */
import type { MouseEvent } from "react";
import { GROUP_TITLES, SECTIONS, type Section, type SectionGroup } from "../state/sections";

interface SideNavProps {
  current: Section;
  onGo: (section: Section) => void;
  unseenAlerts: number;
}

const GROUPS = Object.keys(GROUP_TITLES) as SectionGroup[];

export function SideNav({ current, onGo, unseenAlerts }: SideNavProps) {
  const click = (e: MouseEvent, id: Section): void => {
    e.preventDefault();
    onGo(id);
  };
  return (
    <nav className="side" aria-label="Secciones">
      {GROUPS.map((group) => (
        <div key={group} className="side-group">
          <div className="side-title">{GROUP_TITLES[group]}</div>
          {SECTIONS.filter((s) => s.group === group).map(({ id, title, icon: Icon }) => (
            <a key={id} className="nav" href={`#${id}`} aria-current={id === current ? "page" : undefined} onClick={(e) => click(e, id)}>
              <Icon aria-hidden="true" />
              <span>{title}</span>
              {id === "seguridad" && unseenAlerts > 0 ? <span className="badge" title={`${unseenAlerts} alertas nuevas`}>{unseenAlerts}</span> : null}
            </a>
          ))}
        </div>
      ))}
    </nav>
  );
}
