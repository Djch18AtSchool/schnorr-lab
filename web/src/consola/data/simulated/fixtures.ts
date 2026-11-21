/** Datos fijos de la simulación: el mecanismo registrado (los resultados vienen de labData.ts). */
import type { BankMechanism } from "../../../shared/types";
import { MAX_ATTEMPTS, TOY } from "./toy";

const step = (id: string, actor: string, title: string, formula: string) => ({ id, actor, title, explanation: "", formula });

export const MECHANISMS: BankMechanism[] = [{
  id: "zkp",
  name: "Prueba de conocimiento cero (Schnorr)",
  category: "sin contraseña",
  summary: "El cliente demuestra que conoce x tal que y = g^x mod p sin revelarlo.",
  flows: [
    { id: "register", title: "Crear cuenta", available: true, steps: [step("keygen", "cliente", "Generar el par de claves", "y = g^x mod p"), step("register", "red", "Enviar solo y al banco", "y^q ≡ 1 (mod p)")] },
    { id: "login", title: "Iniciar sesión (interactivo)", available: true, steps: [step("commit", "cliente", "Compromiso", "t = g^r mod p"), step("challenge", "red", "Reto", "c ∈ [0, q − 1]"), step("verify", "banco", "Verificar", "g^s ≡ t·y^c (mod p)")] },
    { id: "nizk", title: "Iniciar sesión (Fiat-Shamir)", available: true, steps: [step("nizk", "red", "Prueba en un mensaje", "c = H(p‖g‖y‖t‖id‖m) mod q")] },
  ],
  server: { group: TOY.name, bits: TOY.bits, q_bits: TOY.qBits, p: String(TOY.p), q: String(TOY.q), g: String(TOY.g), max_attempts: MAX_ATTEMPTS },
}];
