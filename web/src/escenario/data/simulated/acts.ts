/** Actos del guion simulado: registro, inicio de sesión, no interactivo y espía que repite. */
import type { ActInfo } from "../../../shared/types";
import { NIZK_SPAN, REGISTER_SPAN, REPLAY_SPAN } from "./codeSpans";
import { commitComputeStep, commitStep, paramsStep, respondComputeStep, respondStep, SESSION_ID } from "./loginSteps";
import { act, exchange, mechanismEvent, step, type ScriptedAct } from "./script";

const registro = act({
  id: "registro",
  title: "Registro",
  summary: "Ana instala la app de Banco Lab. El celular crea su clave y el banco guarda solo la parte pública: y = 8.",
  cast: ["ana", "red", "banco"],
  finalStatus: "aceptado",
  steps: [
    step({
      id: "clave", actor: "ana", kind: "compute",
      title: "El celular crea la clave de Ana",
      explanation: "La clave secreta x se genera dentro del chip seguro y nunca sale del teléfono. Solo se calcula su parte pública y.",
      formula: "y = g^x mod p",
      values: { "x (secreta, nunca sale del chip)": "7", "y (pública)": "8" },
      math: ["y = g^x mod p = 4^7 mod 23 = 8"],
    }),
    step({
      id: "alta", actor: "ana", kind: "exchange",
      title: "Viaja solo la clave pública y",
      explanation: "El banco recibe el nombre de usuaria y la clave pública. Ninguna contraseña viaja ni se guarda.",
      formula: "y ∈ subgrupo de orden q",
      status: "aceptado",
      message: "Cuenta creada. El banco guarda solo y = 8.",
      exchanges: [
        exchange({
          method: "POST", path: "/zkp/register", status: 201,
          request: { user_id: "ana", y: "8" }, response: { user_id: "ana", stored: { y: "8" } }, ms: 2.1,
          events: [
            mechanismEvent("registro", "El banco recibe una clave pública", { event: "register", user_id: "ana", y: "8" }),
            mechanismEvent("registro", "y ∈ subgrupo de orden q ✔ → el banco guarda (id, y)", {
              event: "stored", user_id: "ana", y: "8", guardado: "solo y", span: REGISTER_SPAN,
              math: ["y^q mod p = 8^11 mod 23 = 1 ✓", "y ≠ 1 ✓"],
            }),
          ],
        }),
      ],
    }),
  ],
});

const login = act({
  id: "login",
  title: "Inicio de sesión",
  summary: "Ana entra a su banco sin contraseña: demuestra que conoce su clave secreta x sin enviarla nunca. El banco solo guarda y = 8.",
  cast: ["ana", "red", "banco"],
  finalStatus: "aceptado",
  steps: [paramsStep(), commitComputeStep(), commitStep(), respondComputeStep(), respondStep()],
});

const nizk = act({
  id: "nizk",
  title: "Inicio no interactivo",
  summary: "Con Fiat-Shamir el reto no lo elige el banco: sale de una función hash. Toda la prueba viaja en un solo mensaje.",
  cast: ["ana", "red", "banco"],
  finalStatus: "aceptado",
  steps: [
    paramsStep(),
    step({
      id: "prueba", actor: "ana", kind: "compute",
      title: "El celular prepara la prueba completa",
      explanation: "Sin esperar al banco: el reto c sale de una función hash sobre los datos públicos, el compromiso y la hora m.",
      formula: "c = SHA-256(p‖g‖y‖t‖id‖m) mod q",
      values: { "r (aleatorio, de un solo uso)": "3", t: "18", "c (hash)": "4", s: "9" },
      math: [
        "t = g^r mod p = 4^3 mod 23 = 18",
        "c = SHA-256(p‖g‖y‖t‖id‖m) mod q = 4",
        "s = (r + c·x) mod q = (3 + 4·7) mod 11 = 9",
      ],
    }),
    step({
      id: "envio", actor: "ana", kind: "exchange",
      title: "Viaja la prueba en un solo mensaje",
      explanation: "t, s y la marca de tiempo m viajan juntos. El banco recalcula c por su cuenta y verifica.",
      formula: "g^s ≡ t·y^c (mod p)",
      status: "aceptado",
      message: "Acceso concedido con un solo mensaje.",
      exchanges: [
        exchange({
          method: "POST", path: "/zkp/login/nizk", status: 200,
          request: { user_id: "ana", t: "18", s: "9", m: "1795222446" },
          response: { accepted: true, reason: "Acceso concedido", attempts_left: 3 }, ms: 2.95,
          events: [
            mechanismEvent("verificacion", "c recalculado con el hash y g^s ≡ t·y^c ✔ → acceso concedido", {
              event: "nizk", user: "ana", t: "18", s: "9", fresh: "ok", c: "4", accepted: true, signal: "auth.ok", span: NIZK_SPAN,
              math: ["c = H(p‖g‖y‖t‖id‖m) mod q = 4", "g^s = 4^9 mod 23 = 13", "t·y^c = 18·8^4 mod 23 = 13 ✓"],
            }),
          ],
        }),
      ],
    }),
  ],
});

