// Pestañas «Red», «Banco» y «Consola».

import { $, clock, esc, fmtJson, fmtValue } from "./util.js";

const PUBLIC_FIELDS = new Set(["user_id", "y", "t", "session_id", "s", "m"]);
const MAX_CONSOLE_LINES = 1500;
const CONSOLE_VALUE_CHARS = 60;

/** Mensajes HTTP del celular y del atacante, en orden de llegada. */
export function exchanges(state) {
  return state.events.filter((event) => event.kind === "http" && event.source !== "banco");
}

function networkCheck(list) {
  const fields = new Set();
  for (const event of list) {
    const body = event.data.request_body;
    if (body && typeof body === "object") Object.keys(body).forEach((key) => fields.add(key));
  }
  if (!fields.size) return "";
  const extra = [...fields].filter((field) => !PUBLIC_FIELDS.has(field));
  const listed = [...fields].map((field) => `<code>${esc(field)}</code>`).join(", ");
  return extra.length
    ? `<div class="check-banner bad">✘ Viajaron campos que no son públicos: ${extra.map(esc).join(", ")}</div>`
    : `<div class="check-banner ok">✔ Solo viajaron campos públicos (${listed}). La clave secreta x nunca salió del celular.</div>`;
}

/** Dibuja la pestaña «Red» con todos los mensajes; selected es el id del evento abierto. */
export function renderNetwork(state) {
  const list = exchanges(state);
  $("#count-network").textContent = String(list.length);
  $("#network-check").innerHTML = networkCheck(list);
  const rows = [...list].reverse().map((event) => {
    const data = event.data;
    const ok = data.status < 400;
    return `<tr class="clickable" data-event="${event.id}"><td class="mono">${clock(event.timestamp)}</td>
      <td><span class="src ${esc(event.source)}">${esc(event.source)}</span></td>
      <td class="mono">${esc(data.method)} ${esc(data.path)}</td>
      <td><span class="http-status ${ok ? "ok" : "bad"}">${esc(data.status)}</span></td><td>${esc(data.elapsed_ms)}</td></tr>`;
  });
  $("#network-rows").innerHTML = rows.join("") ||
    `<tr><td colspan="5" class="empty">Todavía no ha viajado ningún mensaje.</td></tr>`;
  $("#network-rows").onclick = (click) => {
    const row = click.target.closest("[data-event]");
    if (!row) return;
    state.selectedExchange = Number(row.dataset.event);
    renderNetworkDetail(state);
  };
  renderNetworkDetail(state);
}

function renderNetworkDetail(state) {
  const event = exchanges(state).find((item) => item.id === state.selectedExchange);
  if (!event) { $("#network-detail").innerHTML = ""; return; }
  const data = event.data;
  $("#network-detail").innerHTML = `<div class="grid-2">
      <div><h4>${esc(data.method)} ${esc(data.path)} · cuerpo enviado</h4><pre class="json">${fmtJson(data.request_body, state.showFull)}</pre></div>
      <div><h4>Respuesta ${esc(data.status)}</h4><pre class="json">${fmtJson(data.response_body, state.showFull)}</pre></div></div>`;
}

function usersTable(users, full) {
  const rows = Object.entries(users).flatMap(([mechanism, byUser]) =>
    Object.entries(byUser).map(([user, stored]) => `<tr><td>${esc(mechanism)}</td><td>${esc(user)}</td>
      <td class="num">${Object.entries(stored).map(([k, v]) => `${esc(k)} = ${fmtValue(v, full)}`).join("<br>")}</td></tr>`));
  return rows.length
    ? `<table class="list"><thead><tr><th>Mecanismo</th><th>Usuario</th><th>Dato guardado</th></tr></thead>${rows.join("")}</table>
       <p class="note" style="margin-top:8px">Si roban esta tabla no hay contraseñas: solo claves públicas.</p>`
    : `<div class="empty">El banco todavía no tiene usuarios.</div>`;
}

