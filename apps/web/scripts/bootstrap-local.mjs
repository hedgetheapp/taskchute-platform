import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

async function hiddenPrompt(label) {
  if (!stdin.isTTY) throw new Error("A TTY is required for secret input");
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (character) => {
      if (character === "\u0003") {
        cleanup();
        reject(new Error("Cancelled"));
      } else if (character === "\r" || character === "\n") {
        cleanup();
        stdout.write("\n");
        resolve(value);
      } else if (character === "\u007f" || character === "\b") {
        value = value.slice(0, -1);
      } else {
        value += character;
      }
    };
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on("data", onData);
  });
}

function parseBoundary(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Boundary must use HH:MM");
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (minutes < 0 || minutes > 1439) throw new Error("Boundary must be between 00:00 and 23:59");
  return minutes;
}

const prompt = createInterface({ input: stdin, output: stdout });
try {
  const baseURL = (await prompt.question("Local URL [http://localhost:5173]: ")).trim() || "http://localhost:5173";
  const email = (await prompt.question("Bootstrap email: ")).trim();
  const name = (await prompt.question("Display name: ")).trim();
  const timezone = (await prompt.question("IANA timezone (explicit): ")).trim();
  const dayBoundary = parseBoundary((await prompt.question("TaskChuteDay boundary HH:MM: ")).trim());
  const sections = (await prompt.question("Initial Sections (comma separated): "))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  prompt.close();
  const password = await hiddenPrompt("Password (hidden): ");
  const token = await hiddenPrompt("Bootstrap token from .dev.vars (hidden): ");
  const response = await fetch(new URL("/api/internal/bootstrap", baseURL), {
    method: "POST",
    headers: { "content-type": "application/json", "x-taskchute-bootstrap-token": token },
    body: JSON.stringify({ email, password, name, timezone, day_boundary_minutes: dayBoundary, sections }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message ?? `Bootstrap failed (${response.status})`);
  stdout.write(`Bootstrap complete. app_user_id=${result.app_user_id}; recovered=${result.recovered}\n`);
} finally {
  prompt.close();
}

