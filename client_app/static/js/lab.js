// Pestañas «Laboratorio» (ataques) y «Resultados» (gráficas y tablas de los experimentos).

import { $, api, esc, fmtJson, fmtValue, toast } from "./util.js";

const DESCRIPTIONS = {
  replay_response: "Un espía reenvía la última respuesta s que vio pasar por la red. La sesión ya se consumió.",
  replay_nizk: "Un espía reenvía la última prueba no interactiva. El banco recuerda los pares (t, s) usados.",
  steal_database: "El atacante se lleva la base de datos del banco. Solo encuentra claves públicas y.",
  impostor_live: "Sin conocer x, adivina el reto y fabrica t = g^s·(y^c')^-1. Gana con probabilidad 1/q; cada fallo consume un intento.",
  nonce_reuse: "Si el celular repitiera r en dos sesiones, x se despejaría con Euclides extendido. Por eso r se borra.",
  simulator: "Se fabrican transcripciones válidas sin conocer x: tienen la misma distribución que las reales.",
  impostor: "20 000 intentos de un impostor que adivina el reto: la tasa de éxito se acerca a 1/q.",
  replay: "Sin m ni registro, una prueba capturada se acepta dos veces; con la ventana Δ y el registro, no.",
  bsgs: "Paso de bebé, paso de gigante: recuperar x a partir de y cuesta del orden de √q operaciones.",
};
const RESULT_CAPTIONS = {
  "latency.png": "Latencia de una autenticación completa según los bits de p (escala logarítmica).",
  "backends.png": "La misma autenticación con tres implementaciones de la potencia modular.",
  "bsgs.png": "Tiempo de BSGS para recuperar x según los bits de q, frente a la referencia √q.",
};

function card(name, title, live) {
  return `<div class="card attack"><h4>${esc(title)}</h4><p>${esc(DESCRIPTIONS[name] || "")}</p>
    <button class="btn ${live ? "danger" : "secondary"}" data-attack="${esc(name)}">${live ? "Lanzar ataque" : "Ejecutar experimento"}</button></div>`;
}

function verdict(result) {
  if (result.cracked === true) return `<div class="verdict bad">✘ Con un q tan pequeño, el atacante despejó x</div>`;
  if (result.cracked === false) return `<div class="verdict ok">✔ El atacante solo obtuvo claves públicas: no puede despejar x</div>`;
  if (typeof result.accepted !== "boolean") return "";
  return result.accepted
    ? `<div class="verdict bad">✘ El ataque tuvo éxito</div>`
    : `<div class="verdict ok">✔ El ataque fracasó: el banco lo rechazó</div>`;
}

function resultHtml(result, full) {
  const report = result.report?.length ? `<pre class="trace">${esc(result.report.join("\n"))}</pre>` : "";
  const conclusion = result.conclusion ? `<p>${esc(result.conclusion)}</p>` : "";
  const exchange = result.exchange ? `<details><summary>Mensaje que envió el atacante</summary>
      <pre class="json">${fmtJson(result.exchange, full)}</pre></details>` : "";
  const data = result.result ? `<details><summary>Datos del experimento</summary>
      <pre class="json">${fmtJson(result.result, full)}</pre></details>` : "";
  return `<div class="card"><h2 class="section">${esc(result.title)}</h2>${verdict(result)}${conclusion}${report}${exchange}${data}</div>`;
}

/**
 * Dibuja las tarjetas de ataques y conecta sus botones.
 * @param {object} state estado de la interfaz (usa config.attacks, userId y showFull)
 */
export function renderLab(state) {
  const attacks = state.config?.attacks || { live: {}, offline: {} };
  $("#live-attacks").innerHTML = Object.entries(attacks.live).map(([name, title]) => card(name, title, true)).join("");
  $("#offline-attacks").innerHTML = Object.entries(attacks.offline).map(([name, title]) => card(name, title, false)).join("");
  $("#tab-lab").onclick = async (event) => {
    const button = event.target.closest("[data-attack]");
    if (!button) return;
    button.disabled = true;
    try {
      const result = await api(`/api/lab/attacks/${button.dataset.attack}`, { method: "POST", body: { user_id: state.userId || "cliente01" } });
      $("#lab-result").innerHTML = resultHtml(result, state.showFull);
      $("#lab-result").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  };
}

function table(rows) {
  if (!Array.isArray(rows) || !rows.length || typeof rows[0] !== "object") return "";
  const keys = Object.keys(rows[0]);
  const head = keys.map((key) => `<th>${esc(key)}</th>`).join("");
  const body = rows.map((row) => `<tr>${keys.map((key) => `<td class="mono">${fmtValue(row[key])}</td>`).join("")}</tr>`).join("");
  return `<div style="overflow-x:auto"><table class="list"><thead><tr>${head}</tr></thead>${body}</table></div>`;
}

function jsonSection(name, data) {
  const blocks = Array.isArray(data) ? [["", data]] : Object.entries(data || {}).filter(([, value]) => Array.isArray(value));
  const tables = blocks.map(([key, rows]) => `${key ? `<h4>${esc(key)}</h4>` : ""}${table(rows)}`).join("");
  return tables ? `<div class="card" style="margin-top:14px"><h2 class="section">${esc(name)}</h2>${tables}</div>` : "";
}

/** Carga y dibuja los resultados ya generados en results/ (gráficas y tablas). */
export async function renderResults() {
  const container = $("#results");
  let files = [];
  try { files = await api("/api/results"); } catch (error) { container.innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }
  const images = files.filter((file) => file.endsWith(".png")).map((file) => `<figure><img src="/results/${esc(file)}" alt="${esc(file)}">
      <figcaption>${esc(RESULT_CAPTIONS[file] || file)}</figcaption></figure>`).join("");
  const jsonFiles = files.filter((file) => file.endsWith(".json"));
  const sections = await Promise.all(jsonFiles.map(async (file) => {
    try { return jsonSection(file, await api(`/results/${file}`)); } catch { return ""; }
  }));
  container.innerHTML = (images || sections.join(""))
    ? `<p class="note">Resultados generados de antemano con los experimentos del laboratorio (se regeneran con sus comandos).</p>
       <div class="charts">${images}</div>${sections.join("")}`
    : `<div class="empty">Todavía no hay resultados generados en results/.</div>`;
}
