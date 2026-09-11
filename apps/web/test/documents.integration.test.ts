import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { CreateStandaloneDocumentRequest, UpdateDocumentRequest } from "../src/shared/contracts";
import { uuidv7 } from "../src/shared/uuidv7";
import {
  createStandaloneDocument,
  isCreateStandaloneDocumentRequest,
  isUpdateDocumentRequest,
  loadStandaloneDocument,
  loadStandaloneDocuments,
  updateDocument,
} from "../worker/application/documents";

let userId = "";

beforeEach(async () => {
  userId = uuidv7();
  await env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)")
    .bind(userId, "2026-09-11T00:00:00.000Z").run();
});

function createRequest(overrides: Partial<CreateStandaloneDocumentRequest> = {}): CreateStandaloneDocumentRequest {
  return {
    operation_id: uuidv7(), document_id: uuidv7(), title: "First note", markdown_body: "# Hello",
    ...overrides,
  };
}

function updateRequest(documentId: string, expectedRevision: number, overrides: Partial<UpdateDocumentRequest> = {}): UpdateDocumentRequest {
  return {
    operation_id: uuidv7(), document_id: documentId, expected_revision: expectedRevision,
    title: "Updated note", markdown_body: "Updated body", ...overrides,
  };
}

function gate(): { entered: Promise<void>; release: () => void; hooks: { beforeMutation: () => Promise<void> } } {
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const released = new Promise<void>((resolve) => { release = resolve; });
  return { entered, release: () => release(), hooks: { beforeMutation: async () => { enter(); await released; } } };
}

describe("D-090 standalone Markdown Documents", () => {
  it("creates one canonical Document, replays exactly, and rejects operation misuse", async () => {
    const request = createRequest();
    const created = await createStandaloneDocument(env.APP_DB, userId, request, "2026-09-11T01:00:00.000Z");
    expect(created.document).toMatchObject({ document_id: request.document_id, kind: "standalone", revision: 0 });
    expect(await createStandaloneDocument(env.APP_DB, userId, request)).toEqual(created);
    await expect(createStandaloneDocument(env.APP_DB, userId, { ...request, markdown_body: "different" }))
      .rejects.toMatchObject({ code: "operation_id_misuse" });
    expect((await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM documents WHERE document_id = ?")
      .bind(request.document_id).first<{ count: number }>())?.count).toBe(1);
  });

  it("updates with CAS, replays without incrementing, and rejects stale revisions", async () => {
    const created = await createStandaloneDocument(env.APP_DB, userId, createRequest());
    const request = updateRequest(created.document.document_id, 0);
    const updated = await updateDocument(env.APP_DB, userId, request, "2026-09-11T02:00:00.000Z");
    expect(updated.document.revision).toBe(1);
    expect(await updateDocument(env.APP_DB, userId, request)).toEqual(updated);
    expect((await env.APP_DB.prepare("SELECT revision FROM documents WHERE document_id = ?")
      .bind(created.document.document_id).first<{ revision: number }>())?.revision).toBe(1);
    await expect(updateDocument(env.APP_DB, userId, updateRequest(created.document.document_id, 0)))
      .rejects.toMatchObject({ code: "revision_conflict" });
  });

  it("does not allow a stale UpdateDocument to borrow an equivalent concurrent result", async () => {
    const created = await createStandaloneDocument(env.APP_DB, userId, createRequest());
    const first = updateRequest(created.document.document_id, 0, { title: "Same", markdown_body: "Same body" });
    const held = gate();
    const stale = updateDocument(env.APP_DB, userId, first, "2026-09-11T03:00:00.000Z", held.hooks);
    await held.entered;

    const winner = updateRequest(created.document.document_id, 0, {
      title: first.title, markdown_body: first.markdown_body,
    });
    await expect(updateDocument(env.APP_DB, userId, winner, "2026-09-11T03:01:00.000Z"))
      .resolves.toMatchObject({ document: { revision: 1, title: "Same" } });
    held.release();
    await expect(stale).rejects.toMatchObject({ code: "revision_conflict" });
    expect(await env.APP_DB.prepare(`SELECT revision, title, markdown_body FROM documents WHERE document_id = ?`)
      .bind(created.document.document_id).first()).toEqual({ revision: 1, title: "Same", markdown_body: "Same body" });
    expect(await env.APP_DB.prepare(`SELECT outcome_kind FROM operations WHERE app_user_id = ? AND operation_id = ?`)
      .bind(userId, first.operation_id).first<string>("outcome_kind")).toBe("revision_conflict");
  });

  it("preserves a concurrent different winner and isolates owners", async () => {
    const created = await createStandaloneDocument(env.APP_DB, userId, createRequest());
    const first = updateRequest(created.document.document_id, 0, { title: "A", markdown_body: "A" });
    const held = gate();
    const stale = updateDocument(env.APP_DB, userId, first, undefined, held.hooks);
    await held.entered;
    await updateDocument(env.APP_DB, userId, updateRequest(created.document.document_id, 0, { title: "B", markdown_body: "B" }));
    held.release();
    await expect(stale).rejects.toMatchObject({ code: "revision_conflict" });

    const otherUser = uuidv7();
    await env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)")
      .bind(otherUser, "2026-09-11T00:00:00.000Z").run();
    await expect(loadStandaloneDocument(env.APP_DB, otherUser, created.document.document_id))
      .rejects.toMatchObject({ code: "resource_not_found" });
    await expect(updateDocument(env.APP_DB, otherUser, updateRequest(created.document.document_id, 0)))
      .rejects.toMatchObject({ code: "resource_not_found" });
    expect((await loadStandaloneDocuments(env.APP_DB, otherUser)).documents).toEqual([]);
  });

  it("lists only standalone documents in deterministic updated order", async () => {
    const older = createRequest({ title: "Older" });
    const newer = createRequest({ title: "Newer" });
    await createStandaloneDocument(env.APP_DB, userId, older, "2026-09-11T01:00:00.000Z");
    await createStandaloneDocument(env.APP_DB, userId, newer, "2026-09-11T02:00:00.000Z");
    expect((await loadStandaloneDocuments(env.APP_DB, userId)).documents.map((item) => item.title))
      .toEqual(["Newer", "Older"]);
  });
});

describe("D-090 exact Document request shapes", () => {
  it("rejects owner injection and accepts only the approved fields", () => {
    const create = createRequest();
    expect(isCreateStandaloneDocumentRequest(create)).toBe(true);
    expect(isCreateStandaloneDocumentRequest({ ...create, user_id: userId })).toBe(false);
    expect(isCreateStandaloneDocumentRequest({ ...create, kind: "standalone" })).toBe(false);
    const update = updateRequest(create.document_id, 0);
    expect(isUpdateDocumentRequest(update)).toBe(true);
    expect(isUpdateDocumentRequest({ ...update, user_id: userId })).toBe(false);
    expect(isUpdateDocumentRequest({ ...update, expected_revision: -1 })).toBe(false);
    expect(isUpdateDocumentRequest({ ...update, body: "wrong-field" })).toBe(false);
  });
});
