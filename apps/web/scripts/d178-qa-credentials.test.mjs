import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  createD178PrivateStore,
  hardenWindowsPrivateDirectory,
  stableD178QaIdentity,
  WindowsDpapiProtector,
} from "./d178-qa-credentials.mjs";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));

class TestOnlyProtector {
  #key = randomBytes(32);

  async protect(plaintext) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  }

  async unprotect(payload) {
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const decipher = createDecipheriv("aes-256-gcm", this.#key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
  }
}

async function withStore(callback, { legacyState } = {}) {
  const directory = await mkdtemp(path.join(TEST_DIRECTORY, ".tmp-d178-private-store-test-"));
  const rootDir = path.join(directory, "operator-private");
  const legacyStatePath = path.join(directory, "old-state.json");
  const protector = new TestOnlyProtector();
  if (legacyState) await writeFile(legacyStatePath, JSON.stringify(legacyState), { flag: "wx" });
  const createStore = () => createD178PrivateStore({
    rootDir,
    legacyStatePath,
    protector,
    hardenDirectory: async () => undefined,
  });
  try {
    await callback({ directory, rootDir, legacyStatePath, createStore, protector });
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

const legacyRecord = {
  version: 1,
  alias: "d178-routine-qa",
  email_sha256: "a".repeat(64),
  status: "started",
  started_at: "2026-10-15T10:00:00.000Z",
};

test("generates a synthetic identity and recovers the same encrypted credentials", async () => {
  await withStore(async ({ legacyStatePath, createStore }) => {
    const store = createStore();
    const prepared = await store.prepareCredentials({ remoteReconciled: true, remoteState: "absent" });
    assert.match(prepared.credentials.email, /^d178-routine-qa-[a-f0-9]+@d178-qa\.invalid$/);
    assert.match(prepared.credentials.password, /^[A-Za-z0-9_-]{40,50}$/);
    assert.equal(prepared.state.status, "prepared");

    const legacyBefore = await readFile(legacyStatePath, "utf8");
    const files = await Promise.all([readFile(store.vaultPath), readFile(store.statePath)]);
    assert.equal(files.some((file) => file.includes(prepared.credentials.email)), false);
    assert.equal(files.some((file) => file.includes(prepared.credentials.password)), false);

    const recovered = await createStore().prepareCredentials({ remoteReconciled: true, remoteState: "absent" });
    assert.deepEqual(recovered.credentials, prepared.credentials);
    assert.equal((await readFile(legacyStatePath, "utf8")), legacyBefore);
  }, { legacyState: legacyRecord });
});

test("archives old digest state encrypted without changing the source record", async () => {
  await withStore(async ({ legacyStatePath, createStore }) => {
    const store = createStore();
    const original = await readFile(legacyStatePath);
    const legacy = await store.readLegacyState();
    const archived = await store.archiveLegacyState(legacy);
    assert.equal(archived.archived, true);
    assert.equal(await readFile(legacyStatePath, "utf8"), original.toString("utf8"));
    const names = await readdir(store.archiveDir);
    assert.equal(names.length, 1);
    const archiveBytes = await readFile(path.join(store.archiveDir, names[0]));
    assert.equal(archiveBytes.includes(Buffer.from(legacyRecord.email_sha256)), false);
    assert.deepEqual(await store.archiveLegacyState(legacy), archived);
    assert.equal((await readdir(store.archiveDir)).length, 1);
  }, { legacyState: legacyRecord });
});

test("recovers when encrypted credentials were saved before state creation", async () => {
  await withStore(async ({ createStore }) => {
    const store = createStore();
    const prepared = await store.prepareCredentials({ remoteReconciled: true, remoteState: "absent" });
    await rm(store.statePath);
    const recovered = await store.prepareCredentials({ remoteReconciled: true, remoteState: "absent" });
    assert.deepEqual(recovered.credentials, prepared.credentials);
    assert.equal(recovered.state.status, "prepared");
    assert.ok(await readFile(store.statePath));
  });
});

test("rejects a state record that disagrees with the protected credential vault", async () => {
  await withStore(async ({ createStore, protector }) => {
    const store = createStore();
    const prepared = await store.prepareCredentials({ remoteReconciled: true, remoteState: "absent" });
    const mismatchedState = { ...prepared.state, email_sha256: "b".repeat(64) };
    const stateBytes = Buffer.concat([
      Buffer.from("D178DPAPI1\0", "ascii"),
      await protector.protect(Buffer.from(JSON.stringify(mismatchedState), "utf8")),
    ]);
    await writeFile(store.statePath, stateBytes);
    await assert.rejects(() => store.loadExisting(), /state and credential vault do not match/);
  });
});

test("does not generate a new identity before remote reconciliation", async () => {
  await withStore(async ({ createStore }) => {
    const store = createStore();
    await assert.rejects(
      () => store.prepareCredentials({ remoteReconciled: false, remoteState: "absent" }),
      /Remote D-178 identity reconciliation must pass/,
    );
    await assert.rejects(() => readFile(store.vaultPath), { code: "ENOENT" });
  });
});

test("matches the canonical deterministic D-178 QA app identity", () => {
  assert.deepEqual(stableD178QaIdentity(), {
    appUserId: "01a137b5-7000-7591-a74f-3a8465ec77e5",
    authDisplayName: "D-178 QA fixture 91e5e414246548e8",
  });
});

test("updates the encrypted provisioning state atomically after success", async () => {
  await withStore(async ({ createStore }) => {
    const store = createStore();
    const prepared = await store.prepareCredentials({ remoteReconciled: true, remoteState: "absent" });
    const provisioned = {
      ...prepared.state,
      status: "provisioned",
      provisioned_at: "2026-10-15T11:00:00.000Z",
    };
    await store.saveState(provisioned);
    assert.deepEqual((await store.loadExisting()).state, provisioned);
  });
});

test("Windows DPAPI CurrentUser protects a synthetic payload and hardens its directory", {
  skip: process.platform !== "win32",
}, async () => {
  const directory = await mkdtemp(path.join(TEST_DIRECTORY, ".tmp-d178-dpapi-smoke-"));
  try {
    await hardenWindowsPrivateDirectory(directory);
    const protector = new WindowsDpapiProtector();
    const synthetic = Buffer.from("synthetic-d178-credential-store-test-only", "utf8");
    const protectedBytes = await protector.protect(synthetic);
    assert.notDeepEqual(protectedBytes, synthetic);
    assert.deepEqual(await protector.unprotect(protectedBytes), synthetic);
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("Windows DPAPI stores and recovers a complete synthetic D-178 credential record", {
  skip: process.platform !== "win32",
}, async () => {
  const directory = await mkdtemp(path.join(TEST_DIRECTORY, ".tmp-d178-dpapi-store-"));
  const rootDir = path.join(directory, "operator-private");
  const legacyStatePath = path.join(directory, "old-state.json");
  const legacy = { ...legacyRecord };
  await writeFile(legacyStatePath, JSON.stringify(legacy), { flag: "wx" });
  const store = createD178PrivateStore({
    rootDir,
    legacyStatePath,
    protector: new WindowsDpapiProtector(),
  });
  try {
    const prepared = await store.prepareCredentials({ remoteReconciled: true, remoteState: "absent" });
    const recovered = await store.loadExisting();
    assert.deepEqual(recovered.credentials, prepared.credentials);
    assert.deepEqual(recovered.state, prepared.state);
    assert.equal((await readdir(store.archiveDir)).length, 1);
    assert.equal((await readFile(legacyStatePath, "utf8")), JSON.stringify(legacy));
    const protectedFiles = await Promise.all([readFile(store.vaultPath), readFile(store.statePath)]);
    assert.equal(protectedFiles.some((file) => file.includes(prepared.credentials.email)), false);
    assert.equal(protectedFiles.some((file) => file.includes(prepared.credentials.password)), false);
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
