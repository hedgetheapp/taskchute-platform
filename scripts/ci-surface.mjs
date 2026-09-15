import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ALL_ZERO_SHA = /^0+$/;

// Android consumes these HTTP/realtime boundaries directly. Keep this list
// explicit so an unrecognized Worker path fails safe to both heavy jobs.
const ANDROID_CONSUMED_WORKER_PATHS = [
  "apps/web/worker/index.ts",
  "apps/web/worker/auth/",
  "apps/web/worker/domain/",
  "apps/web/worker/http/",
  "apps/web/worker/persistence/",
  "apps/web/worker/realtime-",
  "apps/web/worker/application/add-task-to-day.ts",
  "apps/web/worker/application/documents.ts",
  "apps/web/worker/application/duplicate-entry.ts",
  "apps/web/worker/application/entry-lifecycle.ts",
  "apps/web/worker/application/entry-planning.ts",
  "apps/web/worker/application/load-current-day.ts",
  "apps/web/worker/application/load-projects.ts",
  "apps/web/worker/application/mode-management.ts",
  "apps/web/worker/application/planned-start.ts",
  "apps/web/worker/application/reorder-entries.ts",
  "apps/web/worker/application/section-configuration.ts",
  "apps/web/worker/application/task-metadata.ts",
  "apps/web/worker/application/task-primary-documents.ts",
];

// These current Worker paths are not consumed by Android's current surface.
// Other Worker paths remain conservative and route to both jobs.
const KNOWN_WEB_ONLY_WORKER_PATHS = [
  "apps/web/worker/application/create-project.ts",
  "apps/web/worker/application/project-management.ts",
  "apps/web/worker/application/project-primary-documents.ts",
  "apps/web/worker/application/routine-board.ts",
  "apps/web/worker/application/routine-calendar-reconciliation.ts",
  "apps/web/worker/application/routine-planning.ts",
  "apps/web/worker/application/routine.ts",
];

function normalizePath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isMarkdownDocumentation(path) {
  const normalized = normalizePath(path);
  return normalized.startsWith("docs/") || normalized.endsWith(".md") || normalized.endsWith(".mdx");
}

function startsWithAny(path, prefixes) {
  return prefixes.some((prefix) => path === prefix || path.startsWith(prefix));
}

function classifyPath(path) {
  const normalized = normalizePath(path);
  if (isMarkdownDocumentation(normalized)) return "docs";
  if (normalized === "scripts/android-qa.ps1" || normalized.startsWith("apps/android/")) return "android";
  if (normalized.startsWith("apps/web/src/shared/")) return "cross";
  if (normalized.startsWith("apps/web/migrations/") || normalized === "apps/web/wrangler.jsonc") return "cross";
  if (normalized.startsWith("apps/web/worker/")) {
    if (startsWithAny(normalized, ANDROID_CONSUMED_WORKER_PATHS)) return "cross";
    if (startsWithAny(normalized, KNOWN_WEB_ONLY_WORKER_PATHS)) return "web";
    return "cross";
  }
  if (normalized.startsWith("apps/web/")) return "web";
  return "cross";
}

export function classifyPaths(paths) {
  const normalizedPaths = paths.map(normalizePath).filter(Boolean);
  if (normalizedPaths.length === 0) {
    return { runWeb: true, runAndroid: true, reason: "no changed paths; fail safe" };
  }

  const classifications = normalizedPaths.map(classifyPath);
  const executable = classifications.filter((classification) => classification !== "docs");
  if (executable.length === 0) {
    return { runWeb: false, runAndroid: false, reason: "documentation-only change" };
  }

  const runWeb = executable.includes("web") || executable.includes("cross");
  const runAndroid = executable.includes("android") || executable.includes("cross");
  return {
    runWeb,
    runAndroid,
    reason: normalizedPaths.map((path, index) => `${path}:${classifications[index]}`).join(", "),
  };
}

function gitChangedPaths(base, head) {
  if (!base || !head || ALL_ZERO_SHA.test(base)) return [];
  const result = spawnSync("git", ["diff", "--name-only", "--diff-filter=ACDMRTUXB", base, head], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git diff failed: ${(result.stderr ?? "").trim()}`);
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--all") options.all = true;
    else if (arg === "--base") options.base = argv[++index];
    else if (arg === "--head") options.head = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export function formatGitHubOutputs(result) {
  return [
    `run_web=${String(result.runWeb)}`,
    `run_android=${String(result.runAndroid)}`,
    `reason=${result.reason}`,
  ].join("\n");
}

export function classifyGitHubChange({ all = false, base, head } = {}) {
  if (all || !base || !head || ALL_ZERO_SHA.test(base)) {
    return { runWeb: true, runAndroid: true, reason: all ? "workflow_dispatch; run all" : "initial push; fail safe" };
  }
  return classifyPaths(gitChangedPaths(base, head));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const result = classifyGitHubChange(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${formatGitHubOutputs(result)}\n`);
  } catch (error) {
    console.error(`ci-surface failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
