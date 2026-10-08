// One resumable story segment, using the existing browser driver and real input.
// Usage: PW_BASE=http://localhost:5197/ npm run play:cerulean -- /tmp/fire-red-cerulean
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
if (process.argv.length > 3) throw new Error("usage: npm run play:cerulean -- [output-directory]");
const out = resolve(process.argv[2] ?? "tools/playtest/runs/cerulean");
const child = spawn(process.execPath, ["tools/playtest/pw.mjs", "tools/playtest/smoke/cerulean-progress.job.mjs", out], {
  cwd: root, stdio: "inherit", env: { ...process.env,
    PW_BASE: process.env.PW_BASE ?? "http://localhost:5197/",
    PW_TIMEOUT_MS: process.env.PW_TIMEOUT_MS ?? "5400000" },
});
child.on("error", error => { console.error(String(error)); process.exitCode = 1; });
child.on("exit", (code, signal) => { process.exitCode = signal ? 1 : code ?? 1; });
