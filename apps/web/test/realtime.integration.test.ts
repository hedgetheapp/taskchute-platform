import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { uuidv7 } from "../src/shared/uuidv7";
import { serializeRealtimeInvalidation } from "../src/shared/realtime";

const origin = "http://realtime.test";

class BrowserSession {
  private readonly cookies = new Map<string, string>();

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookies.size > 0) headers.set("cookie", [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; "));
    const response = await exports.default.fetch(new Request(`${origin}${path}`, { ...init, headers }));
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0]!;
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) this.cookies.set(name, value); else this.cookies.delete(name);
    }
    return response;
  }

  post(path: string, body: object, headers: HeadersInit = {}): Promise<Response> {
    return this.fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", origin, ...Object.fromEntries(new Headers(headers)) },
      body: JSON.stringify(body),
    });
  }
}

async function waitForMessage(socket: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    socket.addEventListener("message", (event) => resolve(String(event.data)), { once: true });
  });
}

function acceptSocket(socket: WebSocket): void {
  (socket as WebSocket & { accept?: () => void }).accept?.();
}

describe.sequential("RealtimeHub runtime boundary", () => {
  const session = new BrowserSession();
  const realtimeHub = env.REALTIME_HUB!;
  let appUserId = "";

  beforeAll(async () => {
    const response = await session.post("/api/internal/bootstrap", {
      email: "realtime.fixture@example.test",
      password: "realtime-fixture-password-1234",
      name: "Realtime Fixture",
      timezone: "UTC",
      day_boundary_minutes: 240,
      sections: ["Morning", "Afternoon"],
    }, { "x-taskchute-bootstrap-token": "fixture-only-bootstrap-token" });
    expect(response.ok).toBe(true);
    appUserId = (await response.json() as { app_user_id: string }).app_user_id;
    const signIn = await session.post("/api/auth/sign-in/email", {
      email: "realtime.fixture@example.test", password: "realtime-fixture-password-1234",
    });
    expect(signIn.ok).toBe(true);
  });

  it("rejects unauthenticated and wrong-origin upgrades, and rejects ordinary HTTP", async () => {
    const unauthenticated = await exports.default.fetch(new Request(`${origin}/api/v1/realtime`, {
      headers: { origin, upgrade: "websocket" },
    }));
    expect(unauthenticated.status).toBe(401);
    const wrongOrigin = await exports.default.fetch(new Request(`${origin}/api/v1/realtime`, {
      headers: { origin: "https://other.example", upgrade: "websocket" },
    }));
    expect(wrongOrigin.status).toBe(403);
    const unauthenticatedNative = await exports.default.fetch(new Request(`${origin}/api/v1/realtime`, {
      headers: { upgrade: "websocket", "x-taskchute-realtime-client": "android" },
    }));
    expect(unauthenticatedNative.status).toBe(401);
    const ordinary = await session.fetch("/api/v1/realtime");
    expect(ordinary.status).toBe(426);
  });

  it("routes the authenticated user to one hub and broadcasts only invalidations", async () => {
    const responseA = await session.fetch("/api/v1/realtime", { headers: { origin, upgrade: "websocket" } });
    const responseB = await session.fetch("/api/v1/realtime", { headers: { origin, upgrade: "websocket" } });
    expect(responseA.status).toBe(101);
    expect(responseB.status).toBe(101);
    const socketA = responseA.webSocket;
    const socketB = responseB.webSocket;
    expect(socketA).toBeTruthy();
    expect(socketB).toBeTruthy();
    acceptSocket(socketA!);
    acceptSocket(socketB!);
    const nativeResponse = await session.fetch("/api/v1/realtime", {
      headers: { upgrade: "websocket", "x-taskchute-realtime-client": "android" },
    });
    expect(nativeResponse.status).toBe(101);
    const nativeSocket = nativeResponse.webSocket!;
    acceptSocket(nativeSocket);
    const messageA = waitForMessage(socketA!);
    const messageB = waitForMessage(socketB!);
    const body = serializeRealtimeInvalidation([{ kind: "day", logical_date: "2026-09-14" }]);
    const published = await realtimeHub.get(realtimeHub.idFromName(appUserId)).fetch(new Request("https://internal/__taskchute_publish", {
      method: "POST",
      headers: { "content-type": "application/json", "x-taskchute-realtime-internal": "publish" },
      body: body!,
    }));
    expect(published.status).toBe(204);
    expect(await messageA).toBe(body);
    expect(await messageB).toBe(body);
    const mutationMessage = waitForMessage(socketA!);
    const mutation = await session.post("/api/v1/projects", {
      operation_id: uuidv7(), project_id: uuidv7(), title: "Realtime publish fixture",
    });
    expect(mutation.status).toBe(200);
    const parsedMutation = JSON.parse(await mutationMessage) as { scopes: Array<{ kind: string }> };
    expect(parsedMutation.scopes.map((scope) => scope.kind)).toContain("projects");
    socketA!.send(JSON.stringify({ type: "delete-all" }));
    socketA!.close(); socketB!.close(); nativeSocket.close();
  });

  it("does not expose domain commands or cross-user hub messages", async () => {
    const response = await session.fetch("/api/v1/realtime", { headers: { origin, upgrade: "websocket" } });
    const socket = response.webSocket!;
    acceptSocket(socket);
    const unauthorizedHubRequest = await realtimeHub.get(realtimeHub.idFromName(appUserId)).fetch(new Request("https://internal/connect", {
      headers: { origin, upgrade: "websocket" },
    }));
    expect(unauthorizedHubRequest.status).toBe(403);
    const other = await realtimeHub.get(realtimeHub.idFromName(uuidv7())).fetch(new Request("https://internal/__taskchute_publish", {
      method: "POST",
      headers: { "content-type": "application/json", "x-taskchute-realtime-internal": "publish" },
      body: serializeRealtimeInvalidation([{ kind: "projects" }])!,
    }));
    expect(other.status).toBe(204);
    socket.close();
  });
});
