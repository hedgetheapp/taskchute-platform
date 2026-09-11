import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { DeleteEffectiveDayOverrideRequest, UpsertEffectiveDayOverrideRequest } from "../src/shared/contracts";
import { uuidv7 } from "../src/shared/uuidv7";
import {
  deleteEffectiveDayOverride,
  isDeleteEffectiveDayOverrideRequest,
  isUpsertEffectiveDayOverrideRequest,
  loadEffectiveDayCalendar,
  upsertEffectiveDayOverride,
} from "../worker/application/effective-day-calendar";

let userId = "";

beforeEach(async () => {
  userId = uuidv7();
  await env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, "2026-09-11T00:00:00.000Z").run();
});

function upsertRequest(overrides: Partial<UpsertEffectiveDayOverrideRequest> = {}): UpsertEffectiveDayOverrideRequest {
  return {
    operation_id: uuidv7(), logical_date: "2026-09-14", override_kind: "holiday", reason: "personal",
    expected_revision: null, ...overrides,
  };
}

describe("D-088 effective day override application", () => {
  it("creates, updates, replays, rejects stale writes, isolates owners, and deletes", async () => {
    const createdRequest = upsertRequest();
    const created = await upsertEffectiveDayOverride(env.APP_DB, userId, createdRequest, "2026-09-11T01:00:00.000Z");
    expect(created.classification).toMatchObject({ logical_date: "2026-09-14", base: "workday", effective: "holiday",
      override: { revision: 0, reason: "personal" } });
    expect(await upsertEffectiveDayOverride(env.APP_DB, userId, createdRequest)).toEqual(created);

    const updatedRequest = upsertRequest({ logical_date: "2026-09-14", override_kind: "workday", reason: "office",
      expected_revision: 0 });
    const updated = await upsertEffectiveDayOverride(env.APP_DB, userId, updatedRequest, "2026-09-11T02:00:00.000Z");
    expect(updated.classification).toMatchObject({ effective: "workday", override: { revision: 1, reason: "office" } });
    await expect(upsertEffectiveDayOverride(env.APP_DB, userId, upsertRequest({ expected_revision: 0 })))
      .rejects.toMatchObject({ code: "revision_conflict" });

    const otherUser = uuidv7();
    await env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(otherUser, "2026-09-11T00:00:00.000Z").run();
    expect((await loadEffectiveDayCalendar(env.APP_DB, otherUser, "2026-09-14")).overrides).toEqual([]);

    const deletedRequest: DeleteEffectiveDayOverrideRequest = {
      operation_id: uuidv7(), logical_date: "2026-09-14", expected_revision: 1,
    };
    const deleted = await deleteEffectiveDayOverride(env.APP_DB, userId, deletedRequest, "2026-09-11T03:00:00.000Z");
    expect(deleted.classification).toMatchObject({ base: "workday", effective: "workday", override: null });
    expect(await deleteEffectiveDayOverride(env.APP_DB, userId, deletedRequest)).toEqual(deleted);
    expect((await loadEffectiveDayCalendar(env.APP_DB, userId, "2026-09-14")).overrides).toEqual([]);
  });

  it("keeps the official holiday fact visible under a workday override and normalizes blank reasons", async () => {
    const result = await upsertEffectiveDayOverride(env.APP_DB, userId, upsertRequest({
      logical_date: "2026-05-06", override_kind: "workday", reason: "  ",
    }));
    expect(result.classification).toMatchObject({ base: "holiday", effective: "workday",
      official_entry: { logical_date: "2026-05-06", label: "休日" }, override: { reason: null } });
  });
});

describe("D-088 exact request validation", () => {
  it("accepts the approved shapes and rejects owner injection, invalid values, and extras", () => {
    expect(isUpsertEffectiveDayOverrideRequest(upsertRequest())).toBe(true);
    expect(isDeleteEffectiveDayOverrideRequest({ operation_id: uuidv7(), logical_date: "2026-09-14", expected_revision: null })).toBe(true);
    expect(isUpsertEffectiveDayOverrideRequest({ ...upsertRequest(), user_id: userId })).toBe(false);
    expect(isUpsertEffectiveDayOverrideRequest({ ...upsertRequest(), override_kind: "unknown" })).toBe(false);
    expect(isUpsertEffectiveDayOverrideRequest({ ...upsertRequest(), logical_date: "2026-02-30" })).toBe(false);
    expect(isUpsertEffectiveDayOverrideRequest({ ...upsertRequest(), interval_months: 2 })).toBe(false);
    expect(isDeleteEffectiveDayOverrideRequest({ operation_id: uuidv7(), logical_date: "2026-09-14", expected_revision: 0, reason: null })).toBe(false);
  });
});
