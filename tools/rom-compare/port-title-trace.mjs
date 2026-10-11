// Port side of the title/seed comparison (docs/ROM-COMPARACION-VIABILIDAD.md, phase 3).
// Steps the startup scenes one frame at a time with the same schedule as the ROM trace
// (START at title+300, A every 80 frames from title+550) and a fixed Timer1 value (TIMER, the
// value the ROM seeded with). Prints "<step> <stage> <LCG state> <frames since title>".
// Needs the vite dev server (BASE). Usage: TIMER=13897 N=4300 OUT=/tmp/x.txt node tools/rom-compare/port-title-trace.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("playwright");
const b = await chromium.launch(); const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.goto(process.env.BASE ?? "http://localhost:5173/");
await p.waitForFunction(() => !!window.frStartup && !!window.frStartupStep, undefined, { timeout: 60000 });
await p.evaluate(async ({ TIMER }) => {
  const s = frStartup; cancelAnimationFrame(s.raf); s.last = 0; s.elapsed = 0;
  Object.defineProperty(s.titleScreen, "timer1Low", { get: () => TIMER });
  const url = performance.getEntriesByType("resource").map(r => r.name).find(n => /\/src\/fr\/random\.ts/.test(n));
  window.__rnd = await import(url); window.__rows = []; window.__anchor = null; window.__i = 0;
}, { TIMER: Number(process.env.TIMER ?? 0x3649) });
const N = Number(process.env.N ?? 4300);
while (true) {
  const done = await p.evaluate(async (CH) => {
    const s = frStartup;
    for (let c = 0; c < CH; c++) {
      const i = window.__i++;
      if (window.__anchor === null && s.stage === "title") window.__anchor = i;
      const rel = window.__anchor === null ? -1 : i - window.__anchor;
      let btn = 0;
      if (rel >= 300 && rel < 303) btn = 8;
      if (rel >= 550 && rel <= 2550 && (rel - 550) % 80 < 3) btn = 1;
      frStartupStep(1, btn);
      cancelAnimationFrame(s.raf); // tick re-arms rAF; keep the page from stepping itself between chunks
      window.__rows.push([i, s.stage, window.__rnd.getRandomState().seed.toString(16).padStart(8, "0"), rel]);
    }
    await new Promise(r => setTimeout(r, 1));
    return window.__i;
  }, 50);
  if (process.env.V) console.log("step", done);
  if (done >= N) break;
}
const rows = await p.evaluate(() => window.__rows);
writeFileSync(process.env.OUT ?? "/tmp/port-title-trace.txt", rows.map(r => r.join(" ")).join("\n") + "\n");
console.log("rows", rows.length, "errors", errs.length, errs[0] ?? "");
await b.close();
