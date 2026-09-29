// Locates the opt-in C -> wasm32 toolchain. Never throws for a missing tool:
// callers get { ok: false, missing: [...] } and print an explanation.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

function tryRun(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    return null;
  }
}

// ORACLE_LLVM_BIN, when set, is the ONLY place searched (also used to test the clean-failure path).
function candidates(name) {
  const env = process.env.ORACLE_LLVM_BIN;
  if (env) return [path.join(env, name)].filter(existsSync);
  const dirs = ["/opt/homebrew/opt/llvm@16/bin", "/opt/homebrew/opt/llvm/bin", "/usr/local/opt/llvm/bin"];
  return [...dirs.map((d) => path.join(d, name)).filter(existsSync), name];
}

export function findToolchain() {
  const missing = [];
  let clang = null;
  for (const c of candidates("clang")) {
    const targets = tryRun(c, ["--print-targets"]);
    if (targets && /wasm32/.test(targets)) { clang = c; break; }
  }
  if (!clang) missing.push("a clang with the wasm32 backend (set ORACLE_LLVM_BIN, e.g. /opt/homebrew/opt/llvm@16/bin)");
  const wasmLd = candidates("wasm-ld").find((c) => tryRun(c, ["--version"]));
  if (!wasmLd) missing.push("wasm-ld (part of Homebrew llvm / lld)");
  const nm = candidates("llvm-nm").find((c) => tryRun(c, ["--version"])) ?? null;
  const python = tryRun("python3", ["--version"]) ? "python3" : null;
  if (!python) missing.push("python3 (used to reuse tools/decomp preprocessing)");
  if (missing.length) return { ok: false, missing };
  const version = (tryRun(clang, ["--version"]) ?? "").split("\n")[0];
  const ldVersion = (tryRun(wasmLd, ["--version"]) ?? "").trim();
  return { ok: true, clang, wasmLd, nm, python, version, ldVersion };
}
