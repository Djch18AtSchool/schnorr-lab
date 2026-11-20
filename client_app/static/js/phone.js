// Pantallas del celular: inicio, flujo paso a paso y cuenta. Solo muestra; la lógica vive en Python.

import { $, esc } from "./util.js";

const ACTOR_LABEL = { cliente: "En el celular", red: "Mensaje al banco", banco: "En el banco" };
const MOVEMENTS = [
  ["Supermercado La Colonia", "−₡18 450,00", "out"],
  ["Salario noviembre", "+₡845 000,00", "in"],
  ["SINPE Móvil · Ana", "−₡12 000,00", "out"],
  ["Recibo de electricidad", "−₡24 310,00", "out"],
];

/** Flujos de inicio de sesión disponibles (todos menos el registro). */
export function loginFlows(state) {
  const mechanism = state.config?.mechanisms?.[0];
  return (mechanism?.flows || []).filter((flow) => flow.id !== "register" && flow.available);
}

function homeScreen(state) {
  const options = loginFlows(state).map((flow) =>
    `<option value="${esc(flow.id)}" ${flow.id === state.method ? "selected" : ""}>${esc(flow.title)}</option>`).join("");
  const accounts = state.wallet.map((entry) => esc(entry.user_id));
  return `
    <div class="field"><label for="user-input">Usuario</label>
      <input id="user-input" value="${esc(state.userId)}" maxlength="64" autocomplete="off"></div>
    <div class="field"><label for="method-select">Método de inicio de sesión</label>
      <select id="method-select">${options}</select></div>
    <label class="toggle"><input type="checkbox" id="step-toggle" ${state.stepMode ? "checked" : ""}>
      Paso a paso (explicar cada cálculo y cada mensaje)</label>
    <div class="btn-row">
      <button class="btn secondary" data-action="register">Crear cuenta</button>
      <button class="btn primary" data-action="login">Iniciar sesión</button>
    </div>
    <div class="note">${accounts.length
      ? `Claves guardadas en este celular para: <strong>${accounts.join(", ")}</strong>`
      : "Este celular todavía no tiene ninguna clave: primero cree una cuenta."}</div>
    <div class="note">Esta app nunca pide ni envía una contraseña. Demuestra al banco que conoce una
      clave secreta <em>x</em> sin enviarla: el banco solo guarda <em>y = g<sup>x</sup> mod p</em>.</div>`;
}

function stepClass(flow, index) {
  const record = flow.steps[index].record;
  if (record && record.status === "error") return "failed";
  if (record && record.status === "rechazado") return "failed";
  if (record) return "done";
  return index === flow.next_index && flow.status === "en_curso" ? "current" : "";
}

function resultBanner(flow) {
  const last = [...flow.steps].reverse().find((step) => step.record)?.record;
  const message = last?.message || "";
  if (flow.status === "aceptado") {
    const title = flow.flow === "register" ? "Cuenta creada" : "Acceso concedido";
    return `<div class="result-banner ok">✔ ${title}<small>${esc(message)}</small></div>`;
  }
  const title = flow.status === "error" ? "No se pudo completar" : "Acceso rechazado";
  return `<div class="result-banner bad">✘ ${title}<small>${esc(message)}</small></div>`;
}

function flowScreen(state) {
  const flow = state.flow;
  const items = flow.steps.map((step, index) => `
    <li class="${stepClass(flow, index)}" data-step="${index}">
      <span class="num">${index + 1}</span>
      <span><div>${esc(step.title)}</div><div class="actor">${esc(ACTOR_LABEL[step.actor] || step.actor)}</div></span>
    </li>`).join("");
  const running = flow.status === "en_curso";
  const controls = running
    ? `<div class="btn-row"><button class="btn primary" data-action="next" ${state.busy ? "disabled" : ""}>Siguiente paso ▸</button>
         <button class="btn secondary" data-action="run" ${state.busy ? "disabled" : ""}>Ejecutar todo</button></div>
       <button class="btn ghost" data-action="cancel">Cancelar</button>`
    : `${resultBanner(flow)}<button class="btn primary" data-action="finish">Continuar</button>`;
  return `<div><span class="badge">${esc(flow.title)}</span> <small>· ${esc(flow.user_id)}</small></div>
    <ol class="steps">${items}</ol>${controls}`;
}

function accountScreen(state) {
  const rows = MOVEMENTS.map(([label, amount, kind]) =>
    `<li><span>${esc(label)}</span><span class="${kind}">${esc(amount)}</span></li>`).join("");
  return `
    <div>Hola, <strong>${esc(state.session.user_id)}</strong></div>
    <div class="balance"><div class="label">Cuenta de ahorros · LAB-0001-2026 (ficticia)</div>
      <div class="amount">₡1 254 300,00</div></div>
    <span class="badge">Entró sin contraseña · ${esc(state.session.title)}</span>
    <h4 style="margin:6px 0 0">Últimos movimientos</h4><ul class="movements">${rows}</ul>
    <button class="btn ghost" data-action="logout">Cerrar sesión</button>`;
}

/**
 * Dibuja la pantalla actual del celular y conecta sus botones con las acciones.
 * @param {object} state estado de la interfaz
 * @param {Record<string, Function>} actions register, login, next, run, cancel, finish, logout, selectStep
 */
export function renderPhone(state, actions) {
  const body = $("#phone-body");
  const screens = { flow: flowScreen, account: accountScreen, home: homeScreen };
  const screen = state.screen === "flow" && !state.flow ? "home" : state.screen;
  body.innerHTML = (screens[screen] || homeScreen)(state);
  $("#phone-tag").textContent = screen === "account" ? "Sesión iniciada" : "Inicio de sesión sin contraseña";
  body.onclick = (event) => {
    const button = event.target.closest("[data-action]");
    if (button && !button.disabled) actions[button.dataset.action]?.();
    const step = event.target.closest("[data-step]");
    if (step) actions.selectStep(Number(step.dataset.step));
  };
  const user = $("#user-input");
  if (user) user.oninput = () => { state.userId = user.value.trim(); };
  const method = $("#method-select");
  if (method) method.onchange = () => { state.method = method.value; };
  const toggle = $("#step-toggle");
  if (toggle) toggle.onchange = () => { state.stepMode = toggle.checked; };
}
