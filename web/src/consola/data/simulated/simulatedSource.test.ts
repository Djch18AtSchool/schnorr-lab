import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BankEvent } from "../../../shared/types";
import { groupAttempts } from "../../lib/attempts";
import { SimulatedSource } from "./simulatedSource";
import latencyJson from "../../../../../results/latency.json";
import testsJson from "../../../../../results/tests.json";

const NOW_MS = Date.UTC(2026, 10, 24, 21, 0, 0);
const make = (): SimulatedSource => new SimulatedSource({ seed: 7, nowMs: NOW_MS, clock: () => NOW_MS });
const DEVICES = ["celular de Ana", "laptop de Eve", "soporte del banco"];

describe("SimulatedSource", () => {
  it("arranca con unos minutos de historial, en orden y sin peticiones futuras", async () => {
    const requests = await make().requests(0, 5000);
    expect(requests.length).toBeGreaterThan(40);
    expect(NOW_MS / 1000 - requests[0].timestamp).toBeGreaterThan(4 * 60);
    expect(requests.every((r) => r.timestamp * 1000 <= NOW_MS)).toBe(true);
    expect(requests.every((r, i) => i === 0 || r.id > requests[i - 1].id)).toBe(true);
  });

  it("devuelve peticiones con todos los campos del contrato y los dispositivos del Escenario", async () => {
    const requests = await make().requests(0, 5000);
    expect(Object.keys(requests[0]).sort()).toEqual([
      "client", "correlation_id", "device", "duration_ms", "id", "mechanism", "method", "path", "request_body",
      "response_body", "route", "signal", "status", "tags", "timestamp", "user_agent",
    ]);
    expect(new Set(requests.map((r) => r.device))).toEqual(new Set(DEVICES));
  });

  it("etiqueta las sesiones para agrupar commit y respond en un intento", async () => {
    const attempts = groupAttempts(await make().requests(0, 5000));
    const login = attempts.find((a) => a.kind === "interactivo" && a.outcome.tone === "ok");
    expect(login?.requests.map((r) => r.path)).toEqual(["/zkp/params", "/zkp/login/commit", "/zkp/login/respond"]);
  });

  it("deduce repetición y bloqueo con evidencia que existe, y soporte desbloquea después", async () => {
    const source = make();
    const [alerts, requests, accounts] = await Promise.all([source.alerts(), source.requests(0, 5000), source.accounts()]);
    const ids = new Set(requests.map((r) => r.id));
    expect(alerts.some((a) => a.kind === "replay" && a.severity === "alta" && a.detail.includes("laptop de Eve"))).toBe(true);
    expect(alerts.some((a) => a.kind === "lockout" && a.user_id === "ana")).toBe(true);
    alerts.forEach((a) => a.evidence.forEach((id) => expect(ids.has(id)).toBe(true)));
    expect(requests.some((r) => r.signal === "admin.unlock" && r.device === "soporte del banco")).toBe(true);
    expect(accounts[0]).toMatchObject({ user_id: "ana", stored: { y: "8" } });
    expect(accounts[0].devices.map((d) => d.device)).toEqual(expect.arrayContaining(DEVICES));
  });

  it("el detalle trae la línea de acceso, el log, la función y los cálculos de la petición", async () => {
    const source = make();
    const requests = await source.requests(0, 5000);
    const granted = requests.find((r) => r.signal === "auth.ok");
    const detail = await source.requestDetail(granted?.id ?? 0);
    expect(detail.events.every((e) => e.request_id === granted?.id)).toBe(true);
    expect(detail.events.map((e) => e.kind)).toEqual(["verificacion", "acceso"]);
    expect(detail.events[0].data).toMatchObject({ event: expect.any(String), level: "INFO", span: { tone: "ok" } });
    await expect(source.requestDetail(999_999)).rejects.toThrow("No hay registro");
  });

  it("nunca recibe un cuerpo con x en la auditoría", async () => {
    const audit = await make().audit();
    expect(audit.length).toBeGreaterThan(10);
    expect(audit.every((e) => !JSON.stringify(e.body).includes('"x"'))).toBe(true);
  });

  it("entrega resultados, mecanismo y pruebas del laboratorio", async () => {
    const source = make();
    const [results, mechanisms, tests, routes] = await Promise.all([source.results(), source.mechanisms(), source.tests(), source.routes()]);
    expect(results.latency?.rows).toHaveLength(latencyJson.rows.length);
    expect(mechanisms[0].server).toMatchObject({ group: "toy-23", p: "23", q: "11", g: "4" });
    expect(tests.total).toBe(testsJson.total);
    expect(routes.origin).toBe("respaldo");
  });
});

describe("SimulatedSource en vivo", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("emite eventos con request_id mientras alguien escucha y se detiene al dejar de escuchar", async () => {
    const source = new SimulatedSource({ seed: 3 });
    const received: BankEvent[] = [];
    const online = vi.fn();
    const stop = source.stream((e) => received.push(e), online);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(online).toHaveBeenCalledWith(true);
    expect(received.some((e) => e.kind === "acceso" && typeof e.request_id === "number")).toBe(true);
    stop();
    const count = received.length;
    await vi.advanceTimersByTimeAsync(40_000);
    expect(received.length).toBe(count);
  });
});
