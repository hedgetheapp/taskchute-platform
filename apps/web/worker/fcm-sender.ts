interface WearPushRegistrationRow {
  id: string;
  app_user_id: string;
  installation_id: string;
  fcm_token: string;
}

interface FcmServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

interface CachedAccessToken {
  accountKey: string;
  value: string;
  expiresAt: number;
}

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const FCM_INVALIDATION_ENDPOINT = "https://fcm.googleapis.com/v1/projects/";
const encoder = new TextEncoder();
let cachedAccessToken: CachedAccessToken | null = null;

declare global {
  interface Env {
    TASKCHUTE_FCM_SERVICE_ACCOUNT_JSON?: string;
  }
}

export async function sendWearRunningProjectionInvalidation(
  db: D1Database,
  appUserId: string,
  serviceAccountJson: string | undefined,
  timingDiagnosticsEnabled = false,
): Promise<void> {
  if (!serviceAccountJson) return;
  const dispatchStartedAtMs = Date.now();
  if (timingDiagnosticsEnabled) {
    console.log(JSON.stringify({ message: "wear_fcm_send_start", epochMs: dispatchStartedAtMs }));
  }
  let account: FcmServiceAccount;
  try {
    account = parseServiceAccount(serviceAccountJson);
  } catch {
    console.error(JSON.stringify({ message: "wear FCM configuration is invalid" }));
    if (timingDiagnosticsEnabled) logWearFcmDispatchFailure("configuration", dispatchStartedAtMs);
    return;
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken(account);
  } catch {
    console.error(JSON.stringify({ message: "wear FCM authorization failed" }));
    if (timingDiagnosticsEnabled) logWearFcmDispatchFailure("authorization", dispatchStartedAtMs);
    return;
  }

  const rows = await db.prepare(`SELECT id, app_user_id, installation_id, fcm_token
    FROM wear_push_registrations WHERE app_user_id = ? ORDER BY created_at, id`)
    .bind(appUserId).all<WearPushRegistrationRow>();
  const results = await Promise.all(rows.results.map((registration) => sendToRegistration(db, account.project_id,
    accessToken, registration)));
  if (timingDiagnosticsEnabled) {
    console.log(JSON.stringify({
      message: "wear_fcm_send_complete",
      epochMs: Date.now(),
      elapsedMs: Date.now() - dispatchStartedAtMs,
      registrationCount: rows.results.length,
      sentCount: results.filter((result) => result === "sent").length,
      removedCount: results.filter((result) => result === "removed").length,
      failedCount: results.filter((result) => result === "failed").length,
    }));
  }
}

function logWearFcmDispatchFailure(stage: "configuration" | "authorization", startedAtMs: number): void {
  console.log(JSON.stringify({
    message: "wear_fcm_send_failed",
    stage,
    epochMs: Date.now(),
    elapsedMs: Date.now() - startedAtMs,
  }));
}

export function isPermanentFcmRegistrationFailure(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return false;
  const details = (error as { details?: unknown }).details;
  return Array.isArray(details) && details.some((detail) => {
    if (!detail || typeof detail !== "object") return false;
    const value = detail as { "@type"?: unknown; errorCode?: unknown };
    return value["@type"] === "type.googleapis.com/google.firebase.fcm.v1.FcmError"
      && value.errorCode === "UNREGISTERED";
  });
}

async function sendToRegistration(
  db: D1Database,
  projectId: string,
  accessToken: string,
  registration: WearPushRegistrationRow,
): Promise<"sent" | "removed" | "failed"> {
  try {
    const response = await fetch(`${FCM_INVALIDATION_ENDPOINT}${encodeURIComponent(projectId)}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json; charset=utf-8" },
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({
        message: {
          token: registration.fcm_token,
          data: { type: "running_projection_invalidated" },
          android: { priority: "NORMAL", collapse_key: "wear-running-projection" },
        },
      }),
    });
    if (response.ok) return "sent";
    const errorBody: unknown = await response.json().catch(() => null);
    if (isPermanentFcmRegistrationFailure(errorBody)) {
      await db.prepare(`DELETE FROM wear_push_registrations
        WHERE id = ? AND app_user_id = ? AND installation_id = ? AND fcm_token = ?`)
        .bind(registration.id, registration.app_user_id, registration.installation_id, registration.fcm_token).run();
      return "removed";
    }
    console.warn(JSON.stringify({ message: "wear FCM send failed", status: response.status }));
    return "failed";
  } catch {
    // Push is a best-effort freshness side effect; canonical mutation success is final.
    console.warn(JSON.stringify({ message: "wear FCM send failed", status: "network" }));
    return "failed";
  }
}

async function getAccessToken(account: FcmServiceAccount): Promise<string> {
  const accountKey = encodeBytesBase64Url(new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`${account.project_id}\n${account.client_email}\n${account.private_key}`),
  )));
  if (cachedAccessToken?.accountKey === accountKey && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = encodeBase64Url(JSON.stringify({
    iss: account.client_email,
    scope: FCM_SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey("pkcs8", decodePem(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(unsigned));
  const assertion = `${unsigned}.${encodeBytesBase64Url(new Uint8Array(signature))}`;
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(8_000),
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error("oauth token request failed");
  const body = await response.json() as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string" || typeof body.expires_in !== "number") {
    throw new Error("oauth token response malformed");
  }
  cachedAccessToken = { accountKey, value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

function parseServiceAccount(json: string): FcmServiceAccount {
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== "object") throw new Error("invalid service account");
  const value = parsed as Record<string, unknown>;
  if (typeof value.project_id !== "string" || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value.project_id)
    || typeof value.client_email !== "string" || !value.client_email.endsWith(".iam.gserviceaccount.com")
    || typeof value.private_key !== "string" || !value.private_key.includes("BEGIN PRIVATE KEY")) {
    throw new Error("invalid service account");
  }
  return { project_id: value.project_id, client_email: value.client_email, private_key: value.private_key };
}

function decodePem(pem: string): ArrayBuffer {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

function encodeBase64Url(value: string): string {
  return encodeBytesBase64Url(encoder.encode(value));
}

function encodeBytesBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
