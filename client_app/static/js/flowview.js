// Pestaña «Flujo»: diagrama de secuencia celular ↔ red ↔ banco y detalle del paso elegido.

import { $, esc, fmtJson, fmtValue } from "./util.js";

const ACTOR_NAME = { cliente: "Celular", red: "Red", banco: "Banco", atacante: "Atacante" };
const SUMMARY_VALUES = 2;
const HIDDEN_EVENT_KEYS = new Set(["trace", "exchange", "values", "request", "response"]);

/** Eventos del banco que ocurrieron al atender ese paso (misma correlación). */
export function bankEventsFor(state, index) {
  const correlation = `${state.flow.id}:${index}`;
  return state.events.filter((event) => event.source === "banco" && event.correlation_id === correlation);
}

function isSecret(label) {
  return /secret|^x\b|^r\b|^r \(/i.test(label);
}

function summary(record, full) {
  if (!record) return "";
  return Object.entries(record.values).slice(0, SUMMARY_VALUES)
    .map(([key, value]) => `<div class="mono">${esc(key)}: ${fmtValue(value, full)}</div>`).join("");
}

function stateClass(state, index) {
  const flow = state.flow;
  const classes = [];
  if (!flow.steps[index].record) classes.push("pending");
  if (index === selectedIndex(state)) classes.push("current");
  return classes.join(" ");
}

function arrowRows(step, index, state) {
  const record = step.record;
  const exchange = record?.exchange;
  const pending = record ? "" : "pending";
  const request = exchange ? `${exchange.method} ${exchange.path}` : esc(step.title);
  const ok = exchange && exchange.status < 400;
  const response = exchange
    ? `<span class="status ${ok ? "ok" : "bad"}">${exchange.status}</span> ${esc(record.message || "respuesta")}`
    : "respuesta";
  return `
    <div class="arrow right ${pending}" data-step="${index}"><div class="lbl">${esc(request)}</div><div class="line"></div></div>
    <div class="arrow left ${pending}" data-step="${index}"><div class="line"></div><div class="lbl">${response}</div></div>`;
}

function sequenceRow(step, index, state) {
  const cls = stateClass(state, index);
  const box = (actor) => `<div class="seq-box ${actor} ${cls}" data-step="${index}">
      <div class="t">${index + 1}. ${esc(step.title)}</div>${summary(step.record, state.showFull)}</div>`;
  const bankBoxes = bankEventsFor(state, index).map((event) =>
    `<div class="seq-box banco ${cls}" data-step="${index}"><div class="t">${esc(event.title)}</div></div>`).join("");
  const client = step.actor === "cliente" ? box("cliente") : "";
  const network = step.actor === "red" ? arrowRows(step, index, state) : "";
  const bank = step.actor === "banco" ? box("banco") : bankBoxes;
  return `<div class="seq-row"><div class="seq-cell">${client}</div><div class="seq-cell">${network}</div>
    <div class="seq-cell">${bank}</div></div>`;
}

function sequence(state) {
  const rows = state.flow.steps.map((step, index) => sequenceRow(step, index, state)).join("");
  return `<div class="sequence">
      <div class="lane-head cliente">📱 Celular (guarda x)</div>
      <div class="lane-head red">🌐 Red (lo que viaja)</div>
      <div class="lane-head banco">🏦 Banco (guarda y)</div>${rows}</div>`;
}

/** Paso que se muestra en detalle: el elegido, o el último ejecutado. */
export function selectedIndex(state) {
  if (state.selectedStep !== null && state.selectedStep < state.flow.steps.length) return state.selectedStep;
  return Math.max(0, state.flow.next_index - 1);
}

function valuesTable(values, full) {
  const rows = Object.entries(values || {}).map(([key, value]) =>
    `<tr><td class="${isSecret(key) ? "secret" : ""}">${esc(key)}</td><td class="num">${fmtValue(value, full)}</td></tr>`);
  return rows.length ? `<table class="kv">${rows.join("")}</table>` : "";
}

function exchangeBlock(exchange, full) {
  if (!exchange) return "";
  return `<div class="grid-2">
      <div><h4>Lo que envió el celular</h4><pre class="json">${fmtJson(exchange.request_body, full)}</pre></div>
      <div><h4>Lo que respondió el banco (${exchange.status}, ${exchange.elapsed_ms} ms)</h4>
        <pre class="json">${fmtJson(exchange.response_body, full)}</pre></div></div>`;
}

function bankBlock(events, full) {
  if (!events.length) return "";
  const items = events.map((event) => {
    const data = Object.fromEntries(Object.entries(event.data).filter(([key]) => !HIDDEN_EVENT_KEYS.has(key)));
    const trace = event.data.trace ? `<details><summary>Traza del banco (bit a bit y Euclides)</summary>
        <pre class="trace">${esc(event.data.trace)}</pre></details>` : "";
    return `<div class="event-item banco"><div class="t">${esc(event.title)}</div>${valuesTable(data, full)}${trace}</div>`;
  }).join("");
  return `<div><h4>Lo que hizo el banco</h4><div class="events-list">${items}</div></div>`;
}

function detail(state) {
  const index = selectedIndex(state);
  const step = state.flow.steps[index];
  const record = step.record;
  const status = record ? `<span class="badge">${esc(record.status)} · ${record.duration_ms} ms</span>`
    : `<span class="badge">pendiente</span>`;
  const trace = record?.trace?.length ? `<details><summary>Traza del celular (exponenciación bit a bit)</summary>
      <pre class="trace">${esc(record.trace.join("\n"))}</pre></details>` : "";
  const message = record?.message ? `<div class="note">${esc(record.message)}</div>` : "";
  return `<div class="card detail">
      <div class="detail-head"><h3>Paso ${index + 1}. ${esc(step.title)}</h3>
        <span class="actor-tag ${esc(step.actor)}">${esc(ACTOR_NAME[step.actor] || step.actor)}</span>${status}</div>
      <p style="margin:0">${esc(step.explanation)}</p>
      ${step.formula ? `<div class="formula">${esc(step.formula)}</div>` : ""}
      ${message}${valuesTable(record?.values, state.showFull)}${trace}
      ${exchangeBlock(record?.exchange, state.showFull)}${bankBlock(bankEventsFor(state, index), state.showFull)}
    </div>`;
}

/**
 * Dibuja la pestaña «Flujo» para el flujo en curso.
 * @param {object} state estado de la interfaz
 * @param {(index: number) => void} onSelect se llama al hacer clic en un paso
 */
export function renderFlowView(state, onSelect) {
  const tab = $("#tab-flow");
  if (!state.flow) {
    tab.innerHTML = `<div class="empty">Elija «Crear cuenta» o «Iniciar sesión» en el celular para ver el protocolo paso a paso.</div>`;
    return;
  }
  const toggle = `<label class="toggle" style="justify-content:flex-end;margin-bottom:8px">
      <input type="checkbox" id="full-toggle" ${state.showFull ? "checked" : ""}> Mostrar números completos</label>`;
  tab.innerHTML = `${toggle}${sequence(state)}${detail(state)}`;
  tab.querySelectorAll("[data-step]").forEach((element) => {
    element.onclick = () => onSelect(Number(element.dataset.step));
  });
  $("#full-toggle").onchange = (event) => { state.showFull = event.target.checked; renderFlowView(state, onSelect); };
}
