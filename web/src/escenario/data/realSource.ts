/** Fuente real: endpoints del proceso del celular y SSE del banco (origen distinto, con CORS). */
import { api, listen } from "../../shared/api";
import type { ActRun, BankEvent, PhoneConfig } from "../../shared/types";
import type { ScenarioSource } from "./source";

const BANK_STREAM_PATH = "/events/stream";

export function createRealSource(base = ""): ScenarioSource {
  let bankUrl: string | null = null;

  async function loadConfig(): Promise<PhoneConfig> {
    const config = await api<PhoneConfig>(`${base}/api/config`);
    bankUrl = config.bank_url;
    return config;
  }

  return {
    kind: "real",
    loadConfig,
    startAct: (act, userId) => api<ActRun>(`${base}/api/acts`, { method: "POST", body: userId ? { act, user_id: userId } : { act } }),
    nextStep: (runId) => api<ActRun>(`${base}/api/acts/${encodeURIComponent(runId)}/next`, { method: "POST" }),
    async resetLab(group) {
      await api<unknown>(`${base}/api/lab/reset`, { method: "POST", body: { group } });
      return loadConfig();
    },
    subscribeBank(onEvent, onStatus) {
      const root = (bankUrl ?? "").replace(/\/$/, "");
      return listen<BankEvent>(`${root}${BANK_STREAM_PATH}`, onEvent, onStatus);
    },
  };
}
