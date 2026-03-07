import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Signal to src/test/setup.ts that we're running evals — skip MSW.
process.env.EVALITE_RUNNING = "true";

// Load .env.local so evals can access API keys without manual export.
// Uses a simple parser to avoid adding dotenv as a dependency.
try {
  const envPath = resolve(process.cwd(), ".env.local");
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // .env.local not found — that's fine, env vars may already be set
}
