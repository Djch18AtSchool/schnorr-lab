import { afterEach, describe, expect, it, vi } from "vitest";
import { listen } from "./api";

/** EventSource mínimo: guarda los manejadores para que la prueba simule lo que hace el navegador. */
class FakeEventSource {
  static last: FakeEventSource | null = null;
  onmessage: ((message: MessageEvent<string>) => void) | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }

  close(): void {
    this.closed = true;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeEventSource.last = null;
});

describe("listen", () => {
  it("entrega los eventos sin nombre, incluidos los de tipo error, sin marcar desconexión", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const onEvent = vi.fn();
    const onStatus = vi.fn();
    listen("/events/stream", onEvent, onStatus);
    const source = FakeEventSource.last!;

    source.onopen?.();
    source.onmessage?.({ data: JSON.stringify({ id: 7, kind: "error", title: "Cuenta bloqueada" }) } as MessageEvent<string>);

    expect(onEvent).toHaveBeenCalledWith({ id: 7, kind: "error", title: "Cuenta bloqueada" });
    expect(onStatus.mock.calls).toEqual([[true]]);
  });

  it("marca la desconexión solo cuando se corta la conexión y permite cerrarla", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const onStatus = vi.fn();
    const close = listen("/events/stream", vi.fn(), onStatus);
    const source = FakeEventSource.last!;

    source.onerror?.();
    close();

    expect(onStatus).toHaveBeenCalledWith(false);
    expect(source.closed).toBe(true);
  });
});
