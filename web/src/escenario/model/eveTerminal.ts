/**
 * Terminal de la laptop de Eve: sus comandos (record.terminal de sus pasos) y las copias de
 * los mensajes de Ana que intercepta (líneas tipo tcpdump). Los resultados (ok/bad) de un
 * ataque con mensajes aparecen cuando llega la respuesta, no antes.
 */
import type { ActRun, TerminalLine } from "../../shared/types";
import { exchangeOf, exchangesOf, stepOf } from "./beats";
import { compactJson } from "./format";
import type { Beat, EveLine } from "./types";

export const EVE_LINES_SHOWN = 11;

const isResult = (line: TerminalLine): boolean => line.kind === "ok" || line.kind === "bad";

function linesOfBeat(run: ActRun, beat: Beat): Array<Omit<EveLine, "fresh">> {
  const step = stepOf(run, beat);
  const record = step?.record;
  if (!step || !record) return [];
  const own = (lines: TerminalLine[]): Array<Omit<EveLine, "fresh">> =>
    lines.map((line, i) => ({ key: `${beat.id}:${i}`, kind: line.kind, text: line.text }));
  const hasExchanges = exchangesOf(step).length > 0;
  if (beat.kind === "attack") return own(hasExchanges ? record.terminal.filter((l) => !isResult(l)) : record.terminal);
  const exchange = exchangeOf(run, beat);
  if (!exchange) return [];
  const intercepted = record.intercepted && exchange.origin !== "eve";
  const isLastExchange = beat.exchangeIndex === exchangesOf(step).length - 1;
  if (beat.kind === "request" && intercepted) {
    return [{ key: `${beat.id}:cap`, kind: "cap", text: `${exchange.method} ${exchange.path}  ${compactJson(exchange.request_body)}`.trimEnd() }];
  }
  if (beat.kind === "response" && intercepted) {
    return [{ key: `${beat.id}:cap`, kind: "cap", text: `${exchange.status}  ${compactJson(exchange.response_body)}`.trimEnd() }];
  }
  if (beat.kind === "response" && step.kind === "attack" && isLastExchange) return own(record.terminal.filter(isResult));
  return [];
}

export function eveTerminal(run: ActRun, beats: readonly Beat[], index: number): EveLine[] {
  const current = beats[index]?.id;
  const all = beats.slice(0, index + 1).flatMap((beat) =>
    linesOfBeat(run, beat).map((line) => ({ ...line, fresh: beat.id === current })),
  );
  return all.slice(-EVE_LINES_SHOWN);
}

/** true si Eve participa: está en el elenco o tiene pasos propios. */
export function eveOnStage(run: ActRun): boolean {
  return run.cast.includes("eve") || run.steps.some((s) => s.actor === "eve");
}
