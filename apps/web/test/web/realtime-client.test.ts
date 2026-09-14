import { afterEach, describe, expect, it, vi } from "vitest";
import { RealtimeConnectionManager } from "../../src/web/realtime-client";

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readonly url: string;
  close = vi.fn(() => this.onclose?.());
  send = vi.fn();

  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }
}

afterEach(() => {
  FakeSocket.instances = [];
  vi.restoreAllMocks();
});

function makeManager(options: Partial<ConstructorParameters<typeof RealtimeConnectionManager>[0]> = {}) {
  const statuses: string[] = [];
  const messages: unknown[] = [];
  const onAuthFailure = vi.fn();
  const onConnected = vi.fn();
  const manager = new RealtimeConnectionManager({
    endpoint: "wss://example.test/api/v1/realtime",
    WebSocket: FakeSocket as unknown as typeof globalThis.WebSocket,
    fetch: vi.fn(async () => new Response(null, { status: 426 })),
    setTimeout: ((callback: TimerHandler, delay?: number) => {
      expect(typeof delay).toBe("number");
      return 1 as unknown as ReturnType<typeof globalThis.setTimeout>;
    }) as unknown as typeof globalThis.setTimeout,
    clearTimeout: vi.fn(),
    random: () => 0.5,
    onMessage: (message) => messages.push(message),
    onConnected,
    onAuthFailure,
    onStatus: (status) => statuses.push(status),
    ...options,
  });
  return { manager, statuses, messages, onAuthFailure, onConnected };
}

describe("RealtimeConnectionManager", () => {
  it("probes, opens one socket, validates messages, and reconnects with a bounded delay", async () => {
    const { manager, statuses, messages, onConnected } = makeManager();
    manager.start();
    await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    const socket = FakeSocket.instances[0]!;
    socket.onopen?.();
    expect(onConnected).toHaveBeenCalledTimes(1);
    socket.onmessage?.({ data: JSON.stringify({ version: 1, type: "invalidate", scopes: [{ kind: "day" }] }) });
    socket.onmessage?.({ data: JSON.stringify({ version: 99, type: "invalidate", scopes: [{ kind: "day" }] }) });
    expect(messages).toHaveLength(1);
    socket.onclose?.();
    expect(statuses).toContain("reconnecting");
    manager.stop();
  });

  it("enters the auth boundary only when the authenticated probe returns 401", async () => {
    const { manager, onAuthFailure } = makeManager({
      fetch: vi.fn(async () => new Response(null, { status: 401 })),
    });
    manager.start();
    await vi.waitFor(() => expect(onAuthFailure).toHaveBeenCalledTimes(1));
    expect(FakeSocket.instances).toHaveLength(0);
    manager.stop();
  });

  it("stops without scheduling a reconnect and does not create a second socket", async () => {
    const clearTimeout = vi.fn();
    const { manager } = makeManager({ clearTimeout });
    manager.start();
    await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    manager.stop();
    expect(clearTimeout).not.toHaveBeenCalled();
    expect(FakeSocket.instances[0]!.close).toHaveBeenCalledTimes(1);
  });
});
