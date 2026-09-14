import { DurableObject } from "cloudflare:workers";
import { parsePublishRequest } from "./realtime-invalidation";
import { serializeRealtimeInvalidation, type RealtimeInvalidation } from "../src/shared/realtime";

const INTERNAL_PUBLISH_PATH = "/__taskchute_publish";
const INTERNAL_PUBLISH_HEADER = "x-taskchute-realtime-internal";

export class RealtimeHub extends DurableObject {
  private broadcast(message: RealtimeInvalidation): void {
    const serialized = serializeRealtimeInvalidation(message.scopes);
    if (!serialized) return;
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(serialized);
      } catch {
        try { socket.close(1011, "Realtime delivery failed"); } catch { /* best effort */ }
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === INTERNAL_PUBLISH_PATH
      && request.headers.get(INTERNAL_PUBLISH_HEADER) === "publish") {
      const body = await request.text();
      const invalidation = parsePublishRequest(body);
      if (!invalidation) return new Response("Invalid realtime message", { status: 400 });
      this.broadcast(invalidation);
      return new Response(null, { status: 204 });
    }

    const upgrade = request.headers.get("upgrade")?.toLowerCase();
    if (request.method !== "GET" || upgrade !== "websocket") {
      return new Response("Upgrade Required", { status: 426, headers: { upgrade: "websocket" } });
    }
    if (request.headers.get("x-taskchute-realtime-authorized") !== "1") {
      return new Response("Forbidden", { status: 403 });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    // Browser clients never send domain commands over this channel. Close a
    // client that attempts to use it as a mutation transport.
    void message;
    try { socket.close(1008, "Realtime channel is invalidate-only"); } catch { /* best effort */ }
  }

  webSocketClose(): void { /* Hibernation state is connection-owned. */ }
  webSocketError(): void { /* Hibernation state is connection-owned. */ }
}