const REPLAY_BODY = { session_id: SESSION_ID, s: "4" };

const espiaRespuesta = act({
  id: "espia_respuesta",
  title: "Espía repite la respuesta",
  summary: "Eve está en el mismo Wi-Fi del café que Ana. No conoce x: solo puede mirar lo que pasa por la red y reenviarlo.",
  cast: ["ana", "red", "banco", "eve"],
  finalStatus: "rechazado",
  steps: [
    step({
      id: "escucha", actor: "eve", kind: "attack",
      title: "Eve escucha la red",
      explanation: "Pone su tarjeta de red a capturar todo el tráfico que va hacia el banco.",
      terminal: [
        { kind: "cmd", text: "sudo tcpdump -i wlan0 -A 'port 8000'" },
        { kind: "out", text: "listening on wlan0, link-type EN10MB (Ethernet)" },
      ],
    }),
    commitComputeStep(),
    commitStep(true),
    respondComputeStep(),
    respondStep(true),
    step({
      id: "guarda", actor: "eve", kind: "attack",
      title: "Eve guarda la respuesta de Ana",
      explanation: "Tiene en sus manos un mensaje que el banco aceptó hace un momento. ¿Le servirá a ella?",
      values: { "respuesta.json (copiado)": "session_id 77991cce…, s = 4" },
      terminal: [{ kind: "out", text: "^C  4 paquetes capturados → respuesta.json" }],
    }),
    step({
      id: "reenvia", actor: "eve", kind: "attack",
      title: "Eve reenvía exactamente el mismo mensaje",
      explanation: "No cambia ni un byte. Si el banco solo revisara la matemática, la congruencia se cumpliría otra vez.",
      status: "rechazado",
      message: "Sesión inválida: cada reto vale una sola vez. Ana sigue con sus 3 intentos.",
      terminal: [
        { kind: "cmd", text: "curl -s -X POST banco.lab:8000/zkp/login/respond -d @respuesta.json" },
        { kind: "bad", text: '{"accepted":false,"reason":"Sesión inválida"}' },
      ],
      exchanges: [
        exchange({
          method: "POST", path: "/zkp/login/respond", status: 200, origin: "eve",
          request: REPLAY_BODY, response: { accepted: false, reason: "Sesión inválida" }, ms: 0.37,
          events: [
            mechanismEvent("verificacion", "Sesión inexistente o ya usada → rechazo sin contar fallo", {
              event: "verify", session: SESSION_ID, accepted: false, reason: "Sesión inválida", signal: "auth.replay",
              span: REPLAY_SPAN, math: ["_sessions.pop(session_id) → None: la sesión ya se usó", "intentos de Ana: siguen en 3 ✓"],
            }),
          ],
        }),
      ],
    }),
  ],
});

export const SCRIPTED_ACTS: readonly ScriptedAct[] = [registro, login, nizk, espiaRespuesta];

const PENDING: ReadonlyArray<Pick<ActInfo, "id" | "title" | "summary" | "cast">> = [
  { id: "robo_base", title: "Robo de la base de datos", summary: "Eve obtiene la tabla del banco: solo claves públicas.", cast: ["eve", "red", "banco"] },
  { id: "impostor", title: "Impostor", summary: "Eve intenta adivinar el reto para hacerse pasar por Ana.", cast: ["eve", "red", "banco"] },
  { id: "espia_nizk", title: "Espía repite la prueba no interactiva", summary: "Eve reenvía una prueba de un solo mensaje.", cast: ["ana", "red", "banco", "eve"] },
  { id: "r_repetido", title: "r repetido", summary: "Si el celular repite r, x se despeja.", cast: ["ana", "red", "banco", "eve"] },
];

export function simulatedActs(): ActInfo[] {
  const ready = SCRIPTED_ACTS.map((a) => a.info);
  const pending = PENDING.map((p): ActInfo => ({ ...p, mechanism: "zkp", available: false, steps: [] }));
  return [...ready, ...pending];
}
