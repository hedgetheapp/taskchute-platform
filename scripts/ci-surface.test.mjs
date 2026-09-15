import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyPaths, formatGitHubOutputs } from "./ci-surface.mjs";

test("Android-only paths run Android and skip Web/Worker", () => {
  assert.deepEqual(classifyPaths([
    "apps/android/app/src/main/java/com/example/Today.kt",
    "apps/android/app/src/androidTest/java/com/example/TodayTest.kt",
    "scripts/android-qa.ps1",
    "docs/CURRENT.md",
  ]), { runWeb: false, runAndroid: true, reason: "apps/android/app/src/main/java/com/example/Today.kt:android, apps/android/app/src/androidTest/java/com/example/TodayTest.kt:android, scripts/android-qa.ps1:android, docs/CURRENT.md:docs" });
});

test("Web React-only paths run Web/Worker and skip Android", () => {
  assert.equal(classifyPaths(["apps/web/src/web/NotesBoard.tsx"]).runWeb, true);
  assert.equal(classifyPaths(["apps/web/src/web/NotesBoard.tsx"]).runAndroid, false);
});

test("known Worker-only path runs Web/Worker and skips Android", () => {
  assert.deepEqual(classifyPaths(["apps/web/worker/application/create-project.ts"]), {
    runWeb: true,
    runAndroid: false,
    reason: "apps/web/worker/application/create-project.ts:web",
  });
});

test("Android-consumed Worker and shared contract paths run both", () => {
  assert.equal(classifyPaths(["apps/web/worker/application/load-current-day.ts"]).runAndroid, true);
  assert.equal(classifyPaths(["apps/web/src/shared/contracts.ts"]).runAndroid, true);
  assert.equal(classifyPaths(["apps/web/migrations/0031_example.sql"]).runAndroid, true);
  assert.equal(classifyPaths(["apps/web/wrangler.jsonc"]).runAndroid, true);
  assert.equal(classifyPaths(["apps/web/worker/application/load-current-day.ts"]).runWeb, true);
});

test("docs-only paths skip both heavy jobs", () => {
  assert.deepEqual(classifyPaths(["docs/CURRENT.md", "README.md"]), {
    runWeb: false,
    runAndroid: false,
    reason: "documentation-only change",
  });
});

test("mixed surfaces route only affected heavy jobs", () => {
  assert.equal(classifyPaths(["apps/android/app/src/main/Today.kt", "docs/CURRENT.md"]).runWeb, false);
  assert.equal(classifyPaths(["apps/web/src/web/App.tsx", "docs/CURRENT.md"]).runAndroid, false);
  assert.deepEqual(classifyPaths(["apps/android/app/src/main/Today.kt", "apps/web/src/web/App.tsx"]), {
    runWeb: true,
    runAndroid: true,
    reason: "apps/android/app/src/main/Today.kt:android, apps/web/src/web/App.tsx:web",
  });
});

test("workflow and unknown executable paths fail safe to both", () => {
  assert.equal(classifyPaths([".github/workflows/ci.yml"]).runWeb, true);
  assert.equal(classifyPaths([".github/workflows/ci.yml"]).runAndroid, true);
  assert.deepEqual(classifyPaths(["tools/new-builder.mjs"]), {
    runWeb: true,
    runAndroid: true,
    reason: "tools/new-builder.mjs:cross",
  });
});

test("manual dispatch output runs both jobs", () => {
  assert.equal(formatGitHubOutputs({ runWeb: true, runAndroid: true, reason: "workflow_dispatch; run all" }), "run_web=true\nrun_android=true\nreason=workflow_dispatch; run all");
});
