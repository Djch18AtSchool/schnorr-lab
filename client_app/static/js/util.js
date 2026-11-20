// Utilidades compartidas: escapado de HTML, formato de números grandes, API y eventos en vivo.

export const EVENT_KINDS = ["paso", "http", "verificacion", "registro", "log", "error"];
const MAX_PLAIN_DIGITS = 26;
const HEAD_DIGITS = 10;
const TAIL_DIGITS = 8;
const TOAST_MS = 4500;

export const $ = (selector, root = document) => root.querySelector(selector);

export function esc(value) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value ?? "").replace(/[&<>"']/g, (ch) => map[ch]);
}

// Enteros largos (claves de cientos de dígitos) se abrevian; el valor completo queda en el tooltip.
export function fmtValue(value, full = false) {
  const text = String(value ?? "");
  if (full || !/^-?\d+$/.test(text) || text.length <= MAX_PLAIN_DIGITS) return esc(text);
  const short = `${text.slice(0, HEAD_DIGITS)}…${text.slice(-TAIL_DIGITS)}`;
  return `<span title="${esc(text)}">${esc(short)}</span> <small class="muted">(${text.length} dígitos)</small>`;
}

export function fmtJson(value, full = false) {
  const json = JSON.stringify(value ?? null, null, 2);
  if (full) return esc(json);
  return esc(json.replace(/"(-?\d{27,})"/g, (_, digits) =>
    `"${digits.slice(0, HEAD_DIGITS)}…${digits.slice(-TAIL_DIGITS)} (${digits.length} dígitos)"`));
}

export function clock(timestamp) {
  const date = new Date(timestamp * 1000);
  const pad = (n, size = 2) => String(n).padStart(size, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

let toastTimer = null;
export function toast(message, isError = false) {
  const box = $("#toast");
  box.textContent = message;
  box.className = `toast${isError ? " error" : ""}`;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, TOAST_MS);
}

// fetch + JSON con errores legibles: usa «reason» o «detail» de la respuesta si existe.
export async function api(url, options = {}) {
  const init = { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } };
  if (init.body && typeof init.body !== "string") init.body = JSON.stringify(init.body);
  const response = await fetch(url, init);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const reason = (data && (data.reason || data.detail)) || `Error ${response.status}`;
    throw new Error(typeof reason === "string" ? reason : JSON.stringify(reason));
  }
  return data;
}

// Escucha un flujo SSE; onStatus(true/false) informa si la conexión está viva.
export function listen(url, onEvent, onStatus = () => {}) {
  const source = new EventSource(url);
  source.onopen = () => onStatus(true);
  source.onerror = () => onStatus(false);
  for (const kind of EVENT_KINDS) {
    source.addEventListener(kind, (message) => onEvent(JSON.parse(message.data)));
  }
  return source;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
