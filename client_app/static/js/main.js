// Punto de entrada de la interfaz: estado, acciones del celular, eventos en vivo y pestañas.

import { renderFlowView } from "./flowview.js";
import { renderLab, renderResults } from "./lab.js";
import { appendConsole, renderBank, renderNetwork, setupConsole } from "./panels.js";
import { loginFlows, renderPhone } from "./phone.js";
import { $, api, listen, sleep, toast } from "./util.js";

const AUTO_STEP_MS = 700;
const BANK_REFRESH_MS = 250;
const CLOCK_MS = 30_000;

/** Estado único de la interfaz; las vistas lo leen y las acciones lo actualizan. */
const state = {
  config: null,
  bankUrl: "",
  flow: null,
  selectedStep: null,
  selectedExchange: null,
  events: [],
  screen: "home",
  userId: "cliente01",
  method: "login",
  stepMode: true,
  busy: false,
  showFull: false,
  wallet: [],
  session: null,
  bankData: null,
};

function render() {
  renderPhone(state, actions);
  renderFlowView(state, actions.selectStep);
  renderNetwork(state);
  renderBank(state);
}

async function refreshWallet() {
  try { state.wallet = await api("/api/wallet"); } catch { state.wallet = []; }
}

let bankTimer = null;
function scheduleBankRefresh() {
  clearTimeout(bankTimer);
  bankTimer = setTimeout(refreshBank, BANK_REFRESH_MS);
}

async function refreshBank() {
  try {
    const [mechanisms, users, audit] = await Promise.all([
      api(`${state.bankUrl}/mechanisms`), api(`${state.bankUrl}/bank/users`), api(`${state.bankUrl}/audit/log`)]);
    state.bankData = { mechanisms, users, audit };
    const group = mechanisms[0]?.server?.group;
    const option = [...$("#group-select").options].find((item) => group && group.startsWith(item.value));
    if (option && document.activeElement !== $("#group-select")) $("#group-select").value = option.value;
  } catch {
    state.bankData = null;
  }
  await refreshWallet();
  renderBank(state);
  renderPhone(state, actions);
}

function onEvent(event) {
  state.events.push(event);
  appendConsole(event);
  if (event.kind === "http" && event.source !== "banco") renderNetwork(state);
  if (event.source === "banco" || event.source === "sistema") scheduleBankRefresh();
  if (state.flow && event.correlation_id?.startsWith(state.flow.id)) renderFlowView(state, actions.selectStep);
}

function setBankStatus(online) {
  $("#bank-dot").className = `dot ${online ? "on" : "off"}`;
  $("#bank-status").textContent = online ? "Banco: en vivo" : "Banco: sin conexión";
}

async function startFlow(flowName) {
  if (!state.userId) { toast("Escriba un usuario.", true); return; }
  try {
    state.flow = await api("/api/flows", { method: "POST", body: { flow: flowName, user_id: state.userId } });
    state.selectedStep = null;
    state.screen = "flow";
    render();
    if (!state.stepMode) await actions.run();
  } catch (error) {
    toast(error.message, true);
  }
}

async function advance() {
  state.flow = await api(`/api/flows/${state.flow.id}/next`, { method: "POST" });
  state.selectedStep = null;
  render();
}

const actions = {
  register: () => startFlow("register"),
  login: () => startFlow(loginFlows(state).some((flow) => flow.id === state.method) ? state.method : "login"),
  async next() {
    if (state.busy || !state.flow) return;
    state.busy = true;
    try { await advance(); } catch (error) { toast(error.message, true); } finally { state.busy = false; render(); }
  },
  async run() {
    if (state.busy || !state.flow) return;
    state.busy = true;
    try {
      while (state.flow.status === "en_curso") {
        await advance();
        if (state.flow.status === "en_curso") await sleep(AUTO_STEP_MS);
      }
    } catch (error) {
      toast(error.message, true);
    } finally {
      state.busy = false;
      render();
    }
  },
  cancel() { state.flow = null; state.screen = "home"; render(); },
  async finish() {
    const accepted = state.flow?.status === "aceptado" && state.flow.flow !== "register";
    state.session = accepted ? { user_id: state.flow.user_id, title: state.flow.title } : null;
    state.screen = accepted ? "account" : "home";
    await refreshWallet();
    render();
  },
  logout() { state.session = null; state.screen = "home"; render(); },
  selectStep(index) { state.selectedStep = index; renderFlowView(state, actions.selectStep); renderPhone(state, actions); },
};

async function resetLab() {
  const group = $("#group-select").value;
  $("#reset-btn").disabled = true;
  try {
    await api("/api/lab/reset", { method: "POST", body: { group } });
    Object.assign(state, { flow: null, screen: "home", session: null, selectedStep: null });
    toast(`Laboratorio reiniciado con el grupo ${group}.`);
    await refreshBank();
    render();
  } catch (error) {
    toast(error.message, true);
  } finally {
    $("#reset-btn").disabled = false;
  }
}

function setupTabs() {
  document.querySelectorAll(".tabs button").forEach((button) => {
    button.onclick = () => {
      document.querySelectorAll(".tabs button").forEach((item) => item.classList.toggle("active", item === button));
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.id === `tab-${button.dataset.tab}`));
      if (button.dataset.tab === "results") renderResults();
      if (button.dataset.tab === "swagger" && !$("#swagger-frame").src) $("#swagger-frame").src = state.config.docs_url;
    };
  });
}

function tickClock() {
  $("#phone-clock").textContent = new Date().toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
}

async function init() {
  setupTabs();
  setupConsole();
  tickClock();
  setInterval(tickClock, CLOCK_MS);
  $("#reset-btn").onclick = resetLab;
  try {
    state.config = await api("/api/config");
  } catch (error) {
    toast(`No se pudo cargar la configuración: ${error.message}`, true);
    return;
  }
  state.bankUrl = state.config.bank_url;
  $("#swagger-link").href = state.config.docs_url;
  renderLab(state);
  listen("/api/events/stream", onEvent);
  listen(`${state.bankUrl}/events/stream`, onEvent, setBankStatus);
  await refreshBank();
  render();
}

init();
