import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const defaultRepoRoot = resolve(appRoot, "..", "..");
const defaultArtifactPath = join(appRoot, ".wrangler", "dev-workflow", "latest.json");
const surfaces = new Set(["web", "worker", "cross", "migrations", "docs"]);
const profiles = new Set(["fast", "standard", "heavy"]);
const evidenceStates = new Set(["PASS", "FAIL", "NOT_RUN", "NOT_REQUIRED", "PENDING", "PENDING_NETWORK", "TOOLING_BLOCKED"]);

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArgs(argv, { requireSurface = false } = {}) {
  const options = {
    base: undefined,
    json: false,
    nonprodStatic: false,
    offline: false,
    profile: undefined,
    surface: undefined,
    evidence: {},
  };
  const valueFlags = new Map([
    ["--base", "base"],
    ["--profile", "profile"],
    ["--surface", "surface"],
    ["--nonprod", "nonprod"],
    ["--browser", "browser"],
    ["--api", "api"],
    ["--db", "db"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const equalsIndex = argument.indexOf("=");
    const flag = equalsIndex >= 0 ? argument.slice(0, equalsIndex) : argument;
    const inlineValue = equalsIndex >= 0 ? argument.slice(equalsIndex + 1) : undefined;
    if (valueFlags.has(flag)) {
      const key = valueFlags.get(flag);
      const value = inlineValue ?? valueAfter(argv, index, flag);
      if (inlineValue === undefined) index += 1;
      if (["nonprod", "browser", "api", "db"].includes(key)) {
        const normalized = value.toUpperCase();
        if (!evidenceStates.has(normalized)) throw new Error(`Invalid ${key} evidence state: ${value}`);
        options.evidence[key === "nonprod" ? "persistent_nonprod" : key] = normalized;
      } else {
        options[key] = key === "base" ? value : value.toLowerCase();
      }
      continue;
    }
    if (argument === "--json") options.json = true;
    else if (argument === "--nonprod-static") options.nonprodStatic = true;
    else if (argument === "--offline") options.offline = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }

  if (options.profile && !profiles.has(options.profile)) throw new Error(`Invalid profile: ${options.profile}`);
  if (options.surface && !surfaces.has(options.surface)) throw new Error(`Invalid surface: ${options.surface}`);
  if (requireSurface && !options.surface) throw new Error("An explicit --surface web|worker|cross|migrations|docs is required");
  return options;
}

export function parseAheadBehind(output) {
  const match = output.trim().match(/^(\d+)\s+(\d+)$/);
  if (!match) throw new Error(`Cannot parse ahead/behind output: ${output}`);
  return { ahead: Number(match[1]), behind: Number(match[2]) };
}

function normalizePaths(paths) {
  return [...new Set(paths.map((path) => path.replaceAll("\\", "/")).filter(Boolean))].sort();
}

export function classifyRisks(paths) {
  const normalized = normalizePaths(paths).map((path) => path.toLowerCase());
  const signals = [];
  const has = (pattern) => normalized.some((path) => pattern.test(path));
  if (has(/(^|\/)(migrations?|schema)(\/|\.|$)/)) signals.push("migration changes");
  if (has(/(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|npm-shrinkwrap\.json)$/)) signals.push("dependency / lockfile changes");
  if (has(/(^|\/)(worker|routes?)(\/|\.|$)|(^|\/)api\.ts$/)) signals.push("Worker/API area changes");
  if (has(/(^|\/)(src\/shared|shared)(\/|\.|$)|contracts?\.ts$/)) signals.push("shared-contract area changes");
  if (has(/(^|\/)(auth|security|bootstrap)(\/|\.|$)|better-auth/)) signals.push("auth/security-related area changes");
  if (has(/(^|\/)(wrangler|vite\.config|\.github|deploy|verify-nonprod-deploy)(\/|\.|$)/)) signals.push("deployment/config changes");
  return signals;
}

function envWithoutCloudflareEnv() {
  const environment = { ...process.env };
  delete environment.CLOUDFLARE_ENV;
  return environment;
}

function npmCommand() {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) return { executable: process.execPath, prefix: [npmExecPath] };
  return { executable: process.platform === "win32" ? "npm.cmd" : "npm", prefix: [] };
}

function npmRun(script, environment = envWithoutCloudflareEnv()) {
  const npm = npmCommand();
  return { executable: npm.executable, args: [...npm.prefix, "run", script], cwd: appRoot, env: environment };
}

function step(name, command) {
  return { name, ...command };
}

export function buildPlan(profile, surface, { nonprodStatic = false } = {}) {
  const normalizedProfile = profile.toLowerCase();
  const normalizedSurface = surface.toLowerCase();
  if (!profiles.has(normalizedProfile)) throw new Error(`Invalid profile: ${profile}`);
  if (!surfaces.has(normalizedSurface)) throw new Error(`Invalid surface: ${surface}`);

  const plan = [];
  if (normalizedSurface === "docs") {
    plan.push(step("git diff --check", { executable: "git", args: ["diff", "--check"], cwd: defaultRepoRoot, env: envWithoutCloudflareEnv() }));
  } else {
    if (["web", "cross", "migrations"].includes(normalizedSurface)) plan.push(step("full Web suite", npmRun("test:web")));
    if (["worker", "cross", "migrations"].includes(normalizedSurface)) plan.push(step("full Worker/D1 suite", npmRun("test")));
    if (normalizedSurface === "migrations") plan.push(step("migration verification", npmRun("test:migrations")));
    plan.push(step("typecheck", npmRun("typecheck")));
    plan.push(step("normal build", npmRun("build")));
  }

  if (nonprodStatic) {
    const nonprodEnvironment = { ...envWithoutCloudflareEnv(), CLOUDFLARE_ENV: "nonprod" };
    plan.push(step("exact nonprod build", npmRun("build", nonprodEnvironment)));
    plan.push(step("nonprod deploy guard", npmRun("verify:nonprod-deploy")));
    const wrangler = join(appRoot, "node_modules", "wrangler", "bin", "wrangler.js");
    plan.push(step("Wrangler nonprod dry-run", {
      executable: process.execPath,
      args: [wrangler, "deploy", "--config", "dist/taskchute_web/wrangler.json", "--name", "taskchute-web-nonprod", "--dry-run"],
      cwd: appRoot,
      env: envWithoutCloudflareEnv(),
    }));
  }
  plan.push(step("git diff --check", { executable: "git", args: ["diff", "--check"], cwd: defaultRepoRoot, env: envWithoutCloudflareEnv() }));
  return plan;
}

export function hasRealDeploy(plan) {
  return plan.some((command) => {
    const args = command.args ?? [];
    return args.includes("deploy") && !args.includes("--dry-run");
  });
}

export function heavyRemainingEvidence() {
  return [
    "HEAVY profile-specific evidence may still be required: migration/recovery, persistent nonprod, API, browser, and DB verification.",
    "This orchestrator reports only the automated core and never promotes missing evidence to PASS.",
  ];
}

function commandDisplay(command) {
  return [command.executable, ...command.args].join(" ");
}

export function runVerification({
  profile,
  surface,
  nonprodStatic = false,
  runner = spawnSync,
  artifactPath = defaultArtifactPath,
  head,
  now = () => Date.now(),
  output = console,
} = {}) {
  const plan = buildPlan(profile, surface, { nonprodStatic });
  if (hasRealDeploy(plan)) throw new Error("Refusing a verification plan containing a real deploy command");
  const startedAtMs = now();
  const startedAt = new Date(startedAtMs).toISOString();
  const resolvedHead = head ?? runGit(["rev-parse", "HEAD"], defaultRepoRoot).trim();
  const steps = [];
  let failure;

  for (const planned of plan) {
    const stepStartedAtMs = now();
    output.log(`\n[verify] ${planned.name}`);
    output.log(`$ ${commandDisplay(planned)}`);
    let result;
    try {
      result = runner(planned.executable, planned.args, {
        cwd: planned.cwd,
        env: planned.env,
        encoding: "utf8",
        stdio: "inherit",
        shell: false,
        windowsHide: true,
      });
    } catch (error) {
      result = { status: null, error };
    }
    const stepEndedAtMs = now();
    const exitCode = typeof result?.status === "number" ? result.status : null;
    const passed = exitCode === 0 && !result?.error;
    const record = {
      name: planned.name,
      command: commandDisplay(planned),
      started_at: new Date(stepStartedAtMs).toISOString(),
      ended_at: new Date(stepEndedAtMs).toISOString(),
      duration_ms: Math.max(0, stepEndedAtMs - stepStartedAtMs),
      status: passed ? "PASS" : "FAIL",
      exit_code: exitCode,
    };
    steps.push(record);
    output.log(`[verify] ${record.status} ${planned.name} (${record.duration_ms} ms)`);
    if (!passed) {
      failure = new Error(`${planned.name} failed${result?.error ? `: ${result.error.message}` : ` with exit code ${exitCode}`}`);
      break;
    }
  }

  const endedAtMs = now();
  const artifact = {
    version: 1,
    started_at: startedAt,
    ended_at: new Date(endedAtMs).toISOString(),
    total_duration_ms: Math.max(0, endedAtMs - startedAtMs),
    profile: profile.toLowerCase(),
    surface: surface.toLowerCase(),
    nonprod_static: Boolean(nonprodStatic),
    git_head: resolvedHead,
    result: failure ? "FAIL" : "PASS",
    steps,
    manual_evidence: {
      persistent_nonprod: "NOT_RUN",
      browser: "NOT_RUN",
      api: "NOT_RUN",
      db: "NOT_RUN",
    },
  };
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  if (failure) throw failure;
  return artifact;
}

function runGit(args, cwd = defaultRepoRoot) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: false, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${(result.stderr ?? "").trim()}`);
  return result.stdout ?? "";
}

function parsePorcelainPaths(output) {
  return normalizePaths(output.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).replace(/^.* -> /, "")));
}

export function getGitSnapshot({ base, offline = false, repoRoot = defaultRepoRoot } = {}) {
  const discoveredRoot = resolve(runGit(["rev-parse", "--show-toplevel"], appRoot).trim());
  if (discoveredRoot !== resolve(repoRoot)) throw new Error(`Repository root mismatch: expected ${repoRoot}, found ${discoveredRoot}`);
  if (!offline) {
    runGit(["fetch", "origin", "main:refs/remotes/origin/main"], discoveredRoot);
  }
  const branch = runGit(["branch", "--show-current"], discoveredRoot).trim();
  const head = runGit(["rev-parse", "HEAD"], discoveredRoot).trim();
  const upstreamResult = spawnSync("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], {
    cwd: discoveredRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: false, windowsHide: true,
  });
  const upstream = upstreamResult.status === 0 ? upstreamResult.stdout.trim() : null;
  const originMain = runGit(["rev-parse", "refs/remotes/origin/main"], discoveredRoot).trim();
  const directMain = offline ? null : runGit(["ls-remote", "origin", "refs/heads/main"], discoveredRoot).trim().split(/\s+/)[0];
  if (!offline && directMain !== originMain) throw new Error(`origin/main ${originMain} differs from directly checked GitHub main ${directMain}`);
  const aheadBehind = parseAheadBehind(runGit(["rev-list", "--left-right", "--count", "HEAD...refs/remotes/origin/main"], discoveredRoot));
  const statusOutput = runGit(["status", "--porcelain=v1", "--untracked-files=all"], discoveredRoot);
  const dirtyPaths = parsePorcelainPaths(statusOutput);
  const changedPaths = base
    ? normalizePaths(runGit(["diff", "--name-only", `${base}..HEAD`], discoveredRoot).split(/\r?\n/))
    : dirtyPaths;
  const riskPaths = normalizePaths([...dirtyPaths, ...changedPaths]);
  return {
    repository_root: discoveredRoot,
    branch,
    head,
    upstream,
    origin_main: originMain,
    github_main: directMain,
    ahead: aheadBehind.ahead,
    behind: aheadBehind.behind,
    dirty_paths: dirtyPaths,
    changed_paths: changedPaths,
    risk_signals: classifyRisks(riskPaths),
    authoritative: !offline,
  };
}

function printPreflight(snapshot) {
  console.log(snapshot.authoritative ? "Authoritative preflight: PASS" : "Offline preflight: PASS (non-authoritative inspection)");
  console.log(`Repository root: ${snapshot.repository_root}`);
  console.log(`Branch: ${snapshot.branch}`);
  console.log(`HEAD: ${snapshot.head}`);
  console.log(`Upstream: ${snapshot.upstream ?? "<none configured>"}`);
  console.log(`origin/main: ${snapshot.origin_main}`);
  console.log(`GitHub main: ${snapshot.github_main ?? "<offline inspection>"}`);
  console.log(`Ahead/behind: ${snapshot.ahead}/${snapshot.behind}`);
  console.log(`Tracked/untracked status entries: ${snapshot.dirty_paths.length}`);
  console.log(`Changed paths: ${snapshot.changed_paths.join(", ") || "<none>"}`);
  console.log(`Risk signals (review/escalation candidates): ${snapshot.risk_signals.join(", ") || "<none>"}`);
}

function loadArtifact(path = defaultArtifactPath) {
  if (!existsSync(path)) throw new Error(`No verification artifact found at ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

export function validateEvidenceState(state) {
  const normalized = state.toUpperCase();
  if (!evidenceStates.has(normalized)) throw new Error(`Invalid evidence state: ${state}`);
  return normalized;
}

export function formatEvidenceSummary(artifact, git, overrides = {}) {
  const evidence = {
    persistent_nonprod: "NOT_RUN",
    browser: "NOT_RUN",
    api: "NOT_RUN",
    db: "NOT_RUN",
    ...artifact.manual_evidence,
  };
  for (const [key, value] of Object.entries(overrides)) evidence[key] = validateEvidenceState(value);
  const passedSteps = artifact.steps.filter((item) => item.status === "PASS").length;
  const automatedStatus = artifact.result === "PASS" ? "PASS" : "FAIL";
  const lines = [
    "# Verification Summary",
    "",
    `- HEAD: ${git.head ?? artifact.git_head}`,
    `- Profile: ${artifact.profile}`,
    `- Affected surface: ${artifact.surface}`,
    `- Automated core: ${automatedStatus} (${passedSteps}/${artifact.steps.length} steps)`,
    `- Total automated verification duration: ${artifact.total_duration_ms} ms`,
    "",
    "## Automated steps",
    "",
    ...artifact.steps.map((item) => `- ${item.status}: ${item.name} (${item.duration_ms} ms)`),
    "",
    "## Separate evidence categories",
    "",
    `- Persistent nonprod deployment: ${evidence.persistent_nonprod}`,
    `- Browser: ${evidence.browser}`,
    `- API: ${evidence.api}`,
    `- DB: ${evidence.db}`,
    "",
    "## Git state",
    "",
    `- Current HEAD: ${git.head ?? "NOT_RUN"}`,
    `- Dirty paths: ${git.dirty_paths?.length ? git.dirty_paths.join(", ") : "<none>"}`,
    "",
    "## Final classification input",
    "",
    "- Automated verification is reported separately from manual/persistent evidence.",
    "- Missing evidence remains NOT_RUN; this summary never promotes it to PASS.",
  ];
  return lines.join("\n");
}

function currentGitForSummary() {
  const head = runGit(["rev-parse", "HEAD"], defaultRepoRoot).trim();
  const status = runGit(["status", "--porcelain=v1", "--untracked-files=all"], defaultRepoRoot);
  return { head, dirty_paths: parsePorcelainPaths(status) };
}

function main() {
  const [command, ...argv] = process.argv.slice(2);
  if (command === "preflight") {
    const options = parseArgs(argv);
    const snapshot = getGitSnapshot({ base: options.base, offline: options.offline });
    if (options.json) console.log(JSON.stringify(snapshot, null, 2));
    else printPreflight(snapshot);
    return;
  }
  if (command === "verify") {
    const options = parseArgs(argv, { requireSurface: true });
    const artifact = runVerification({ profile: options.profile ?? "standard", surface: options.surface, nonprodStatic: options.nonprodStatic });
    if ((options.profile ?? "standard") === "heavy") for (const line of heavyRemainingEvidence()) console.log(line);
    console.log(`Verification artifact: ${defaultArtifactPath}`);
    console.log(`Verification result: ${artifact.result}`);
    return;
  }
  if (command === "evidence") {
    const options = parseArgs(argv);
    const artifact = loadArtifact();
    const summary = formatEvidenceSummary(artifact, currentGitForSummary(), options.evidence);
    console.log(summary);
    return;
  }
  throw new Error("Usage: node scripts/dev-workflow.mjs preflight|verify|evidence");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`dev-workflow failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

export const WORKFLOW_ARTIFACT_PATH = defaultArtifactPath;
export const WORKFLOW_REPOSITORY_ROOT = defaultRepoRoot;
