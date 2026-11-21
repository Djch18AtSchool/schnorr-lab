/**
 * Datos fijos de la simulación: copia de results/latency.json y results/bsgs.json (mediciones
 * reales, Python 3.12.13), el mecanismo registrado y un informe de pruebas con los conteos del repo.
 */
import type { BankMechanism, TestReport } from "../../../shared/types";
import type { BsgsResults, LatencyResults } from "../source";
import { MAX_ATTEMPTS, TOY } from "./toy";

type LatencyTuple = readonly [string, string, number, number, string, string, number];

const LATENCY_ROWS: readonly LatencyTuple[] = [
  ["safe-256", "safe", 256, 255, "<80", "propia", 0.0006116450022091158], ["safe-256", "safe", 256, 255, "<80", "nativa", 0.0004041920037707314],
  ["safe-256", "safe", 256, 255, "<80", "gmpy2", 0.00014150599599815905], ["safe-512", "safe", 512, 511, "<80", "propia", 0.0027939879946643487],
  ["safe-512", "safe", 512, 511, "<80", "nativa", 0.001865619997261092], ["safe-512", "safe", 512, 511, "<80", "gmpy2", 0.0003794229996856302],
  ["safe-1024", "safe", 1024, 1023, "80", "propia", 0.014337041997350752], ["safe-1024", "safe", 1024, 1023, "80", "nativa", 0.009866366999631282],
  ["safe-1024", "safe", 1024, 1023, "80", "gmpy2", 0.00185974600026384], ["rfc-2048", "rfc", 2048, 2047, "112", "propia", 0.0947361729995464],
  ["rfc-2048", "rfc", 2048, 2047, "112", "nativa", 0.0653852619943791], ["rfc-2048", "rfc", 2048, 2047, "112", "gmpy2", 0.008660193001560401],
  ["rfc-3072", "rfc", 3072, 3071, "128", "propia", 0.3052933880026103], ["rfc-3072", "rfc", 3072, 3071, "128", "nativa", 0.20891663599468302],
  ["rfc-3072", "rfc", 3072, 3071, "128", "gmpy2", 0.025964317996113095], ["schnorr-2048", "schnorr", 2048, 224, "112", "propia", 0.011100310999609064],
  ["schnorr-2048", "schnorr", 2048, 224, "112", "nativa", 0.009008957000332884], ["schnorr-2048", "schnorr", 2048, 224, "112", "gmpy2", 0.001970128003449645],
  ["schnorr-3072", "schnorr", 3072, 256, "128", "propia", 0.025808539998251945], ["schnorr-3072", "schnorr", 3072, 256, "128", "nativa", 0.02088725099747535],
  ["schnorr-3072", "schnorr", 3072, 256, "128", "gmpy2", 0.003995732004113961],
];

export const LATENCY: LatencyResults = {
  python: "3.12.13",
  platform: "Linux-6.18 x86_64",
  rows: LATENCY_ROWS.map(([name, family, bits_p, bits_q, security_bits, backend, median_s]) => ({
    name, family, series: family === "schnorr" ? "schnorr" : "primo seguro", bits_p, bits_q, security_bits, backend, reps: 31, median_s,
  })),
};

export const BSGS: BsgsResults = {
  rows: [
    [16, 48, 281, 7.746799383312464e-05, 15181], [20, 52, 1094, 0.0003295939968666062, 263437], [24, 56, 3679, 0.0006600260021514259, 342257],
    [28, 60, 24724, 0.003730507000000216, 144582057], [32, 64, 69372, 0.014722963998792693, 487259637],
    [36, 68, 398043, 0.08187077200273052, 39030030670], [40, 72, 998623, 0.2729346490013995, 48081162160],
  ].map(([q_bits, p_bits, operations, seconds, x]) => ({ q_bits, p_bits, operations, seconds, x_real: x, x_found: x })),
  fit: { seconds_per_operation: 2.637643606353062e-07, growth_exponent: 0.49768244272823026, expected_growth_exponent: 0.5 },
  holdout: { q_bits: 40, relative_error: 0.24748833613786167 },
  predictions: [
    { q_bits: 160, operations: 1.8133887294219438e24, seconds: 4.783073187992493e17, years: 15156644320.203352 },
    { q_bits: 224, operations: 7.788445287802241e33, seconds: 2.0543142916802216e27, years: 6.509729167237755e19 },
    { q_bits: 256, operations: 5.104235503814077e38, seconds: 1.34631541419555e32, years: 4.266216107040935e24 },
  ],
  universe_age_years: 13.8e9,
};

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

/** Archivos de pruebas del repositorio y cuántas pruebas tiene cada uno. */
const TEST_FILES: ReadonlyArray<readonly [string, number]> = [
  ["test_api.py", 23], ["test_attacks.py", 14], ["test_backends.py", 13], ["test_bsgs.py", 19], ["test_client_app.py", 17], ["test_contracts.py", 4],
  ["test_demo.py", 11], ["test_fiat_shamir.py", 45], ["test_infra.py", 4], ["test_latency.py", 13], ["test_modular.py", 24], ["test_params.py", 44],
  ["test_protocol.py", 39], ["test_replay.py", 5],
];

const REQUIREMENTS: ReadonlyArray<readonly [string, string, readonly string[]]> = [
  ["R1", "Parámetros públicos válidos (p, q primos, p = 2q + 1, g^q ≡ 1)", ["test_params.py"]],
  ["R2", "El banco guarda solo y", ["test_protocol.py", "test_client_app.py"]],
  ["R3", "r y c nuevos en cada sesión", ["test_protocol.py"]],
  ["R4", "Potencia modular rápida propia", ["test_modular.py", "test_backends.py"]],
  ["R5", "Inverso modular con Euclides extendido", ["test_modular.py"]],
  ["R6", "Verificación g^s ≡ t·y^c (mod p)", ["test_protocol.py"]],
  ["R7", "Distintos tamaños de p y su latencia", ["test_params.py", "test_latency.py", "test_protocol.py"]],
  ["R8", "Variante no interactiva (Fiat-Shamir)", ["test_fiat_shamir.py"]],
  ["R9", "Validación de entradas y bloqueo al tercer fallo", ["test_protocol.py", "test_api.py"]],
  ["R10", "Laboratorio de ataques", ["test_attacks.py", "test_bsgs.py", "test_replay.py", "test_contracts.py"]],
  ["R11", "Interfaz de revisión", ["test_client_app.py", "test_api.py", "test_demo.py", "test_infra.py"]],
];

const testsOf = (file: string) => {
  const count = TEST_FILES.find(([name]) => name === file)?.[1] ?? 0;
  return Array.from({ length: count }, (_, i) => ({ name: `caso_${i + 1}`, file: `tests/${file}`, outcome: "passed" as const }));
};

export function testReport(nowS: number): TestReport {
  const total = TEST_FILES.reduce((sum, [, n]) => sum + n, 0);
  return {
    generated_at: nowS - 3600, duration_s: 41.7, total, passed: total, failed: 0, skipped: 0,
    requirements: REQUIREMENTS.map(([id, title, files]) => ({ id, title, tests: files.flatMap(testsOf) })),
  };
}
