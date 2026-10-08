// Fails when a generic "press A" comes back into the driver. The only way the driver may send A (or B) is
// ctx.input()/input(H, ...) with an expect() postcondition and a trailing "// input: <screen>" marker naming the
// screen that accepts it. Raw H.press/H.tap/H.until with a button, step(1) and tap(1...) are forbidden in
// tools/playtest/driver.js and tools/playtest/driver/**.
// Usage: node tools/playtest/driver.check.mjs [--selftest]
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN = [
  [/\.press\(\s*["'](A|B|START|SELECT)["']/, "raw press() of a button"],
  [/\.tap\(\s*(1|2|8|0x1|0x2|0x8)\s*[,)]/, "raw tap() of A/B/START"],
  [/\.until\([^)]*,\s*["'](A|B)["']/, "until() that presses a button while waiting"],
  [/\.step\(\s*(1|2|bits\s*\?)/, "step() with a button"],
  [/this\.tap\(\s*bits/, "tap with a computed button outside the input() helper"],
];
const INPUT = /(?:\.input|pressChecked|\binput)\(\s*(?:this,\s*|H,\s*)?(?:yes\s*\?\s*)?["'](A|B|START)["']/g;

function files(dir) {
  return readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : p.endsWith(".js") ? [p] : []; });
}
export function check(sources) {
  const problems = [];
  for (const [file, text] of sources) {
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line) || /\/\/ primitive:/.test(line)) return;
      for (const [re, why] of FORBIDDEN) if (re.test(line)) problems.push(`${file}:${i + 1}: ${why}: ${line.trim()}`);
    });
    for (const m of text.matchAll(INPUT)) {
      const start = m.index, end = text.indexOf("\n", text.indexOf("})", start)), call = text.slice(start, end < 0 ? undefined : end);
      const lineNo = text.slice(0, start).split("\n").length;
      if (!/expect\s*:/.test(call)) problems.push(`${file}:${lineNo}: input(${m[1]}) without an expect() postcondition`);
      if (m[1] === "A" && !/\/\/\s*input:\s*\S+/.test(call)) problems.push(`${file}:${lineNo}: input("A") without the "// input: <screen>" marker`);
    }
  }
  return problems;
}

if (process.argv[1].endsWith("driver.check.mjs")) {
  if (process.argv.includes("--selftest")) {
    const bad = check([
      ["a.js", 'await this.press("A", 8);'], ["b.js", "await this.tap(1, 4);"], ["c.js", 'await ctx.input("A", { within: 5 });'],
      ["d.js", 'await ctx.input("A", { expect: () => true }); // no marker'], ["e.js", 'await H.until(() => x, "A", 10);'],
    ]);
    const good = check([["f.js", 'await ctx.input("A", { expect: (r) => r.screen !== "x" }); // input: x']]);
    if (bad.length !== 5 || good.length) { console.error("selftest FAILED", bad, good); process.exit(1); }
    console.log(`driver.check selftest PASS (${bad.length} seeded violations caught, a verified A accepted)`);
  } else {
    const roots = ["tools/playtest/driver.js", ...files("tools/playtest/driver")];
    const problems = check(roots.map(f => [f, readFileSync(f, "utf8")]));
    if (problems.length) { console.error(problems.join("\n")); console.error(`driver.check FAIL (${problems.length})`); process.exit(1); }
    console.log(`driver.check PASS (${roots.length} files: every A/B/START goes through a verified input())`);
  }
}
