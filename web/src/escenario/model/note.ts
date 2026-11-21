/** Contenido de la tarjeta de anotación (explicación y matemáticas) de cada beat. */
import type { ActInfo, ActRun, Actor } from "../../shared/types";
import { exchangeOf, exchangesOf, isSignupAct, lastDecision, stepOf } from "./beats";
import { beatFocus } from "./camera";
import { serverSummary } from "./bankTerminal";
import type { EventStore } from "./events";
import { headlineField, isRegistration, keyValues, pathTail, verdictOf } from "./format";
import type { Beat, Focus, MathRow, NoteView } from "./types";

export const ACTOR_NAME: Readonly<Record<Actor | "red", string>> = {
  ana: "Celular de Ana",
  eve: "Laptop de Eve",
  banco: "Servidor del banco",
  red: "La red",
};

const FOCUS_WHO: Readonly<Record<Focus, string>> = {
  ana: ACTOR_NAME.ana,
  eve: ACTOR_NAME.eve,
  bank: ACTOR_NAME.banco,
  net: ACTOR_NAME.red,
  wide: "Plano general",
  summary: "Lo que viajó",
};

const OK_MARK = /[✓✔]/;
const BAD_MARK = /[✗✘]/;
const HIDDEN_FIELDS = ["user_id", "session_id", "accepted", "reason", "attempts_left", "name", "bits", "details"];

export function toneOf(text: string): MathRow["tone"] {
  if (BAD_MARK.test(text)) return "bad";
  return OK_MARK.test(text) ? "ok" : "plain";
}

