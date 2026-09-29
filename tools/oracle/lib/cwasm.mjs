// C side of the oracle: preprocess a pokefirered .c with the existing decomp
// pipeline, compile it to wasm32 and instantiate it with libc imports.
//
// NOT the GBA: this is clang/wasm32 semantics (ILP32, little endian, unsigned
// char) on the same C text. ARM/agbcc ABI details, hardware and timing are absent.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, statSync } from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);
export const OUT = path.join(ROOT, ".decomp-build", "oracle");

// The exact flags are part of the result: see README and REPORT.
export const CFLAGS = ["--target=wasm32", "-O0", "-fwrapv", "-funsigned-char", "-ffreestanding", "-nostdlib", "-w",
  "-Wno-implicit-function-declaration"];
export const LDFLAGS = ["-Wl,--no-entry", "-Wl,--export-all", "-Wl,--allow-undefined"];

export function preprocess(tc, stem) {
  mkdirSync(OUT, { recursive: true });
  const code = `import sys\nsys.path.insert(0, ${JSON.stringify(path.join(ROOT, "tools/decomp"))})\n` +
    `import clang_ast\nfrom common import DECOMP\nprint(clang_ast.preprocess_c_file(DECOMP / "src" / ${JSON.stringify(stem + ".c")}))`;
  const out = execFileSync(tc.python, ["-c", code], { encoding: "utf8", cwd: ROOT }).trim().split("\n").pop();
  const dst = path.join(OUT, `${stem}.pp.c`);
  copyFileSync(out, dst); // decomp-build file may be rewritten by other tools
  return dst;
}

/** Drop `static` from the named functions/variables (declaration and definition) so they are exported. */
export function unstatic(source, names) {
  let s = source;
  for (const n of names) {
    const re = new RegExp(`(^|\\n)([ \\t]*)(?:static|extern)\\s+((?:const\\s+|volatile\\s+)*[\\w\\s\\*]*?\\b${n}\\b\\s*[\\(\\[=;])`, "g");
    s = s.replace(re, "$1$2$3");
  }
  return s;
}

export function compileC(tc, stem, { unstaticNames = [], appendC = "", srcPath = null } = {}) {
  const t0 = Date.now();
  mkdirSync(OUT, { recursive: true });
  const pp = srcPath ?? preprocess(tc, stem);
  const src = unstatic(readFileSync(pp, "utf8"), unstaticNames) + "\n" + appendC;
  const c = path.join(OUT, `${stem}.oracle.c`);
  writeFileSync(c, src);
  const obj = path.join(OUT, `${stem}.oracle.o`);
  const wasm = path.join(OUT, `${stem}.oracle.wasm`);
  const cc = spawnSync(tc.clang, [...CFLAGS, "-c", c, "-o", obj], { encoding: "utf8" });
  if (cc.status !== 0) throw new Error(`clang failed on ${stem}:\n${cc.stderr.slice(0, 2000)}`);
  const ld = spawnSync(tc.clang, [...CFLAGS, ...LDFLAGS, `-fuse-ld=${tc.wasmLd}`, obj, "-o", wasm], { encoding: "utf8" });
  if (ld.status !== 0) throw new Error(`wasm-ld failed on ${stem}:\n${ld.stderr.slice(0, 2000)}`);
  let undefinedSyms = [];
  if (tc.nm) {
    const nm = spawnSync(tc.nm, ["-u", obj], { encoding: "utf8" });
    undefinedSyms = nm.stdout.split("\n").map((l) => l.trim().replace(/^U\s+/, "")).filter(Boolean);
  }
  return { wasm, compileMs: Date.now() - t0, wasmBytes: statSync(wasm).size, undefinedSyms,
    cmd: `${path.basename(tc.clang)} ${CFLAGS.join(" ")} ${LDFLAGS.join(" ")} <stem>.oracle.c` };
}

// Minimal libc surface the decomp code may import. Everything else is a stub
// that throws so an unexpected dependency is reported, not silently ignored.
function libc(getMem, calls) {
  const u8 = () => new Uint8Array(getMem().buffer);
  return {
    abs: (x) => (x < 0 ? -x | 0 : x | 0),
    memcpy: (d, s, n) => { u8().copyWithin(d, s, s + n); return d; },
    memmove: (d, s, n) => { u8().copyWithin(d, s, s + n); return d; },
    memset: (d, v, n) => { u8().fill(v & 0xff, d, d + n); return d; },
  };
}

export function instantiate(wasmPath) {
  const bytes = readFileSync(wasmPath);
  const mod = new WebAssembly.Module(bytes);
  const imports = WebAssembly.Module.imports(mod).filter((i) => i.kind === "function");
  let mem = null;
  const provided = libc(() => mem);
  const calls = [];
  const env = {};
  for (const i of imports) {
    env[i.name] = provided[i.name] ?? ((..._a) => { calls.push(i.name); throw new Error(`oracle: unexpected import ${i.module}.${i.name}`); });
  }
  const inst = new WebAssembly.Instance(mod, { env });
  mem = inst.exports.memory;
  const importNames = imports.map((i) => i.name);
  return { inst, exports: inst.exports, mem, imports: importNames,
    libcProvided: importNames.filter((n) => provided[n]), stubbed: importNames.filter((n) => !provided[n]) };
}

// Typed views of the C side.
export function ctype(t) {
  return { u8: [8, false], s8: [8, true], u16: [16, false], s16: [16, true], u32: [32, false], s32: [32, true],
    bool8: [8, false], bool32: [32, false], int: [32, true] }[t];
}
export function wrapTo(t, v) {
  const [bits, signed] = ctype(t);
  if (bits === 32) return signed ? v | 0 : v >>> 0;
  const m = (1 << bits) - 1;
  const u = v & m;
  return signed && u >= 1 << (bits - 1) ? u - (1 << bits) : u;
}
export function readTyped(mem, addr, t) {
  const dv = new DataView(mem.buffer);
  switch (t) {
    case "u8": return dv.getUint8(addr);
    case "s8": return dv.getInt8(addr);
    case "u16": return dv.getUint16(addr, true);
    case "s16": return dv.getInt16(addr, true);
    case "u32": return dv.getUint32(addr, true);
    case "s32": return dv.getInt32(addr, true);
  }
  throw new Error("readTyped " + t);
}
