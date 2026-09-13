import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { EnsureProjectPrimaryDocumentRequest, UpdateProjectPrimaryDocumentRequest } from "../src/shared/contracts";
import { uuidv7 } from "../src/shared/uuidv7";
import {
  ensureProjectPrimaryDocument,
  isEnsureProjectPrimaryDocumentRequest,
  isUpdateProjectPrimaryDocumentRequest,
  loadProjectPrimaryDocument,
  loadProjectPrimaryDocumentById,
  updateProjectPrimaryDocument,
} from "../worker/application/project-primary-documents";
import { loadDocumentByPermalink, loadStandaloneDocuments } from "../worker/application/documents";

let userId = "";
let projectId = "";
const now = "2026-09-13T00:00:00Z";

beforeEach(async () => {
  userId = uuidv7(); projectId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO projects (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)").bind(projectId, userId, "Primary Project", now),
  ]);
});

function ensureRequest(overrides: Partial<EnsureProjectPrimaryDocumentRequest> = {}): EnsureProjectPrimaryDocumentRequest {
  return { operation_id: uuidv7(), project_id: projectId, document_id: uuidv7(), ...overrides };
}

function updateRequest(documentId: string, expectedRevision: number, overrides: Partial<UpdateProjectPrimaryDocumentRequest> = {}): UpdateProjectPrimaryDocumentRequest {
  return { operation_id: uuidv7(), project_id: projectId, document_id: documentId, expected_revision: expectedRevision, markdown_body: "# body", ...overrides };
}

function gate(): { entered: Promise<void>; release: () => void; hooks: { beforeMutation: () => Promise<void> } } {
  let enter!: () => void; let release!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const released = new Promise<void>((resolve) => { release = resolve; });
  return { entered, release: () => release(), hooks: { beforeMutation: async () => { enter(); await released; } } };
}

describe("D-103 Project Primary Documents", () => {
  it("lazily ensures one owner-scoped document and replays/misuse rejects", async () => {
    const request = ensureRequest();
    const created = await ensureProjectPrimaryDocument(env.APP_DB, userId, request, now);
    expect(created.document).toMatchObject({ document_id: request.document_id, project_id: projectId, project_title: "Primary Project", kind: "project_primary", revision: 0 });
    expect(await ensureProjectPrimaryDocument(env.APP_DB, userId, request, now)).toEqual(created);
    await expect(ensureProjectPrimaryDocument(env.APP_DB, userId, { ...request, project_id: uuidv7() }, now)).rejects.toMatchObject({ code: "operation_id_misuse" });
    expect((await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM project_primary_documents WHERE app_user_id = ? AND project_id = ?").bind(userId, projectId).first<{ count: number }>())?.count).toBe(1);
  });

  it("converges concurrent ensures to one relation", async () => {
    const first = ensureRequest(); const held = gate();
    const firstPromise = ensureProjectPrimaryDocument(env.APP_DB, userId, first, now, held.hooks);
    await held.entered;
    const second = ensureRequest();
    const secondResult = await ensureProjectPrimaryDocument(env.APP_DB, userId, second, now);
    held.release();
    const firstResult = await firstPromise;
    expect(firstResult.document.document_id).toBe(secondResult.document.document_id);
    expect((await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM documents WHERE app_user_id = ? AND kind = 'project_primary'").bind(userId).first<{ count: number }>())?.count).toBe(1);
  });

  it("updates by exact revision, preserves Project title authority, and lists only materialized rows", async () => {
    const created = await ensureProjectPrimaryDocument(env.APP_DB, userId, ensureRequest(), now);
    const updated = await updateProjectPrimaryDocument(env.APP_DB, userId, updateRequest(created.document.document_id, 0), now);
    expect(updated.document).toMatchObject({ revision: 1, markdown_body: "# body", project_title: "Primary Project" });
    expect(await updateProjectPrimaryDocument(env.APP_DB, userId, updateRequest(created.document.document_id, 0, { operation_id: (await env.APP_DB.prepare("SELECT operation_id FROM operations WHERE command_type = 'UpdateProjectPrimaryDocument' AND app_user_id = ?").bind(userId).first<{ operation_id: string }>())!.operation_id, markdown_body: "# body" }), now)).toEqual(updated);
    await expect(updateProjectPrimaryDocument(env.APP_DB, userId, updateRequest(created.document.document_id, 0), now)).rejects.toMatchObject({ code: "revision_conflict" });
    await env.APP_DB.prepare("UPDATE projects SET title = ? WHERE app_user_id = ? AND id = ?").bind("Renamed Project", userId, projectId).run();
    expect(await loadProjectPrimaryDocument(env.APP_DB, userId, projectId)).toMatchObject({ project_title: "Renamed Project", revision: 1, markdown_body: "# body" });
    const list = await loadStandaloneDocuments(env.APP_DB, userId);
    expect(list.project_documents).toHaveLength(1);
    expect(list.project_documents?.[0]).toMatchObject({ project_id: projectId, project_title: "Renamed Project", project_archived: false });
  });

  it("resolves the generic permalink and enforces owner/relation boundaries", async () => {
    const created = await ensureProjectPrimaryDocument(env.APP_DB, userId, ensureRequest(), now);
    expect(await loadProjectPrimaryDocumentById(env.APP_DB, userId, created.document.document_id)).toEqual(created.document);
    expect(await loadDocumentByPermalink(env.APP_DB, userId, created.document.document_id)).toEqual(created.document);
    const otherUser = uuidv7();
    await env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(otherUser, now).run();
    await expect(loadProjectPrimaryDocumentById(env.APP_DB, otherUser, created.document.document_id)).rejects.toMatchObject({ code: "resource_not_found" });
    expect(isEnsureProjectPrimaryDocumentRequest(ensureRequest())).toBe(true);
    expect(isEnsureProjectPrimaryDocumentRequest({ ...ensureRequest(), title: "unexpected" })).toBe(false);
    expect(isUpdateProjectPrimaryDocumentRequest(updateRequest(created.document.document_id, 0))).toBe(true);
    expect(isUpdateProjectPrimaryDocumentRequest({ ...updateRequest(created.document.document_id, 0), title: "unexpected" })).toBe(false);
  });

  it("keeps Project Primary out of standalone lifecycle semantics", async () => {
    const created = await ensureProjectPrimaryDocument(env.APP_DB, userId, ensureRequest(), now);
    const standalone = await loadStandaloneDocuments(env.APP_DB, userId);
    expect(standalone.documents).toEqual([]);
    expect(standalone.project_documents?.map((item) => item.document_id)).toEqual([created.document.document_id]);
  });
});
