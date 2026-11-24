/** Índice del Laboratorio: todos los experimentos del proyecto, agrupados, con la pregunta que responde cada uno. */
import type { LabFileKey } from "../../data/source";

export type LabGroup = "comparacion" | "rendimiento" | "ataques" | "verificaciones";

export const LAB_GROUPS: ReadonlyArray<{ id: LabGroup; title: string }> = [
  { id: "comparacion", title: "Comparación con otros mecanismos" },
  { id: "rendimiento", title: "Rendimiento según p" },
  { id: "ataques", title: "Ataques" },
  { id: "verificaciones", title: "Verificaciones" },
];

export interface ExperimentMeta {
  id: string;
  group: LabGroup;
  title: string;
  file: LabFileKey;
  question: string;
}

export const EXPERIMENTS: readonly ExperimentMeta[] = [
  { id: "comparacion", group: "comparacion", title: "Resumen de la comparación", file: "comparacion",
    question: "¿Qué gana y qué cuesta el ZKP frente a contraseña (Argon2id), contraseña + TOTP y SRP-6a?" },
  { id: "comparacion-latencia", group: "comparacion", title: "Latencia de registro e inicio de sesión", file: "comparacion",
    question: "¿Cuánto tarda cada mecanismo en crear una cuenta y en iniciar sesión, de punta a punta por la API real?" },
  { id: "comparacion-red", group: "comparacion", title: "Idas y vueltas y bytes en la red", file: "comparacion",
    question: "¿Cuántos mensajes y cuántos bytes necesita cada mecanismo para registrarse e iniciar sesión?" },
  { id: "comparacion-base-robada", group: "comparacion", title: "Ataque con la base robada", file: "comparacion",
    question: "Si alguien roba la base de datos del banco, ¿cuánto tarda en obtener la credencial de un usuario?" },
  { id: "comparacion-guarda", group: "comparacion", title: "Qué guarda el banco y qué viaja", file: "comparacion",
    question: "¿Qué guarda el banco de cada usuario, viaja algún secreto por la red y se acepta un mensaje repetido?" },
  { id: "comparacion-cualitativa", group: "comparacion", title: "Phishing y fuerza bruta en línea", file: "comparacion",
    question: "¿Cómo resiste cada mecanismo a un sitio falso y a probar credenciales contra el banco?" },
  { id: "latencia-bits", group: "rendimiento", title: "Latencia según los bits de p", file: "latency",
    question: "¿Cuánto tarda un inicio de sesión completo según el tamaño de p y la familia del grupo?" },
  { id: "latencia-aritmeticas", group: "rendimiento", title: "Aritmética propia, nativa y gmpy2", file: "latency",
    question: "¿Cuánto cambia la latencia según la implementación de la potencia modular?" },
  { id: "latencia-razon", group: "rendimiento", title: "Crecimiento medido frente al predicho", file: "latency",
    question: "Al agrandar p, ¿el tiempo crece como k³, como predice el escrito para la multiplicación escolar?" },
  { id: "bsgs", group: "ataques", title: "BSGS: despejar x de la base robada", file: "bsgs",
    question: "Con y robada, ¿cuánto tarda baby-step giant-step en recuperar x según el tamaño de q?" },
  { id: "impostor", group: "ataques", title: "Impostor sin x", file: "experimentos",
    question: "Sin conocer x, ¿con qué probabilidad logra un impostor que el banco lo acepte?" },
  { id: "simulador", group: "ataques", title: "Simulador: conocimiento cero", file: "experimentos",
    question: "¿Se pueden fabricar, sin x, transcripciones indistinguibles de las reales?" },
  { id: "r-repetido", group: "ataques", title: "r repetido revela x", file: "experimentos",
    question: "Si el celular usa el mismo r en dos inicios de sesión, ¿se puede despejar x?" },
  { id: "repeticion", group: "ataques", title: "Repetir una prueba no interactiva", file: "experimentos",
    question: "¿Sirve reenviar una prueba Fiat-Shamir capturada en la red?" },
  { id: "aleatoriedad", group: "verificaciones", title: "r y c nuevos en cada sesión", file: "experimentos",
    question: "¿Se repiten el compromiso t o el reto c entre inicios de sesión?" },
  { id: "aritmetica", group: "verificaciones", title: "Potencia e inverso modular", file: "experimentos",
    question: "¿Dan mod_pow y mod_inverse propios lo mismo que pow de Python y SymPy?" },
];

export const experimentById = (id: string): ExperimentMeta | undefined => EXPERIMENTS.find((e) => e.id === id);

