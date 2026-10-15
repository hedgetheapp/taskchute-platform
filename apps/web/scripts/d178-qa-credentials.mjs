import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";

const QA_ALIAS = "d178-routine-qa";
const PROTECTED_FILE_MAGIC = Buffer.from("D178DPAPI1\0", "ascii");
const DPAPI_ENTROPY = "TaskChutePlatform:D178:operator-private:v1";
const MAX_PROTECTED_JSON_BYTES = 1024 * 1024;

const DPAPI_PROTECT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Security
  $memory = New-Object System.IO.MemoryStream
  [Console]::OpenStandardInput().CopyTo($memory)
  $inputBytes = $memory.ToArray()
  $entropy = [System.Text.Encoding]::UTF8.GetBytes('TaskChutePlatform:D178:operator-private:v1')
  $outputBytes = [System.Security.Cryptography.ProtectedData]::Protect(
    $inputBytes,
    $entropy,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  [Console]::OpenStandardOutput().Write($outputBytes, 0, $outputBytes.Length)
} catch {
  exit 81
}
`;

const DPAPI_UNPROTECT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Security
  $memory = New-Object System.IO.MemoryStream
  [Console]::OpenStandardInput().CopyTo($memory)
  $inputBytes = $memory.ToArray()
  $entropy = [System.Text.Encoding]::UTF8.GetBytes('TaskChutePlatform:D178:operator-private:v1')
  $outputBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $inputBytes,
    $entropy,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  [Console]::OpenStandardOutput().Write($outputBytes, 0, $outputBytes.Length)
} catch {
  exit 82
}
`;

