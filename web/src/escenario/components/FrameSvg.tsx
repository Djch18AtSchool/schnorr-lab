/** Miniatura de cada cuadro de la tira: un diagrama de secuencia diminuto. */
import type { FrameModel } from "../model/storyboard";
import type { Lane } from "../model/types";

type LaneXs = Partial<Record<Lane, number>>;

const WITH_EVE: LaneXs = { ana: 16, net: 26, bank: 36, eve: 46 };
const WITHOUT_EVE: LaneXs = { ana: 17, net: 30, bank: 43 };

function Lanes({ xs, strong }: { xs: LaneXs; strong: boolean }) {
  return (
    <>
      {Object.entries(xs).map(([lane, x]) => (
        <line key={lane} x1={x} y1={6} x2={x} y2={44} stroke={`var(--${lane})`} strokeWidth={1} strokeDasharray={lane === "net" ? "1 2" : "2 2"} opacity={strong ? 0.9 : 0.55} />
      ))}
    </>
  );
}

function Marks({ frame, xs, term }: { frame: FrameModel; xs: LaneXs; term: [number, number, number, number] }) {
  const f = frame.focus;
  if (frame.arrow) {
    const a = xs[frame.arrow.from] ?? 0;
    const b = xs[frame.arrow.to] ?? 0;
    const dir = b > a ? -1 : 1;
    const color = `var(--${frame.arrow.from})`;
    return (
      <>
        <line x1={a} y1={29} x2={b} y2={29} stroke={color} strokeWidth={1.8} />
        <path d={`M${b} 29l${dir * 3.5} -2.5v5z`} fill={color} />
      </>
    );
  }
  if (f === "bank") {
    const ty = term[1] + term[3] / 2;
    const bx = xs.bank ?? 0;
    return (
      <>
        <rect x={bx - 1.5} y={ty - 6} width={3} height={12} rx={1} fill="var(--bank)" />
        <path d={`M${bx + 2} ${ty}H${term[0]}`} stroke="var(--bank)" strokeWidth={1} strokeDasharray="1.5 1.2" />
        <rect x={term[0] + 2} y={term[1] + 3} width={term[2] - 4} height={2} rx={0.6} fill="var(--bank)" />
      </>
    );
  }
  if (f === "summary") {
    return (
      <>
        {[12, 18, 24, 30, 36].map((y, i) => (
          <line key={y} x1={xs.ana} y1={y} x2={xs.bank} y2={y} stroke={`var(--${i % 2 ? "bank" : "ana"})`} strokeWidth={1.2} opacity={0.8} />
        ))}
      </>
    );
  }
  if (f === "eve" && xs.eve) return <rect x={xs.eve - 9} y={30} width={7} height={5} rx={1} fill="var(--eve)" opacity={0.8} />;
  if (f === "ana") return <rect x={(xs.ana ?? 0) + 2} y={30} width={9} height={5} rx={1} fill="var(--ana)" opacity={0.8} />;
  return null;
}

export function FrameSvg({ frame, hasEve }: { frame: FrameModel; hasEve: boolean }) {
  const xs = hasEve ? WITH_EVE : WITHOUT_EVE;
  const f = frame.focus;
  const term: [number, number, number, number] = hasEve ? [51, 20, 11, 19] : [49, 9, 13, 24];
  const lapOpacity = f === "eve" || f === "wide" ? 1 : 0.5;
  return (
    <svg viewBox="0 0 64 48" aria-hidden="true">
      {f === "wide" && <rect x={1.5} y={2.5} width={61} height={43} rx={3} fill="none" stroke="var(--ink-3)" strokeWidth={0.8} strokeDasharray="2.5 2" />}
      <Lanes xs={xs} strong={f === "wide" || f === "summary"} />
      <rect x={3} y={12} width={8} height={15} rx={2} fill={f === "ana" ? "var(--ana)" : "none"} stroke="var(--ana)" strokeWidth={1.3} opacity={f === "ana" || f === "wide" ? 1 : 0.5} />
      {hasEve && (
        <>
          <rect x={51.5} y={7} width={10} height={7} rx={1} fill={f === "eve" ? "var(--eve)" : "none"} stroke="var(--eve)" strokeWidth={1.3} opacity={lapOpacity} />
          <line x1={50} y1={16} x2={63} y2={16} stroke="var(--eve)" strokeWidth={1.3} opacity={lapOpacity} />
        </>
      )}
      <rect x={term[0]} y={term[1]} width={term[2]} height={term[3]} rx={1.6} fill={f === "bank" ? "var(--term-bg)" : "none"} stroke="var(--bank)" strokeWidth={1.3} opacity={f === "bank" || f === "wide" || f === "summary" ? 1 : 0.45} />
      <Marks frame={frame} xs={xs} term={term} />
    </svg>
  );
}
