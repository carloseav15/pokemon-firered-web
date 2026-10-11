// Port side of the new-game comparison (docs/ROM-COMPARACION-VIABILIDAD.md, phase 4).
// Same input script as the ROM drive: START at title+300, A every 20 frames from title+487 until the
// game (overworld) is created, then FRAMES_AFTER free frames, then a state dump.
// requestAnimationFrame is disabled so the harness owns every frame. Needs the vite dev server (BASE).
// Usage: TIMERS=0x3649,0xbd99 FRAMES_AFTER=229 node tools/rom-compare/port-new-game.mjs
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("playwright");
const TIMERS = (process.env.TIMERS ?? "0x3649,0xbd99").split(",").map(Number), AFTER = Number(process.env.FRAMES_AFTER ?? 229);
const b = await chromium.launch(); const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.goto(process.env.BASE ?? "http://localhost:5173/");
await p.waitForFunction(() => !!window.frStartup && !!window.frStartupStep, undefined, { timeout: 60000 });
await p.evaluate(async ({ TIMERS }) => {
  const s = frStartup; cancelAnimationFrame(s.raf); s.last = 0; s.elapsed = 0;
  window.requestAnimationFrame = () => 0;   // nothing but this harness advances frames
  // Timer1 reads, in order: title seed, then the player's naming-screen exit (the ROM reseeds there).
  const url = performance.getEntriesByType("resource").map(r => r.name).find(n => /\/src\/fr\/hw\/runtime\.ts/.test(n));
  (await import(url)).setTimer1TestValues(TIMERS);
  window.__i = 0; window.__anchor = null; window.__gameFrames = 0;
  window.__rt = await import(url); window.__cb = []; window.__lastCb = null;
}, { TIMERS });
let state = null;
for (let guard = 0; guard < 400 && !state; guard++) {
  state = await p.evaluate(async (AFTER) => {
    const s = frStartup;
    for (let c = 0; c < 50; c++) {
      const i = window.__i++;
      if (window.__anchor === null && s.stage === "title") window.__anchor = i;
      const rel = window.__anchor === null ? -1 : i - window.__anchor;
      const dbg = window.frDebug;
      let btn = 0;
      if (rel >= 300 && rel < 303) btn = 8;
      if (!dbg && rel >= 487 && (rel - 487) % 20 < 3) btn = 1;
      if (dbg) {                                     // game created: free frames, no input
        if (window.__gameFrames >= AFTER) {
          const st = dbg.state(), sv = dbg.save.save;
          const rnd = dbg.snapshot().random.seed;
          return { frame: window.__i, state: st, name: sv.playerName, gender: sv.playerGender, trainerId: sv.trainerId.toString(16),
            rng: rnd.toString(16), mapLayout: sv.location, callbacks: window.__cb };
        }
        dbg.run(1, 0); window.__gameFrames++;
        continue;
      }
      frStartupStep(1, btn);
      cancelAnimationFrame(s.raf);
      const cbn = window.__rt.gMain.callback2?.name ?? "null";
      if (cbn !== window.__lastCb) { window.__cb.push([i, s.stage, cbn]); window.__lastCb = cbn; }
    }
    await new Promise(r => setTimeout(r, 5));       // let launchFireRed()/rom.load() promises settle
    return null;
  }, AFTER);
}
console.log(JSON.stringify(state), "errors", errs.length, errs[0] ?? "");
await b.close();
