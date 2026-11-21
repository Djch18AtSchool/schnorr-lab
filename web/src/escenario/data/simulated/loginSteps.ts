/**
 * Pasos del inicio de sesión interactivo con los números del escrito
 * (p = 23, q = 11, g = 4; x = 7, y = 8; r = 5, t = 12, c = 3, s = 4).
 */
import { CHALLENGE_SPAN, DECIDE_SPAN, PARAMS_SPAN } from "./codeSpans";
import { exchange, mechanismEvent, step, type ScriptedStep } from "./script";

export const SESSION_ID = "77991cce63618a8e";

export const TOY_PARAMS = { name: "toy-23", p: "23", q: "11", g: "4", bits: 5 } as const;

export function paramsStep(): ScriptedStep {
  return step({
    id: "params",
    actor: "ana",
    kind: "exchange",
    title: "El celular pide los parámetros del grupo",
    explanation: "Primero pregunta con qué números se va a trabajar. Son públicos: cualquiera puede conocerlos.",
    formula: "p, q y g son públicos",
    message: "El celular ya tiene p = 23, q = 11 y g = 4.",
    exchanges: [
      exchange({
        method: "GET",
        path: "/zkp/params",
        status: 200,
        response: TOY_PARAMS,
        ms: 0.82,
        events: [
          mechanismEvent("paso", "Parámetros públicos del grupo toy-23", {
            event: "params", group: "toy-23", p: "23", q: "11", g: "4", span: PARAMS_SPAN,
            math: ["p = 23 (módulo primo)", "q = 11 (orden del subgrupo)", "g = 4 (generador)"],
          }),
        ],
      }),
    ],
  });
}

export function commitComputeStep(): ScriptedStep {
  return step({
    id: "compromiso",
    actor: "ana",
    kind: "compute",
    title: "El celular elige r y calcula su compromiso",
    explanation: "r es un número al azar que se usa una sola vez. Con él, el celular se compromete sin revelar nada de x.",
    formula: "t = g^r mod p",
    values: { "r (aleatorio, de un solo uso)": "5", t: "12" },
    math: ["t = g^r mod p = 4^5 mod 23 = 12"],
  });
}

export function commitStep(intercepted = false): ScriptedStep {
  return step({
    id: "reto",
    actor: "ana",
    kind: "exchange",
    title: "Viaja el compromiso t",
    explanation: "El mensaje lleva el nombre de usuaria y t. Nada más: ni x, ni r.",
    formula: "t ∈ subgrupo de orden q",
    intercepted,
    message: "El banco respondió con un reto c = 3 y una sesión de un solo uso.",
    exchanges: [
      exchange({
        method: "POST",
        path: "/zkp/login/commit",
        status: 200,
        request: { user_id: "ana", t: "12" },
        response: { session_id: SESSION_ID, c: "3" },
        ms: 4.03,
        events: [
          mechanismEvent("paso", "El banco recibe el compromiso t", { event: "commit", user: "ana", t: "12" }),
          mechanismEvent("paso", "t ∈ subgrupo ✔ → el banco elige el reto c al azar", {
            event: "challenge", user: "ana", t: "12", subgroup: "ok", c: "3", session: SESSION_ID, span: CHALLENGE_SPAN,
            math: ["t^q mod p = 12^11 mod 23 = 1 ✓", "c = secrets.randbelow(q) = 3"],
          }),
        ],
      }),
    ],
  });
}

export function respondComputeStep(): ScriptedStep {
  return step({
    id: "respuesta",
    actor: "ana",
    kind: "compute",
    title: "El celular responde al reto",
    explanation: "s mezcla el reto con la clave secreta. Sin r nadie puede separarlos, y r se borra en cuanto se usa.",
    formula: "s = (r + c·x) mod q",
    values: { "x (secreta, en el chip)": "7", "r": "borrado", s: "4" },
    math: ["s = (r + c·x) mod q = (5 + 3·7) mod 11 = 4"],
    message: "El chip borró r.",
  });
}

const VERIFY_MATH = [
  "g^s = 4^4 mod 23 = 3",
  "t·y^c = 12·8^3 mod 23 = 3 ✓",
  "(y^c)^−1 = 6^−1 mod 23 = 4 (Euclides extendido)",
  "t_rec = g^s·(y^c)^−1 = 3·4 mod 23 = 12 ✓",
];

export function respondStep(intercepted = false): ScriptedStep {
  return step({
    id: "verificacion",
    actor: "ana",
    kind: "exchange",
    title: "Viaja la respuesta s",
    explanation: "Un solo número, atado a esta sesión. El banco verifica sin conocer x.",
    formula: "g^s ≡ t·y^c (mod p)",
    status: "aceptado",
    intercepted,
    message: "Acceso concedido: el banco comprobó que Ana conoce x sin verla nunca.",
    exchanges: [
      exchange({
        method: "POST",
        path: "/zkp/login/respond",
        status: 200,
        request: { session_id: SESSION_ID, s: "4" },
        response: {
          accepted: true, reason: "Acceso concedido", attempts_left: 3,
          details: { gs: "3", yc: "6", tyc: "3", yc_inv: "4", t_rec: "12" },
        },
        ms: 3.41,
        events: [
          mechanismEvent("paso", "El banco recibe la respuesta s", { event: "respond", session: SESSION_ID, s: "4" }),
          mechanismEvent("verificacion", "g^s ≡ t·y^c (mod p) ✔ → acceso concedido", {
            event: "verify", session: SESSION_ID, gs: "3", tyc: "3", t_rec: "12", accepted: true, signal: "auth.ok",
            span: DECIDE_SPAN, math: VERIFY_MATH,
          }),
        ],
      }),
    ],
  });
}
