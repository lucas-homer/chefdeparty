import path from "node:path";
import { fileURLToPath } from "node:url";
import { runVitest } from "evalite/runner";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cwd = path.join(__dirname, "..", "evals", "deterministic");

const exitCode = await runVitest({
  cwd,
  path: undefined,
  mode: "run-once-and-exit",
});

if (typeof exitCode === "number" && exitCode !== 0) {
  globalThis.process.exit(exitCode);
}
