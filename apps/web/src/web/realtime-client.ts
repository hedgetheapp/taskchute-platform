import {
  mergeRealtimeScopes,
  parseRealtimeInvalidation,
  type RealtimeInvalidation,
  type RealtimeScope,
} from "../shared/realtime";

export type RealtimeConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting";

export interface RealtimeConnectionOptions {
  endpoint?: string;
  WebSocket?: typeof globalThis.WebSocket;
  fetch?: typeof globalThis.fetch;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
  random?: () => number;
  onMessage: (message: RealtimeInvalidation) => void;
  onConnected?: () => void;
  onAuthFailure?: () => void;
  onStatus?: (status: RealtimeConnectionStatus) => void;
}

const MAX_RECONNECT_DELAY_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 500;

function websocketEndpoint(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/v1/realtime`;
}

export class RealtimeConnectionManager {
  private readonly endpoint: string;
  private readonly WebSocketConstructor: typeof globalThis.WebSocket;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly setTimer: typeof globalThis.setTimeout;
  private readonly clearTimer: typeof globalThis.clearTimeout;
  private readonly random: () => number;
  private readonly onMessage: (message: RealtimeInvalidation) => void;
  private readonly onConnected?: () => void;
  private readonly onAuthFailure?: () => void;
  private readonly onStatus?: (status: RealtimeConnectionStatus) => void;
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private pendingScopes: RealtimeScope[] = [];
  private messageFlushScheduled = false;
  private attempt = 0;
  private started = false;
  private connecting = false;

  constructor(options: RealtimeConnectionOptions) {
    this.endpoint = options.endpoint ?? websocketEndpoint();
    this.WebSocketConstructor = options.WebSocket ?? globalThis.WebSocket;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.setTimer = options.setTimeout ?? globalThis.setTimeout.bind(globalThis);
    this.clearTimer = options.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);
    this.random = options.random ?? Math.random;
    this.onMessage = options.onMessage;
    this.onConnected = options.onConnected;
    this.onAuthFailure = options.onAuthFailure;
    this.onStatus = options.onStatus;
  }

  start(): void {
    this.started = true;
    if (typeof this.WebSocketConstructor !== "function") {
      this.started = false;
      this.setStatus("idle");
      return;
    }
    if (!this.socket && !this.connecting && this.reconnectTimer === null) void this.connect();
  }

  stop(): void {
    this.started = false;
    this.connecting = false;
    if (this.reconnectTimer !== null) {
      this.clearTimer(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.pendingScopes = [];
    this.messageFlushScheduled = false;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try { socket.close(1000, "signed out"); } catch { /* best effort */ }
    }
    this.setStatus("idle");
  }

  private setStatus(status: RealtimeConnectionStatus): void {
    this.onStatus?.(status);
  }

  private async connect(): Promise<void> {
    if (!this.started || this.connecting || this.socket) return;
    this.connecting = true;
    this.setStatus(this.attempt === 0 ? "connecting" : "reconnecting");
    try {
      // WebSocket does not expose the HTTP status of a failed handshake. A
      // rejected probe lets D-104 distinguish an expired session from a
      // transient socket/network failure without making the WebSocket channel
      // a data transport.
      const probe = await this.fetchImpl(this.httpProbeEndpoint(), { credentials: "same-origin" });
      if (!this.started) return;
      if (probe.status === 401) {
        this.connecting = false;
        this.started = false;
        this.setStatus("idle");
        this.onAuthFailure?.();
        return;
      }
      if (probe.status !== 426 && !probe.ok) {
        this.connecting = false;
        this.scheduleReconnect();
        return;
      }
      const socket = new this.WebSocketConstructor(this.endpoint);
      this.socket = socket;
      socket.onopen = () => {
        this.connecting = false;
        this.attempt = 0;
        this.setStatus("connected");
        this.onConnected?.();
      };
      socket.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        const message = parseRealtimeInvalidation(event.data);
        if (message) this.enqueueMessage(message);
      };
      socket.onerror = () => { /* close schedules the bounded reconnect */ };
      socket.onclose = () => {
        if (this.socket === socket) this.socket = null;
        this.connecting = false;
        if (this.started) this.scheduleReconnect();
      };
    } catch {
      this.connecting = false;
      if (this.started) this.scheduleReconnect();
    }
  }

  private httpProbeEndpoint(): string {
    return this.endpoint.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  }

  private enqueueMessage(message: RealtimeInvalidation): void {
    this.pendingScopes = [...this.pendingScopes, ...message.scopes];
    if (this.messageFlushScheduled) return;
    this.messageFlushScheduled = true;
    queueMicrotask(() => {
      this.messageFlushScheduled = false;
      const scopes = mergeRealtimeScopes(this.pendingScopes);
      this.pendingScopes = [];
      if (scopes.length > 0 && this.started) {
        this.onMessage({ version: 1, type: "invalidate", scopes });
      }
    });
  }

  private scheduleReconnect(): void {
    if (!this.started || this.reconnectTimer !== null) return;
    const exponential = Math.min(MAX_RECONNECT_DELAY_MS, INITIAL_RECONNECT_DELAY_MS * 2 ** this.attempt);
    this.attempt = Math.min(this.attempt + 1, 8);
    const jitter = Math.floor(exponential * ((this.random() * 0.4) - 0.2));
    this.setStatus("reconnecting");
    this.reconnectTimer = this.setTimer(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, Math.max(100, exponential + jitter));
  }
}

export function scopesForMountedRealtimeRefresh(scopes: RealtimeScope[]): RealtimeScope[] {
  return mergeRealtimeScopes(scopes);
}