/** "r (aleatorio, de un solo uso)": "5" → r = 5 · aleatorio, de un solo uso. */
export function valueRow(label: string, value: string): MathRow {
  const match = /^([^(]+?)\s*\((.+)\)\s*$/.exec(label);
  const term = match ? match[1] : label;
  return { term: `${term} = ${value}`, detail: match ? match[2] : "", tone: toneOf(value) };
}

/** "t = g^r mod p = 4^5 mod 23 = 12" → término «t = g^r mod p», detalle «4^5 mod 23 = 12». */
export function formulaRow(line: string): MathRow {
  const parts = line.split(" = ");
  if (parts.length < 3) return { term: line, detail: "", tone: toneOf(line) };
  return { term: `${parts[0]} = ${parts[1]}`, detail: parts.slice(2).join(" = "), tone: toneOf(line) };
}

function base(focus: Focus, title: string, text: string): NoteView {
  return { focus, who: FOCUS_WHO[focus], title, text, math: [], hint: false };
}

function stepNote(run: ActRun, beat: Beat): NoteView {
  const step = stepOf(run, beat);
  const focus = beatFocus(run, beat);
  if (!step) return base(focus, "", "");
  const values = Object.entries(step.record?.values ?? {}).map(([k, v]) => valueRow(k, v));
  const lines = step.record?.math.length ? step.record.math : step.formula ? [step.formula] : [];
  return { ...base(focus, step.title, step.explanation), math: [...values, ...lines.map(formulaRow)] };
}

function requestNote(run: ActRun, beat: Beat): NoteView {
  const step = stepOf(run, beat);
  const exchange = exchangeOf(run, beat);
  const intercepted = step?.record?.intercepted === true && exchange?.origin !== "eve" && run.cast.includes("eve");
  const fromEve = exchange?.origin === "eve";
  const title = step && step.kind === "exchange" ? step.title : `Viaja ${exchange ? `${exchange.method} ${pathTail(exchange.path)}` : "el mensaje"}`;
  const lead = step && step.kind === "exchange" ? step.explanation : fromEve ? "Para el banco es una petición más: misma ruta, otra conexión." : "";
  const copy = intercepted ? " Eve está escuchando la red: le llega una copia exacta." : "";
  return base("net", title, `${lead}${copy}`.trim());
}

function serverNote(run: ActRun, beat: Beat, store: EventStore): NoteView {
  const step = stepOf(run, beat);
  const exchange = exchangeOf(run, beat);
  const summary = serverSummary(run, beat, store);
  const fallbackTitle = exchange ? `El banco atiende ${exchange.method} ${pathTail(exchange.path)}` : "El banco atiende la petición";
  const title = summary.titles[summary.titles.length - 1] ?? fallbackTitle;
  const earlier = summary.titles.slice(0, -1).join(". ");
  const text = earlier || "El banco no sabe quién envía ni qué acto ocurre: solo atiende la petición y la registra.";
  const lines = summary.math.length ? summary.math : step?.formula ? [step.formula] : [];
  return { ...base("bank", title, text), math: lines.map(formulaRow) };
}

function responseNote(run: ActRun, beat: Beat): NoteView {
  const step = stepOf(run, beat);
  const exchange = exchangeOf(run, beat);
  if (!exchange) return base("net", "Viaja la respuesta", "");
  const verdict = verdictOf(exchange);
  const headline = headlineField(exchange.response_body);
  const title = verdict ? `Viaja la decisión: ${verdict.text}` : headline ? `Viaja la respuesta: ${headline}` : `El banco responde ${exchange.status}`;
  const to = exchange.origin === "eve" ? "a quien preguntó, sin saber que era Eve" : "al celular de Ana";
  const text = step?.record?.message || `El banco contesta ${to}.`;
  return base("net", title, text);
}

function outcomeNote(run: ActRun, act: ActInfo | null): NoteView {
  const decision = lastDecision(run);
  const exchange = decision?.exchange;
  const verdict = exchange ? verdictOf(exchange) : null;
  const byEve = exchange?.origin === "eve";
  const focus: Focus = byEve ? "eve" : "ana";
  const registered = exchange !== undefined && isRegistration(exchange) && verdict === null;
  const title = registered
    ? "La cuenta de Ana quedó creada"
    : verdict?.ok
      ? byEve ? "Eve logró entrar" : "Ana entra a su cuenta"
      : byEve ? "El ataque no funcionó" : "El banco no dejó entrar";
  const message = decision ? run.steps[decision.stepIndex].record?.message : "";
  return base(focus, title, message || act?.summary || "");
}

function traveledValues(run: ActRun): string {
  const fields = run.steps.flatMap((s) =>
    exchangesOf(s).flatMap((ex) => [...keyValues(ex.request_body, HIDDEN_FIELDS), ...keyValues(ex.response_body, HIDDEN_FIELDS)]),
  );
  const unique = [...new Set(fields.map((kv) => `${kv.key} = ${kv.value}`))];
  return unique.join(", ");
}

const STATUS_TITLE: Readonly<Record<ActRun["status"], string>> = {
  aceptado: "El banco aceptó",
  rechazado: "El banco rechazó el intento",
  error: "El acto terminó con un error",
  en_curso: "El acto sigue en curso",
};

function summaryNote(run: ActRun, act: ActInfo | null): NoteView {
  const traveled = traveledValues(run);
  const decision = lastDecision(run);
  const verdict = decision ? verdictOf(decision.exchange) : null;
  const signup = isSignupAct(run) && verdict === null && decision !== null;
  const title = signup ? "Ana quedó registrada" : verdict ? (verdict.ok ? `Resultado: ${verdict.text}` : STATUS_TITLE.rechazado) : STATUS_TITLE[run.status];
  const math: MathRow[] = [
    ...(traveled ? [{ term: "por la red", detail: traveled, tone: "plain" as const }] : []),
    ...(verdict ? [{ term: "decisión", detail: verdict.text, tone: verdict.ok ? ("ok" as const) : ("bad" as const) }] : []),
  ];
  return { ...base("summary", title, act?.summary ?? run.title), math };
}

const BIOMETRIC_TEXT = "La huella no viaja a ningún lado: solo desbloquea el chip seguro del teléfono, donde vive la clave secreta x.";

export function noteView(run: ActRun, act: ActInfo | null, beat: Beat, store: EventStore): NoteView {
  switch (beat.kind) {
    case "intro":
      return { ...base("wide", run.title, act?.summary ?? ""), hint: true };
    case "biometric":
      return base("ana", "Ana confirma con su huella", BIOMETRIC_TEXT);
    case "request":
      return requestNote(run, beat);
    case "server":
      return serverNote(run, beat, store);
    case "response":
      return responseNote(run, beat);
    case "outcome":
      return outcomeNote(run, act);
    case "summary":
      return summaryNote(run, act);
    default:
      return stepNote(run, beat);
  }
}

/** Tarjeta al revisar una fase compactada del diagrama (n = número de fase). */
export function reviewNote(run: ActRun, stepIndex: number, n: number): NoteView {
  const step = run.steps[stepIndex];
  const text = [step?.explanation, step?.record?.message].filter(Boolean).join(" ");
  return { ...base("wide", step?.title ?? "", text), who: `Revisando el paso ${n} del diagrama` };
}
