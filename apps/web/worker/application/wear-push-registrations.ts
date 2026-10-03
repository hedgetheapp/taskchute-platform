import { isUuidV7, uuidv7 } from "../domain/uuidv7";
import { HttpError } from "./errors";

export interface WearPushRegistrationRequest {
  installation_id: string;
  fcm_token: string;
}

export interface WearPushUnregistrationRequest {
  installation_id: string;
}

export function isWearPushRegistrationRequest(value: unknown): value is WearPushRegistrationRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 2
    && Object.hasOwn(body, "installation_id")
    && Object.hasOwn(body, "fcm_token")
    && typeof body.installation_id === "string" && isUuidV7(body.installation_id)
    && typeof body.fcm_token === "string" && isValidFcmToken(body.fcm_token);
}

export function isWearPushUnregistrationRequest(value: unknown): value is WearPushUnregistrationRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 1
    && Object.hasOwn(body, "installation_id")
    && typeof body.installation_id === "string" && isUuidV7(body.installation_id);
}

export async function registerWearPushInstallation(
  db: D1Database,
  appUserId: string,
  request: WearPushRegistrationRequest,
): Promise<{ registered: true; installation_id: string }> {
  const now = new Date().toISOString();
  try {
    const registration = await db.prepare(`INSERT INTO wear_push_registrations
        (id, app_user_id, installation_id, fcm_token, created_at, updated_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(installation_id) DO UPDATE SET
        fcm_token = excluded.fcm_token,
        updated_at = excluded.updated_at,
        last_seen_at = excluded.last_seen_at
      WHERE wear_push_registrations.app_user_id = excluded.app_user_id
      RETURNING id`)
      .bind(uuidv7(), appUserId, request.installation_id, request.fcm_token, now, now, now)
      .first<{ id: string }>();
    if (!registration) {
      throw new HttpError(409, "resource_conflict", "This Watch installation is registered to another account");
    }
  } catch (error) {
    // A token already bound to a different installation is rejected atomically.
    // Do not expose the token or SQLite error details to the caller or logs.
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed: wear_push_registrations.fcm_token")) {
      throw new HttpError(409, "resource_conflict", "This Watch registration cannot be assigned to the installation");
    }
    throw error;
  }
  return { registered: true, installation_id: request.installation_id };
}

export async function unregisterWearPushInstallation(
  db: D1Database,
  appUserId: string,
  request: WearPushUnregistrationRequest,
): Promise<{ unregistered: true; installation_id: string }> {
  await db.prepare(`DELETE FROM wear_push_registrations
    WHERE app_user_id = ? AND installation_id = ?`).bind(appUserId, request.installation_id).run();
  return { unregistered: true, installation_id: request.installation_id };
}

function isValidFcmToken(token: string): boolean {
  return token.length > 0 && token.length <= 4096 && token.trim() === token
    && !/[\u0000-\u001f\u007f]/.test(token);
}
