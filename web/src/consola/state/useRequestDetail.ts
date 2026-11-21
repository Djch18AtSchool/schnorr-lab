/**
 * Detalle de la petición elegida (GET /telemetry/requests/{id}). Lo que el banco registró al
 * atender una petición ya no cambia, así que cada detalle se pide una sola vez.
 */
import { useEffect, useRef, useState } from "react";
import type { RequestDetail } from "../../shared/types";
import type { ConsoleDataSource } from "../data/source";

export type DetailState =
  | { status: "idle" }
  | { status: "loading"; id: number }
  | { status: "ok"; detail: RequestDetail }
  | { status: "error"; id: number; message: string };

export function useRequestDetail(source: ConsoleDataSource, id: number | null): DetailState {
  const cache = useRef(new Map<number, RequestDetail>());
  const [state, setState] = useState<DetailState>({ status: "idle" });
  useEffect(() => {
    if (id === null) {
      setState({ status: "idle" });
      return undefined;
    }
    const cached = cache.current.get(id);
    if (cached) {
      setState({ status: "ok", detail: cached });
      return undefined;
    }
    let alive = true;
    setState({ status: "loading", id });
    source.requestDetail(id).then(
      (detail) => {
        cache.current.set(id, detail);
        if (alive) setState({ status: "ok", detail });
      },
      (error: unknown) => {
        if (alive) setState({ status: "error", id, message: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => { alive = false; };
  }, [source, id]);
  return state;
}