function paramsTable(server, full) {
  if (!server) return `<div class="empty">Sin conexión con el banco.</div>`;
  const rows = [["grupo", server.group], ["bits de p (k)", server.bits], ["bits de q", server.q_bits],
    ["p", server.p], ["q", server.q], ["g", server.g]];
  return `<table class="kv">${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${fmtValue(v, full)}</td></tr>`).join("")}</table>`;
}

function auditTable(entries, full) {
  if (!entries.length) return `<div class="empty">El banco todavía no recibió ningún cuerpo.</div>`;
  const rows = [...entries].reverse().map((entry) => `<tr><td class="mono">${esc(entry.endpoint)}</td>
      <td>${entry.valid ? "sí" : "<strong style='color:var(--bad)'>rechazado</strong>"}</td>
      <td><pre class="json">${fmtJson(entry.body, full)}</pre></td></tr>`);
  return `<table class="list"><thead><tr><th>Ruta</th><th>¿Válido?</th><th>Cuerpo recibido</th></tr></thead>${rows.join("")}</table>`;
}

function walletTable(wallet, full) {
  if (!wallet.length) return `<div class="empty">El celular no tiene claves guardadas.</div>`;
  const rows = wallet.map((entry) => `<tr><td>${esc(entry.user_id)}</td><td class="num">${Object.entries(entry.secret)
    .map(([k, v]) => `<span class="${/secret/.test(k) ? "secret" : ""}">${esc(k)}</span> = ${fmtValue(v, full)}`).join("<br>")}</td></tr>`);
  return `<table class="list"><thead><tr><th>Usuario</th><th>Guardado en el celular</th></tr></thead>${rows.join("")}</table>`;
}

/** Dibuja la pestaña «Banco» con lo que guarda el banco, la auditoría y el wallet del celular. */
export function renderBank(state) {
  const data = state.bankData;
  $("#bank-users").innerHTML = data ? usersTable(data.users, state.showFull) : `<div class="empty">Sin conexión con el banco.</div>`;
  $("#bank-params").innerHTML = paramsTable(data?.mechanisms?.[0]?.server, state.showFull);
  $("#bank-audit").innerHTML = data ? auditTable(data.audit, state.showFull) : "";
  $("#phone-wallet").innerHTML = walletTable(state.wallet, state.showFull);
}

function compact(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > CONSOLE_VALUE_CHARS ? `${text.slice(0, CONSOLE_VALUE_CHARS)}…` : text;
}

/** Agrega un evento a la consola (con sus datos resumidos y la traza, si la hay). */
export function appendConsole(event) {
  const box = $("#console");
  const stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
  const data = Object.entries(event.data || {}).filter(([key]) => key !== "trace" && key !== "values")
    .map(([key, value]) => `${key}=${compact(value)}`).join("  ");
  const trace = event.data?.trace ? `\n    ${String(event.data.trace).split("\n").join("\n    ")}` : "";
  const line = document.createElement("div");
  line.className = `line ${event.source}`;
  line.innerHTML = `<span class="time">${clock(event.timestamp)}</span> <span class="${esc(event.source)}">[${esc(event.source)}]</span> `
    + `${esc(event.title)} <span class="data">${esc(data)}${esc(trace)}</span>`;
  box.appendChild(line);
  while (box.childElementCount > MAX_CONSOLE_LINES) box.firstElementChild.remove();
  $("#count-console").textContent = String(Number($("#count-console").textContent) + 1);
  if (stick) box.scrollTop = box.scrollHeight;
}

/** Filtros por fuente y botón de limpiar de la consola. */
export function setupConsole() {
  const box = $("#console");
  document.querySelectorAll("[data-src]").forEach((checkbox) => {
    checkbox.onchange = () => box.classList.toggle(`hide-${checkbox.dataset.src}`, !checkbox.checked);
  });
  $("#console-data").onchange = (event) => box.classList.toggle("hide-data", !event.target.checked);
  $("#console-clear").onclick = () => { box.innerHTML = ""; $("#count-console").textContent = "0"; };
}
