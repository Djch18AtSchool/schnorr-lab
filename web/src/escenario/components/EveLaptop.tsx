/** Laptop de Eve: su terminal con lo que escribe y lo que captura de la red. */
import type { RefObject } from "react";
import type { EveLine } from "../model/types";

const PROMPT = "eve@portatil:~$ ";
const KIND_CLASS: Readonly<Record<EveLine["kind"], string>> = {
  cmd: "p", out: "o", dim: "o", ok: "ok", bad: "err", cap: "cap",
};

interface EveLaptopProps {
  lines: EveLine[];
  onStage: boolean;
  dim: boolean;
  left: number;
  top: number;
  animate: boolean;
  actorRef: RefObject<HTMLDivElement | null>;
}

export function EveLaptop({ lines, onStage, dim, left, top, animate, actorRef }: EveLaptopProps) {
  return (
    <div ref={actorRef} className={`actor laptop${onStage ? "" : " offstage"}${dim ? " dim" : ""}`} style={{ left, top }} aria-hidden={!onStage}>
      <div className="lap-screen">
        <div className="lap-term">
          <div className="bar"><span>eve@portatil</span><b>wlan0: Wi-Fi del café</b></div>
          <div className="lines">
            {lines.map((line) => (
              <div key={line.key} className={`l ${KIND_CLASS[line.kind]}${line.kind === "cap" && line.fresh ? " hl" : ""}${line.fresh && animate ? " fresh" : ""}`}>
                {line.kind === "cmd" && !line.text.startsWith("eve@") ? PROMPT : ""}
                {line.text}
              </div>
            ))}
            <div className="l p">{PROMPT}<span className="cursor eve" /></div>
          </div>
        </div>
      </div>
      <div className="lap-base" />
      <div className="actor-tag"><i style={{ background: "var(--eve)" }} />Laptop de Eve</div>
    </div>
  );
}
