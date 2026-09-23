import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { EnsureDailyPrimaryDocumentRequest, UpdateDailyPrimaryDocumentRequest } from "../src/shared/contracts";
import { uuidv7 } from "../src/shared/uuidv7";
import {
  ensureDailyPrimaryDocument,
  isEnsureDailyPrimaryDocumentRequest,
  isUpdateDailyPrimaryDocumentRequest,
  loadDailyPrimaryDocument,
  loadDailyPrimaryDocuments,
  updateDailyPrimaryDocument,
} from "../worker/application/daily-primary-documents";

const now = "2026-09-23T00:00:00.000Z";
let userId = "";
let dayId = "";

beforeEach(async () => {
  userId = uuidv7();
  dayId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-09-23', '2026-09-23T00:00:00.000Z', '2026-09-24T00:00:00.000Z',
        'UTC', 0, 'compatible', 0, ?)`)
      .bind(dayId, userId, now),
  ]);
});

function ensureRequest(overrides: Partial<EnsureDailyPrimaryDocumentRequest> = {}): EnsureDailyPrimaryDocumentRequest {
  return { operation_id: uuidv7(), taskchute_day_id: dayId, document_id: uuidv7(), ...overrides };
}

function updateRequest(documentId: string, expectedRevision: number, overrides: Partial<UpdateDailyPrimaryDocumentRequest> = {}): UpdateDailyPrimaryDocumentRequest {
  return {
    operation_id: uuidv7(), taskchute_day_id: dayId, document_id: documentId,
    expected_revision: expectedRevision, markdown_body: "# Daily",
    ...overrides,
  };
}

describe("D-137 Daily Primary Documents", () => {
  it("does not create from list, explicitly ensures one document, and replays", async () => {
    expect((await loadDailyPrimaryDocuments(env.APP_DB, userId)).days).toEqual([{
      taskchute_day_id: dayId, logical_date: "2026-09-23", document_id: null,
    }]);
    const request = ensureRequest();
    const created = await ensureDailyPrimaryDocument(env.APP_DB, userId, request, now);
    expect(created.document).toMatchObject({
      document_id: request.document_id, taskchute_day_id: dayId, logical_date: "2026-09-23",
      kind: "daily_primary", markdown_body: "", revision: 0,
    });
    expect(await ensureDailyPrimaryDocument(env.APP_DB, userId, request, now)).toEqual(created);
    expect((await loadDailyPrimaryDocuments(env.APP_DB, userId)).days[0]).toMatchObject({ document_id: request.document_id });
    expect(await loadDailyPrimaryDocument(env.APP_DB, userId, request.document_id)).toEqual(created.document);
  });

  it("updates body with CAS, preserves exact replay, and rejects stale revisions", async () => {
    const created = await ensureDailyPrimaryDocument(env.APP_DB, userId, ensureRequest(), now);
    const request = updateRequest(created.document.document_id, 0);
    const updated = await updateDailyPrimaryDocument(env.APP_DB, userId, request, now);
    expect(updated.document).toMatchObject({ revision: 1, markdown_body: "# Daily" });
    expect(await updateDailyPrimaryDocument(env.APP_DB, userId, request, now)).toEqual(updated);
    await expect(updateDailyPrimaryDocument(env.APP_DB, userId, updateRequest(created.document.document_id, 0, { markdown_body: "stale" }), now))
      .rejects.toMatchObject({ code: "revision_conflict" });
  });

  it("accepts exact DTOs only and keeps owner/day boundaries", async () => {
    const request = ensureRequest();
    expect(isEnsureDailyPrimaryDocumentRequest(request)).toBe(true);
    expect(isEnsureDailyPrimaryDocumentRequest({ ...request, extra: true })).toBe(false);
    const created = await ensureDailyPrimaryDocument(env.APP_DB, userId, request, now);
    expect(isUpdateDailyPrimaryDocumentRequest(updateRequest(created.document.document_id, 0))).toBe(true);
    expect(isUpdateDailyPrimaryDocumentRequest({ ...updateRequest(created.document.document_id, 0), title: "unexpected" })).toBe(false);
    await expect(loadDailyPrimaryDocument(env.APP_DB, uuidv7(), userId)).rejects.toMatchObject({ code: "resource_not_found" });
    await expect(updateDailyPrimaryDocument(env.APP_DB, userId, updateRequest(created.document.document_id, 0, { taskchute_day_id: uuidv7() }), now))
      .rejects.toMatchObject({ code: "resource_not_found" });
  });
});
