// Playwright headless runner for browser validation (tasks 1.6/1.9, section 3).
// Usage: node tools/playtest/pw.mjs <job.js> [outdir]
// First install the browser once with: npm run playwright:install
// A job exports: export default async function run(ctx) {}
// ctx: { page, loadSave(name), shot(name), state(), canvas(), errors(), wait(frames), press(btn) }
// Screenshots and pixel data go to outdir (default /tmp/pw). Nothing is committed.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BASE = process.env.PW_BASE ?? "http://localhost:5173/";
const jobPath = process.argv[2];
const outdir = process.argv[3] ?? "/tmp/pw";
if (!jobPath) {
  console.error("usage: node tools/playtest/pw.mjs <job.js> [outdir]");
  process.exit(2);
}
mkdirSync(outdir, { recursive: true });
const { default: run } = await import(pathToFileURL(resolve(jobPath)).href);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 720, height: 540 } });
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error" && !/favicon|ERR_CONNECTION_REFUSED/.test(msg.text()))
    errors.push("console: " + msg.text().slice(0, 300));
});
page.on("pageerror", (err) => errors.push("pageerror: " + String(err).slice(0, 300)));

const ev = (fn, arg) => page.evaluate(fn, arg);
const ctx = {
  page,
  errors: () => errors,
  async loadSave(name) {
    await page.goto(BASE, { waitUntil: "load" });
    // importSave() navigates (location.href); the context may die mid-flight.
    for (let i = 0; i < 3; i++) {
      try {
        await page.evaluate(`(async () => { const { H } = await import("/tools/playtest/driver.js"); await H.importSave("${name}"); })();`);
        break;
      } catch (e) {
        if (!/destroyed|navigation/i.test(String(e))) throw e;
        await page.waitForTimeout(2000);
      }
    }
    await page.waitForLoadState("load", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);
    for (let i = 0; ; i++) {
      try {
        return await page.evaluate(`(async () => { const { H } = await import("/tools/playtest/driver.js"); window.H = H; return await H.ready(); })();`);
      } catch (e) {
        if (i >= 4 || !/destroyed|navigation/i.test(String(e))) throw e;
        await page.waitForTimeout(2000);
      }
    }
  },
  state() {
    return page.evaluate(`(() => window.H.st())();`);
  },
  wait(frames) {
    return page.evaluate(`(async () => window.frDebug.wait(${frames}))();`);
  },
  press(btn, frames = 8) {
    return page.evaluate(`(async () => window.frDebug.press("${btn}", ${frames}))();`);
  },
  runEval(js) {
    return page.evaluate(`(async () => { ${js} })();`);
  },
  shot(name) {
    return page.screenshot({ path: `${outdir}/${name}.png` });
  },
  /** Raw canvas pixels (game canvas 240x160 RGBA). */
  canvas() {
    return page.evaluate(`(() => {
      const c = document.querySelector("canvas");
      const x = c.getContext("2d");
      const d = x.getImageData(0, 0, c.width, c.height);
      return { w: c.width, h: c.height, data: Array.from(d.data) };
    })();`);
  },
};

try {
  const timeoutMs = Number(process.env.PW_TIMEOUT_MS ?? 120000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("invalid PW_TIMEOUT_MS");
  let timer;
  let result;
  try {
    result = await Promise.race([run(ctx), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("runner time budget exceeded: " + timeoutMs + "ms")), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
  const ok = result?.ok !== false && result?.status !== "failure" && result?.status !== "blocked" && errors.length === 0;
  if (!ok) process.exitCode = 1;
  console.log(JSON.stringify({ ok, result, errors }));
} catch (e) {
  process.exitCode = 1;
  console.log(JSON.stringify({ ok: false, error: String(e?.stack ?? e).slice(0, 2000), failure: e?.result ?? null, errors }));
} finally {
  await browser.close();
}

export {};