const HARDEN_DIRECTORY_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$stage = 'START'
try {
  $stage = 'PATH'
  $path = [Environment]::GetEnvironmentVariable('D178_OPERATOR_PRIVATE_DIR')
  if (-not $path) { exit 83 }
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $stage = 'DESCRIPTOR'
  $acl = New-Object System.Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true, $false)
  $acl.SetOwner($identity.User)
  $inheritance = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  $propagation = [System.Security.AccessControl.PropagationFlags]::None
  $rights = [System.Security.AccessControl.FileSystemRights]::FullControl
  $allow = [System.Security.AccessControl.AccessControlType]::Allow
  $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($identity.User, $rights, $inheritance, $propagation, $allow)))
  $system = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
  $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($system, $rights, $inheritance, $propagation, $allow)))
  $stage = 'APPLY'
  [System.IO.Directory]::SetAccessControl($path, $acl)
  $stage = 'VERIFY'
  $verified = [System.IO.Directory]::GetAccessControl($path)
  $expected = @($identity.User.Value, 'S-1-5-18')
  $rules = @($verified.Access)
  $valid = $rules.Count -eq 2
  foreach ($rule in $rules) {
    $sid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
    if ($sid -notin $expected -or $rule.IsInherited -or $rule.AccessControlType -ne $allow -or $rule.FileSystemRights -ne $rights) { $valid = $false }
  }
  if (-not $valid) { exit 84 }
  [Console]::Out.Write('OK')
} catch {
  [Console]::Out.Write('HARDEN_FAIL_' + $stage + '_' + $_.Exception.GetType().Name.ToUpperInvariant())
  exit 85
}
`;

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function stableD178QaIdentity() {
  const digest = createHash("sha256")
    .update("hedgetheapp/taskchute-platform/" + QA_ALIAS + "/app-user/v1", "utf8")
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  let timestamp = BigInt(Date.UTC(2026, 9, 14));
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  const appUserId = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
  const marker = sha256(QA_ALIAS + "/auth-marker/" + appUserId).slice(0, 16);
  return { appUserId, authDisplayName: "D-178 QA fixture " + marker };
}

function timestampLabel() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateEmail(email) {
  return typeof email === "string"
    && email.length <= 320
    && /^[a-z0-9][a-z0-9._+-]*@d178-qa\.invalid$/i.test(email);
}

function validateCredentials(value) {
  if (!isPlainObject(value)
    || value.version !== 1
    || value.alias !== QA_ALIAS
    || !validateEmail(value.email)
    || typeof value.password !== "string"
    || value.password.length < 32
    || value.password.length > 128
    || !/^[A-Za-z0-9_-]+$/.test(value.password)) {
    throw new Error("The operator-protected D-178 credential record is invalid.");
  }
  return value;
}

function validateState(value) {
  if (!isPlainObject(value)
    || value.version !== 1
    || value.alias !== QA_ALIAS
    || !/^[a-f0-9]{64}$/.test(value.email_sha256)
    || !["prepared", "provisioned"].includes(value.status)) {
    throw new Error("The operator-protected D-178 state record is invalid.");
  }
  return value;
}

function validateLegacyState(value) {
  if (!isPlainObject(value)
    || value.version !== 1
    || value.alias !== QA_ALIAS
    || !/^[a-f0-9]{64}$/.test(value.email_sha256)) {
    throw new Error("The earlier private D-178 state is invalid; preserve it and stop.");
  }
  return value;
}

function encodePowerShell(script) {
  return Buffer.from(script, "utf16le").toString("base64");
}

function runPowerShell(script, input = Buffer.alloc(0), extraEnv = {}) {
  if (process.platform !== "win32") {
    throw new Error("Windows operator protection is unavailable on this host.");
  }
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const powershellPath = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const encodedScript = encodePowerShell(script);
  return new Promise((resolve, reject) => {
    const child = spawn(powershellPath, [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      encodedScript,
    ], {
      windowsHide: true,
      env: { ...process.env, ...extraEnv },
      stdio: ["pipe", "pipe", "ignore"],
    });
    const chunks = [];
    let total = 0;
    child.stdout.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_PROTECTED_JSON_BYTES * 2) {
        child.kill();
        reject(new Error("The Windows operator-protection response was too large."));
        return;
      }
      chunks.push(chunk);
    });
    child.once("error", () => reject(new Error("Could not start Windows operator protection.")));
    child.once("close", (code) => {
      if (code !== 0) {
        const diagnostic = Buffer.concat(chunks).toString("ascii");
        const safeDiagnostic = /^HARDEN_FAIL_[A-Z_]+$/.test(diagnostic) ? "; " + diagnostic : "";
        reject(new Error("Windows operator protection failed (exit_code=" + (Number.isSafeInteger(code) ? code : "UNKNOWN") + safeDiagnostic + "); no remote operation was started."));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
    child.stdin.end(input);
  });
}

export class WindowsDpapiProtector {
  async protect(plaintext) {
    return runPowerShell(DPAPI_PROTECT_SCRIPT, Buffer.from(plaintext));
  }

  async unprotect(ciphertext) {
    return runPowerShell(DPAPI_UNPROTECT_SCRIPT, Buffer.from(ciphertext));
  }
}

export async function hardenWindowsPrivateDirectory(directoryPath) {
  if (process.platform !== "win32") {
    throw new Error("Windows operator ACL protection is unavailable on this host.");
  }
  const metadata = await lstat(directoryPath);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("The operator-private directory is not a plain directory.");
  }
  const output = await runPowerShell(HARDEN_DIRECTORY_SCRIPT, Buffer.alloc(0), {
    D178_OPERATOR_PRIVATE_DIR: directoryPath,
  });
  if (output.toString("ascii") !== "OK") {
    throw new Error("The operator-private directory ACL could not be verified.");
  }
}

async function writeProtectedFile(filePath, value, protector) {
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  if (plaintext.length > MAX_PROTECTED_JSON_BYTES) {
    throw new Error("The operator-protected D-178 record exceeded its size limit.");
  }
  const ciphertext = await protector.protect(plaintext);
  if (!Buffer.isBuffer(ciphertext) || ciphertext.length < 16) {
    throw new Error("The operator credential store did not return protected data.");
  }
  const payload = Buffer.concat([PROTECTED_FILE_MAGIC, ciphertext]);
  const temporaryPath = filePath + ".tmp-" + randomBytes(8).toString("hex");
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(payload);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    const code = typeof error?.code === "string" && /^[A-Z0-9_]{1,24}$/.test(error.code) ? error.code : "UNKNOWN";
    throw new Error("The operator-protected D-178 record could not be saved atomically (code=" + code + ").");
  }
  const verified = await readProtectedFile(filePath, protector);
  if (JSON.stringify(verified) !== JSON.stringify(value)) {
    throw new Error("The operator-protected D-178 record failed its read-back check.");
  }
}

async function readProtectedFile(filePath, protector) {
  let file;
  try {
    file = await readFile(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error("An operator-protected D-178 record could not be read.");
  }
  if (file.length <= PROTECTED_FILE_MAGIC.length
    || !file.subarray(0, PROTECTED_FILE_MAGIC.length).equals(PROTECTED_FILE_MAGIC)) {
    throw new Error("An operator-protected D-178 record has an unknown format.");
  }
  let plaintext;
  try {
    plaintext = await protector.unprotect(file.subarray(PROTECTED_FILE_MAGIC.length));
    if (!Buffer.isBuffer(plaintext) || plaintext.length > MAX_PROTECTED_JSON_BYTES) throw new Error("invalid");
    return JSON.parse(plaintext.toString("utf8"));
  } catch {
    throw new Error("An operator-protected D-178 record could not be decrypted safely.");
  }
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createD178PrivateStore({
  rootDir = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "TaskChutePlatform", "D178")
    : "",
  legacyStatePath,
  protector = new WindowsDpapiProtector(),
  hardenDirectory = hardenWindowsPrivateDirectory,
  random = randomBytes,
} = {}) {
  if (!rootDir || !path.isAbsolute(rootDir)) {
    throw new Error("A local operator-private Windows directory is required.");
  }
  const vaultPath = path.join(rootDir, "qa-credentials.dpapi");
  const statePath = path.join(rootDir, "qa-state.dpapi");
  const archiveDir = path.join(rootDir, "legacy-state-archives");

  async function ensureDirectory(directoryPath) {
    await mkdir(directoryPath, { recursive: true });
    await hardenDirectory(directoryPath);
  }

  async function ensureReady() {
    await ensureDirectory(rootDir);
  }

  async function loadExisting() {
    await ensureReady();
    const [credentialRecord, stateRecord] = await Promise.all([
      readProtectedFile(vaultPath, protector),
      readProtectedFile(statePath, protector),
    ]);
    if (stateRecord && !credentialRecord) {
      throw new Error("The D-178 private state exists without its recoverable credential vault.");
    }
    if (!credentialRecord) return { credentials: null, state: null };
    const credentials = validateCredentials(credentialRecord);
    if (!stateRecord) return { credentials, state: null };
    const state = validateState(stateRecord);
    if (state.email_sha256 !== sha256(credentials.email.trim().toLowerCase())) {
      throw new Error("The D-178 protected state and credential vault do not match.");
    }
    return { credentials, state };
  }

  async function readLegacyState() {
    if (!legacyStatePath) return null;
    try {
      const parsed = JSON.parse(await readFile(legacyStatePath, "utf8"));
      return validateLegacyState(parsed);
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      if (error instanceof Error && error.message.includes("earlier private D-178 state")) throw error;
      throw new Error("The earlier private D-178 state could not be read safely.");
    }
  }

  async function archiveLegacyState(legacyState) {
    if (!legacyState) return { archived: false, emailSha256: null };
    await ensureDirectory(archiveDir);
    const names = await readdir(archiveDir);
    for (const name of names.filter((entry) => /^legacy-state-[A-Za-z0-9-]+\.dpapi$/.test(entry))) {
      const archived = await readProtectedFile(path.join(archiveDir, name), protector);
      if (!isPlainObject(archived) || archived.kind !== "legacy-d178-qa-state" || !archived.state) {
        throw new Error("An existing encrypted legacy-state archive is ambiguous.");
      }
      if (sameJson(validateLegacyState(archived.state), legacyState)) {
        return { archived: true, emailSha256: legacyState.email_sha256 };
      }
    }
    const archivePath = path.join(archiveDir, "legacy-state-" + timestampLabel() + "-" + random(5).toString("hex") + ".dpapi");
    await writeProtectedFile(archivePath, {
      kind: "legacy-d178-qa-state",
      archived_at: new Date().toISOString(),
      state: legacyState,
    }, protector);
    return { archived: true, emailSha256: legacyState.email_sha256 };
  }

  async function prepareCredentials({ remoteReconciled, remoteState }) {
    if (remoteReconciled !== true || !["absent", "recoverable"].includes(remoteState)) {
      throw new Error("Remote D-178 identity reconciliation must pass before credentials are prepared.");
    }
    const existing = await loadExisting();
    const legacyState = await readLegacyState();
    if (remoteState === "absent" && legacyState) await archiveLegacyState(legacyState);
    if (existing.credentials) {
      if (existing.state) return existing;
      const state = {
        version: 1,
        alias: QA_ALIAS,
        email_sha256: sha256(existing.credentials.email.trim().toLowerCase()),
        status: "prepared",
        prepared_at: new Date().toISOString(),
      };
      await writeProtectedFile(statePath, state, protector);
      return { credentials: existing.credentials, state };
    }
    if (remoteState !== "absent") {
      throw new Error("An existing remote D-178 identity has no recoverable local credential vault.");
    }
    const credentials = validateCredentials({
      version: 1,
      alias: QA_ALIAS,
      email: "d178-routine-qa-" + random(18).toString("hex") + "@d178-qa.invalid",
      password: random(32).toString("base64url"),
      created_at: new Date().toISOString(),
    });
    await writeProtectedFile(vaultPath, credentials, protector);
    const state = {
      version: 1,
      alias: QA_ALIAS,
      email_sha256: sha256(credentials.email.trim().toLowerCase()),
      status: "prepared",
      prepared_at: new Date().toISOString(),
    };
    await writeProtectedFile(statePath, state, protector);
    return { credentials, state };
  }

  async function saveState(state) {
    validateState(state);
    const current = await loadExisting();
    if (!current.credentials || sha256(current.credentials.email.trim().toLowerCase()) !== state.email_sha256) {
      throw new Error("The D-178 state update does not match its protected credential vault.");
    }
    await writeProtectedFile(statePath, state, protector);
  }

  return {
    rootDir,
    vaultPath,
    statePath,
    archiveDir,
    ensureReady,
    loadExisting,
    readLegacyState,
    archiveLegacyState,
    prepareCredentials,
    saveState,
  };
}
