import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { EnsureTaskPrimaryDocumentRequest, UpdateTaskPrimaryDocumentRequest } from "../src/shared/contracts";
import { uuidv7 } from "../src/shared/uuidv7";
import {
  ensureTaskPrimaryDocument,
  isEnsureTaskPrimaryDocumentRequest,
  isUpdateTaskPrimaryDocumentRequest,
  loadTaskPrimaryDocument,
  loadTaskPrimaryDocumentById,
  updateTaskPrimaryDocument,
} from "../worker/application/task-primary-documents";

let userId = "";
let taskId = "";

beforeEach(async () => {
  userId = uuidv7(); taskId = uuidv7();
  await env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, "2026-09-13T00:00:00Z").run();
  await env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, project_id, title, created_at) VALUES (?, ?, NULL, ?, ?)")
    .bind(taskId, userId, "Primary task", "2026-09-13T00:00:00Z").run();
});

function ensureRequest(overrides: Partial<EnsureTaskPrimaryDocumentRequest> = {}): EnsureTaskPrimaryDocumentRequest {
  return { operation_id: uuidv7(), task_id: taskId, document_id: uuidv7(), ...overrides };
}

function updateRequest(documentId: string, expectedRevision: number, overrides: Partial<UpdateTaskPrimaryDocumentRequest> = {}): UpdateTaskPrimaryDocumentRequest {
  return { operation_id: uuidv7(), task_id: taskId, document_id: documentId, expected_revision: expectedRevision, markdown_body: "# body", ...overrides };
}

function gate(): { entered: Promise<void>; release: () => void; hooks: { beforeMutation: () => Promise<void> } } {
  let enter!: () => void; let release!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const released = new Promise<void>((resolve) => { release = resolve; });
  return { entered, release: () => release(), hooks: { beforeMutation: async () => { enter(); await released; } } };
}

describe("D-101 Task Primary Documents", () => {
  it("ensures one owner-scoped document, replays, and rejects misuse", async () => {
    const request = ensureRequest();
    const created = await ensureTaskPrimaryDocument(env.APP_DB, userId, request);
    expect(created.document).toMatchObject({ document_id: request.document_id, task_id: taskId, kind: "task_primary", revision: 0 });
    expect(await ensureTaskPrimaryDocument(env.APP_DB, userId, request)).toEqual(created);
    await expect(ensureTaskPrimaryDocument(env.APP_DB, userId, { ...request, task_id: uuidv7() })).rejects.toMatchObject({ code: "operation_id_misuse" });
    expect((await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM task_primary_documents WHERE app_user_id = ? AND task_id = ?").bind(userId, taskId).first<{ count: number }>())?.count).toBe(1);
  });

  it("converges concurrent different candidates to exactly one relation", async () => {
    const first = ensureRequest(); const held = gate();
    const firstPromise = ensureTaskPrimaryDocument(env.APP_DB, userId, first, undefined, held.hooks);
    await held.entered;
    const second = ensureRequest();
    const secondResult = await ensureTaskPrimaryDocument(env.APP_DB, userId, second);
    held.release();
    const firstResult = await firstPromise;
    expect(firstResult.document.document_id === secondResult.document.document_id).toBe(true);
    expect((await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM documents WHERE app_user_id = ? AND kind = 'task_primary'").bind(userId).first<{ count: number }>())?.count).toBe(1);
    expect((await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM task_primary_documents WHERE app_user_id = ? AND task_id = ?").bind(userId, taskId).first<{ count: number }>())?.count).toBe(1);
    expect(await ensureTaskPrimaryDocument(env.APP_DB, userId, first)).toEqual(firstResult);
    expect(await ensureTaskPrimaryDocument(env.APP_DB, userId, second)).toEqual(secondResult);
  });

  it("updates by exact revision and replays without a second increment", async () => {
    const created = await ensureTaskPrimaryDocument(env.APP_DB, userId, ensureRequest());
    const request = updateRequest(created.document.document_id, 0);
    const updated = await updateTaskPrimaryDocument(env.APP_DB, userId, request);
    expect(updated.document).toMatchObject({ revision: 1, markdown_body: "# body" });
    expect(await updateTaskPrimaryDocument(env.APP_DB, userId, request)).toEqual(updated);
    await expect(updateTaskPrimaryDocument(env.APP_DB, userId, updateRequest(created.document.document_id, 0))).rejects.toMatchObject({ code: "revision_conflict" });
  });

  it("does not let a stale update borrow an equivalent concurrent result", async () => {
    const created = await ensureTaskPrimaryDocument(env.APP_DB, userId, ensureRequest());
    const staleRequest = updateRequest(created.document.document_id, 0, { markdown_body: "same" });
    const held = gate();
    const stale = updateTaskPrimaryDocument(env.APP_DB, userId, staleRequest, undefined, held.hooks);
    await held.entered;
    await updateTaskPrimaryDocument(env.APP_DB, userId, updateRequest(created.document.document_id, 0, { markdown_body: "same" }));
    held.release();
    await expect(stale).rejects.toMatchObject({ code: "revision_conflict" });
    expect(await loadTaskPrimaryDocument(env.APP_DB, userId, taskId)).toMatchObject({ revision: 1, markdown_body: "same" });
  });

  it("keeps fetch and update owner scoped and accepts exact DTOs only", async () => {
    const request = ensureRequest(); const created = await ensureTaskPrimaryDocument(env.APP_DB, userId, request);
    expect(await loadTaskPrimaryDocumentById(env.APP_DB, userId, created.document.document_id)).toEqual(created.document);
    const otherUser = uuidv7();
    await env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(otherUser, "2026-09-13T00:00:00Z").run();
    await expect(loadTaskPrimaryDocumentById(env.APP_DB, otherUser, created.document.document_id)).rejects.toMatchObject({ code: "resource_not_found" });
    expect(isEnsureTaskPrimaryDocumentRequest(request)).toBe(true);
    expect(isEnsureTaskPrimaryDocumentRequest({ ...request, title: "unexpected" })).toBe(false);
    expect(isUpdateTaskPrimaryDocumentRequest(updateRequest(created.document.document_id, 0))).toBe(true);
    expect(isUpdateTaskPrimaryDocumentRequest({ ...updateRequest(created.document.document_id, 0), title: "unexpected" })).toBe(false);
  });
});
