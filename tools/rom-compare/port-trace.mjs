// Port side of tools/rom-compare: step the startup (intro) scenes one frame at a time and print
// "<frame> <stage> <LCG state>". Needs the vite dev server (BASE, default http://localhost:5173/).
// Usage: OUT=/tmp/port-trace.txt FRAMES=2400 node tools/rom-compare/port-trace.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("playwright");
const base = process.env.BASE ?? "http://localhost:5173/";
const N = Number(process.env.FRAMES ?? 2400);
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = []; page.on("pageerror", e => errs.push(String(e)));
await page.goto(base);
await page.waitForFunction(() => !!window.frStartup && !!window.frStartupStep, undefined, { polling: 200, timeout: 60000 });
const out = await page.evaluate(async (N) => {
  const s = window.frStartup;
  cancelAnimationFrame(s.raf);           // we own the frame loop from here
  s.last = 0; s.elapsed = 0;
  // Use the exact URL the app loaded (vite appends ?t=<hmr stamp>), or we would get a second module instance.
  const url = performance.getEntriesByType("resource").map(r => r.name).find(n => /\/src\/fr\/random\.ts/.test(n));
  const rnd = await import(url);
  const rows = [];
  for (let i = 0; i < N; i++) {
    window.frStartupStep(1, 0);
    rows.push(`${i} ${s.stage} ${rnd.getRandomState().seed.toString(16).padStart(8, "0")}`);
  }
  return rows;
}, N);
writeFileSync(process.env.OUT ?? "/tmp/port-trace.txt", out.join("\n") + "\n");
console.log("rows", out.length, "errors", errs.length, errs[0] ?? "");
await browser.close();
