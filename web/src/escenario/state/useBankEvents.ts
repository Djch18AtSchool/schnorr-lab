/** Escucha el SSE del banco y guarda sus eventos por correlación (validando lo que llega). */
import { useEffect, useState } from "react";
import type { BankEvent } from "../../shared/types";
import type { ScenarioSource } from "../data/source";
import { addEvent, EMPTY_STORE, type EventStore } from "../model/events";

export function isBankEvent(value: unknown): value is BankEvent {
  if (value === null || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "number" &&
    typeof e.kind === "string" &&
    typeof e.title === "string" &&
    (e.correlation_id === null || typeof e.correlation_id === "string") &&
    e.data !== null &&
    typeof e.data === "object"
  );
}

export interface BankFeed {
  store: EventStore;
  online: boolean;
}

/** `enabled` se activa cuando ya se conoce bank_url (config cargada). */
export function useBankEvents(source: ScenarioSource, enabled: boolean): BankFeed {
  const [store, setStore] = useState<EventStore>(EMPTY_STORE);
  const [online, setOnline] = useState(false);
  useEffect(() => {
    if (!enabled) return undefined;
    return source.subscribeBank(
      (event) => {
        if (isBankEvent(event)) setStore((current) => addEvent(current, event));
      },
      setOnline,
    );
  }, [source, enabled]);
  return { store, online };
}
