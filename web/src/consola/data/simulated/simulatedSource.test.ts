import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BankEvent } from "../../../shared/types";
import { deduceFunnel } from "../../lib/funnel";
import { outcomeOf } from "../../lib/requests";
import { SUMMARY_WINDOW_S } from "../source";
import { SimulatedSource } from "./simulatedSource";
import comparacionJson from "../../../../../results/comparacion.json";
import latencyJson from "../../../../../results/latency.json";
import testsJson from "../../../../../results/tests.json";

const NOW_MS = Date.UTC(2026, 10, 24, 21, 0, 0);
const make = (): SimulatedSource => new SimulatedSource({ seed: 7, nowMs: NOW_MS, clock: () => NOW_MS });

describe("SimulatedSource", () => {
  it("arranca con ~16 minutos de historial dentro de la ventana", async () => {
    const source = make();
    const requests = await source.requests(0, 5000);
    expect(requests.length).toBeGreaterThan(100);
    const first = requests[0].timestamp * 1000;
    expect(NOW_MS - first).toBeGreaterThan(14 * 60 * 1000);
    expect(requests.every((r, i) => i === 0 || r.id > requests[i - 1].id)).toBe(true);
  });

  it("devuelve peticiones con todos los campos del contrato", async () => {
    const [request] = await make().requests(0, 1);
    expect(Object.keys(request).sort()).toEqual([
      "client", "correlation_id", "device", "duration_ms", "id", "mechanism", "method", "path", "request_body",
      "response_body", "route", "signal", "status", "timestamp", "user_agent",
    ]);
    expect(request.correlation_id).toMatch(/^[0-9a-f]{12}:\d+$/);
  });

  it("sigue el guion del brief: la sesión 77991cce… se concede y su repetición se rechaza", async () => {
    const requests = await make().requests(0, 5000);
    const uses = requests.filter((r) => (r.request_body as { session_id?: string } | null)?.session_id === "77991cce63618a8e");
    expect(uses.map(outcomeOf)).toEqual(["granted", "denied"]);
    expect(uses[0].response_body).toMatchObject({ accepted: true, details: { gs: "3", tyc: "3", yc_inv: "4", t_rec: "12" } });
    expect(uses[1].response_body).toMatchObject({ accepted: false, reason: "Sesión inválida" });
    expect(uses[0].client).not.toEqual(uses[1].client);
  });

  it("deduce alertas con evidencia que apunta a peticiones existentes", async () => {
    const source = make();
    const [alerts, requests] = await Promise.all([source.alerts(), source.requests(0, 5000)]);
    const ids = new Set(requests.map((r) => r.id));
    expect(alerts.some((a) => a.kind === "replay" && a.severity === "alta")).toBe(true);
    expect(alerts.some((a) => a.kind === "lockout" && a.user_id === "bruno")).toBe(true);
    alerts.forEach((a) => a.evidence.forEach((id) => expect(ids.has(id)).toBe(true)));
  });

  it("resume la ventana con el tamaño de serie del contrato", async () => {
    const summary = await make().summary(SUMMARY_WINDOW_S);
    expect(summary.window_s).toBe(SUMMARY_WINDOW_S);
    expect(summary.series).toHaveLength(SUMMARY_WINDOW_S / summary.bucket_s);
    expect(summary.totals.auth_ok).toBeGreaterThan(0);
    expect(summary.totals.locked_accounts).toBeGreaterThanOrEqual(1);
    expect(summary.signals["auth.replay"]).toBeGreaterThan(0);
  });

  it("guarda solo y por cuenta y bloquea a bruno", async () => {
    const accounts = await make().accounts();
    expect(accounts.every((a) => Object.keys(a.stored).join() === "y")).toBe(true);
    expect(accounts.find((a) => a.user_id === "ana")?.stored.y).toBe("8");
    expect(accounts.find((a) => a.user_id === "bruno")?.status).toBe("bloqueada");
  });

  it("nunca recibe un cuerpo con x en la auditoría", async () => {
    const audit = await make().audit();
    expect(audit.length).toBeGreaterThan(20);
    expect(audit.some((e) => !e.valid)).toBe(true);
    expect(audit.every((e) => !JSON.stringify(e.body).includes('"x"'))).toBe(true);
  });

  it("el embudo deducido cuenta la repetición de Eve fuera de «respuestas a su sesión»", async () => {
    const funnel = deduceFunnel(await make().requests(0, 5000));
    expect(funnel.challenges).toBeGreaterThanOrEqual(funnel.ownResponses);
    expect(funnel.ownResponses).toBeGreaterThanOrEqual(funnel.granted);
    expect(funnel.nizk).toBeGreaterThan(0);
  });

  it("entrega resultados, mecanismo y pruebas del laboratorio", async () => {
    const source = make();
    const [results, mechanisms, tests, routes] = await Promise.all([source.results(), source.mechanisms(), source.tests(), source.routes()]);
    expect(results.latency?.rows).toHaveLength(latencyJson.rows.length);
    expect(results.bsgs?.predictions[0].q_bits).toBe(160);
    expect(Object.values(results.files).every((f) => f.status === "ok")).toBe(true);
    expect(results.comparacion?.rows.map((r) => r.key)).toEqual(comparacionJson.rows.map((r) => r.key));
    expect(results.experimentos?.impostor?.q).toBe(11);
    expect(mechanisms[0].server).toMatchObject({ group: "toy-23", p: "23", q: "11", g: "4" });
    expect(tests.total).toBe(testsJson.total);
    expect(tests.requirements.map((r) => r.id)).toEqual(testsJson.requirements.map((r) => r.id));
    expect(routes.origin).toBe("respaldo");
  });
});

describe("SimulatedSource en vivo", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("emite eventos nuevos (acceso incluido) mientras alguien escucha y se detiene al dejar de escuchar", async () => {
    const source = new SimulatedSource({ seed: 3 });
    const received: BankEvent[] = [];
    const online = vi.fn();
    const stop = source.stream((e) => received.push(e), online);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(online).toHaveBeenCalledWith(true);
    expect(received.some((e) => e.kind === "acceso")).toBe(true);
    stop();
    const count = received.length;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(received.length).toBe(count);
  });

  it("los eventos de acceso traen los campos de AccessData", async () => {
    const events = await new SimulatedSource({ seed: 5 }).events(0);
    const access = events.find((e) => e.kind === "acceso");
    expect(access?.data).toMatchObject({ method: expect.any(String), path: expect.any(String), status: expect.any(Number), client: expect.any(String) });
  });
});
