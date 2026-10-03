import { generateKeyPairSync } from "node:crypto";
import { env } from "cloudflare:workers";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { uuidv7 } from "../src/shared/uuidv7";
import { affectsWearRunningProjection } from "../worker/realtime-invalidation";
import { isPermanentFcmRegistrationFailure, sendWearRunningProjectionInvalidation } from "../worker/fcm-sender";
import { registerWearPushInstallation } from "../worker/application/wear-push-registrations";

const userId = uuidv7();
const createdAt = "2026-09-01T00:00:00.000Z";

beforeAll(async () => {
  await env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, createdAt).run();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function testServiceAccount(): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return JSON.stringify({
    project_id: "taskchute-fcm-test",
    client_email: "taskchute-fcm-test@taskchute-fcm-test.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  });
}

function mockedFetchForFcm(sendResponse: Response, requests: RequestInit[]): typeof fetch {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(init ?? {});
    if (requests.length === 1) return Response.json({ access_token: "test-access-token", expires_in: 3600 });
    return sendResponse;
  }) as unknown as typeof fetch;
}

describe("Wear Running FCM mapping and provider errors", () => {
  it("maps only current Running projection input mutations", () => {
    const projectionPaths = ["start", "complete", "interrupt", "estimate", "execution-times", "revert-start", "task-metadata", "routine-estimate"];
    for (const endpoint of projectionPaths) {
      expect(affectsWearRunningProjection(new Request(`https://taskchute.test/api/v1/entries/${crypto.randomUUID()}/${endpoint}`, { method: "POST" }))).toBe(true);
    }
    for (const endpoint of ["planned-start", "move", "duplicate", "routine-section-plan"]) {
      expect(affectsWearRunningProjection(new Request(`https://taskchute.test/api/v1/entries/${crypto.randomUUID()}/${endpoint}`, { method: "POST" }))).toBe(false);
    }
    expect(affectsWearRunningProjection(new Request("https://taskchute.test/api/v1/entries/id/estimate"))).toBe(false);
  });

  it("deletes only a provider-confirmed unregistered token error shape", () => {
    expect(isPermanentFcmRegistrationFailure({ error: { details: [
      { "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: "UNREGISTERED" },
    ] } })).toBe(true);
    expect(isPermanentFcmRegistrationFailure({ error: { status: "INVALID_ARGUMENT", details: [
      { "@type": "type.googleapis.com/google.rpc.BadRequest", fieldViolations: [] },
    ] } })).toBe(false);
    expect(isPermanentFcmRegistrationFailure({ error: { status: "NOT_FOUND" } })).toBe(false);
  });

  it("sends a data-only normal-priority invalidation with no user content", async () => {
    const installationId = uuidv7();
    const token = "fcm-token-payload-test";
    await registerWearPushInstallation(env.APP_DB, userId, { installation_id: installationId, fcm_token: token });
    const requests: RequestInit[] = [];
    vi.stubGlobal("fetch", mockedFetchForFcm(Response.json({ name: "projects/taskchute/messages/1" }), requests));

    const timingLogs = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await sendWearRunningProjectionInvalidation(env.APP_DB, userId, testServiceAccount(), true);

    expect(requests).toHaveLength(2);
    const oauthBody = new URLSearchParams(String(requests[0].body));
    expect(oauthBody.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const assertion = oauthBody.get("assertion")!;
    const [jwtHeader, jwtClaims, jwtSignature] = assertion.split(".");
    const decodeBase64Url = (segment: string) => JSON.parse(atob(segment.replace(/-/g, "+").replace(/_/g, "/")));
    expect(decodeBase64Url(jwtHeader)).toMatchObject({ alg: "RS256", typ: "JWT" });
    expect(decodeBase64Url(jwtClaims)).toMatchObject({
      iss: "taskchute-fcm-test@taskchute-fcm-test.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
    });
    expect(jwtSignature.length).toBeGreaterThan(0);
    const message = JSON.parse(String(requests[1].body)) as { message: Record<string, unknown> };
    expect(message.message).toEqual({
      token,
      data: { type: "running_projection_invalidated" },
      android: { priority: "NORMAL", collapse_key: "wear-running-projection" },
    });
    const timingEvents = timingLogs.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
    expect(timingEvents.map((event) => event.message)).toEqual(["wear_fcm_send_start", "wear_fcm_send_complete"]);
    expect(timingEvents[1]).toMatchObject({ registrationCount: 1, sentCount: 1, removedCount: 0, failedCount: 0 });
    expect(JSON.stringify(timingEvents)).not.toContain(token);
    expect(JSON.stringify(timingEvents)).not.toContain(userId);
  });

  it("keeps Worker timing logs disabled unless the nonprod caller opts in", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ access_token: "test-access-token", expires_in: 3600 })));
    const timingLogs = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await sendWearRunningProjectionInvalidation(env.APP_DB, uuidv7(), testServiceAccount());

    expect(timingLogs).not.toHaveBeenCalled();
  });

  it("keeps provider failures best-effort and does not throw into the canonical mutation path", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("provider unavailable"); }));
    await expect(sendWearRunningProjectionInvalidation(env.APP_DB, userId, testServiceAccount())).resolves.toBeUndefined();
  });

  it("cleans only the exact registration after explicit UNREGISTERED and retains other provider failures", async () => {
    const targetInstallation = uuidv7();
    const otherInstallation = uuidv7();
    await registerWearPushInstallation(env.APP_DB, userId,
      { installation_id: targetInstallation, fcm_token: "fcm-token-explicit-unregistered" });
    await registerWearPushInstallation(env.APP_DB, userId,
      { installation_id: otherInstallation, fcm_token: "fcm-token-malformed-request" });
    const unregistered = {
      error: { details: [
        { "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: "UNREGISTERED" },
      ] },
    };
    const invalidArgument = { error: {
      status: "INVALID_ARGUMENT",
      details: [{ "@type": "type.googleapis.com/google.rpc.BadRequest", fieldViolations: [] }],
    } };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "test-access-token", expires_in: 3600 });
      }
      const payload = JSON.parse(String(init?.body)) as { message: { token: string } };
      return payload.message.token === "fcm-token-explicit-unregistered"
        ? Response.json(unregistered, { status: 404 })
        : Response.json(invalidArgument, { status: 400 });
    }));
    await sendWearRunningProjectionInvalidation(env.APP_DB, userId, testServiceAccount());
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM wear_push_registrations WHERE installation_id = ?")
      .bind(targetInstallation).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM wear_push_registrations WHERE installation_id = ?")
      .bind(otherInstallation).first<number>("count")).toBe(1);

    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input) === "https://oauth2.googleapis.com/token"
      ? Response.json({ access_token: "test-access-token", expires_in: 3600 })
      : Response.json(invalidArgument, { status: 400 })));
    await sendWearRunningProjectionInvalidation(env.APP_DB, userId, testServiceAccount());
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM wear_push_registrations WHERE installation_id = ?")
      .bind(otherInstallation).first<number>("count")).toBe(1);
  });
});
