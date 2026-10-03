import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { uuidv7 } from "../src/shared/uuidv7";
import worker from "../worker/index";
import {
  isWearPushRegistrationRequest,
  isWearPushUnregistrationRequest,
  registerWearPushInstallation,
  unregisterWearPushInstallation,
} from "../worker/application/wear-push-registrations";

const ownerA = uuidv7();
const ownerB = uuidv7();
const installationA = uuidv7();
const installationB = uuidv7();

beforeAll(async () => {
  const now = new Date().toISOString();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(ownerA, now),
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(ownerB, now),
  ]);
});

describe.sequential("Wear push registration owner and token boundary", () => {
  it("applies the APP registration migration with owner FK, unique bindings, and clean D1 integrity", async () => {
    const columns = await env.APP_DB.prepare("PRAGMA table_info(wear_push_registrations)").all<{ name: string }>();
    expect(columns.results.map((column) => column.name)).toEqual([
      "id", "app_user_id", "installation_id", "fcm_token", "created_at", "updated_at", "last_seen_at",
    ]);
    const foreignKeys = await env.APP_DB.prepare("PRAGMA foreign_key_list(wear_push_registrations)")
      .all<{ table: string; from: string; to: string }>();
    expect(foreignKeys.results.some((key) => key.table === "app_users" && key.from === "app_user_id" && key.to === "id"))
      .toBe(true);
    expect((await env.APP_DB.prepare("PRAGMA quick_check").all<{ quick_check: string }>()).results)
      .toContainEqual({ quick_check: "ok" });
    expect((await env.APP_DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });

  it("requires an authenticated Watch session before registration", async () => {
    const response = await worker.fetch(new Request("https://taskchute.test/api/v1/wear/push-registration", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ installation_id: installationA, fcm_token: "unauthenticated-token" }),
    }), env as Env);
    expect(response.status).toBe(401);
  });

  it("accepts only exact owner-free registration and unregistration payloads", () => {
    expect(isWearPushRegistrationRequest({ installation_id: installationA, fcm_token: "token-a" })).toBe(true);
    expect(isWearPushRegistrationRequest({ app_user_id: ownerA, installation_id: installationA, fcm_token: "token-a" })).toBe(false);
    expect(isWearPushRegistrationRequest({ installation_id: installationA, fcm_token: " token-a" })).toBe(false);
    const uuidV4 = crypto.randomUUID();
    expect(isWearPushRegistrationRequest({ installation_id: uuidV4, fcm_token: "token-a" })).toBe(false);
    expect(isWearPushUnregistrationRequest({ installation_id: installationA })).toBe(true);
    expect(isWearPushUnregistrationRequest({ app_user_id: ownerA, installation_id: installationA })).toBe(false);
  });

  it("rotates one installation token, permits multiple Watches, and requires old-owner revoke before account switch", async () => {
    const first = await registerWearPushInstallation(env.APP_DB, ownerA,
      { installation_id: installationA, fcm_token: "registration-token-a1" });
    const registrationBefore = await env.APP_DB.prepare(`SELECT id, created_at FROM wear_push_registrations
      WHERE app_user_id = ? AND installation_id = ?`).bind(ownerA, installationA).first<{ id: string; created_at: string }>();
    expect(first).toEqual({ registered: true, installation_id: installationA });

    await registerWearPushInstallation(env.APP_DB, ownerA,
      { installation_id: installationA, fcm_token: "registration-token-a2" });
    await registerWearPushInstallation(env.APP_DB, ownerA,
      { installation_id: installationB, fcm_token: "registration-token-b" });
    const ownerRows = await env.APP_DB.prepare(`SELECT id, installation_id, fcm_token, created_at
      FROM wear_push_registrations WHERE app_user_id = ? ORDER BY installation_id`).bind(ownerA)
      .all<{ id: string; installation_id: string; fcm_token: string; created_at: string }>();
    expect(ownerRows.results).toHaveLength(2);
    const rotated = ownerRows.results.find((row) => row.installation_id === installationA)!;
    expect(rotated.fcm_token).toBe("registration-token-a2");
    expect(rotated.id).toBe(registrationBefore?.id);
    expect(rotated.created_at).toBe(registrationBefore?.created_at);

    await expect(registerWearPushInstallation(env.APP_DB, ownerB,
      { installation_id: installationA, fcm_token: "registration-token-account-b" })).rejects.toMatchObject({ status: 409 });
    expect(await env.APP_DB.prepare("SELECT app_user_id, fcm_token FROM wear_push_registrations WHERE installation_id = ?")
      .bind(installationA).first<{ app_user_id: string; fcm_token: string }>())
      .toEqual({ app_user_id: ownerA, fcm_token: "registration-token-a2" });
    await unregisterWearPushInstallation(env.APP_DB, ownerA, { installation_id: installationA });
    await registerWearPushInstallation(env.APP_DB, ownerB,
      { installation_id: installationA, fcm_token: "registration-token-account-b" });
    expect(await env.APP_DB.prepare(`SELECT app_user_id, fcm_token FROM wear_push_registrations
      WHERE installation_id = ?`).bind(installationA).first<{ app_user_id: string; fcm_token: string }>()
    ).toEqual({ app_user_id: ownerB, fcm_token: "registration-token-account-b" });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM wear_push_registrations WHERE app_user_id = ?")
      .bind(ownerA).first<number>("count")).toBe(1);
  });

  it("rejects a token already assigned to another installation without changing either row", async () => {
    const duplicateToken = "registration-token-shared-attempt";
    await registerWearPushInstallation(env.APP_DB, ownerA,
      { installation_id: uuidv7(), fcm_token: duplicateToken });
    const newInstallation = uuidv7();
    await expect(registerWearPushInstallation(env.APP_DB, ownerB,
      { installation_id: newInstallation, fcm_token: duplicateToken })).rejects.toMatchObject({ status: 409 });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM wear_push_registrations WHERE fcm_token = ?")
      .bind(duplicateToken).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM wear_push_registrations WHERE installation_id = ?")
      .bind(newInstallation).first<number>("count")).toBe(0);
  });

  it("unregisters only a registration owned by the authenticated principal", async () => {
    const installation = uuidv7();
    await registerWearPushInstallation(env.APP_DB, ownerA, { installation_id: installation, fcm_token: "token-owner-isolation" });
    await unregisterWearPushInstallation(env.APP_DB, ownerB, { installation_id: installation });
    expect(await env.APP_DB.prepare("SELECT app_user_id FROM wear_push_registrations WHERE installation_id = ?")
      .bind(installation).first<string>("app_user_id")).toBe(ownerA);
    await unregisterWearPushInstallation(env.APP_DB, ownerA, { installation_id: installation });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM wear_push_registrations WHERE installation_id = ?")
      .bind(installation).first<number>("count")).toBe(0);
  });
});
