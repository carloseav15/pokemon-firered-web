// Browser acceptance for phase one. Run against the play server, with artifacts exclusively in /tmp by default.
// Ten fresh contexts, 10,000 recorded/replayed frames each; no story, savestate or audio-parity claim.
import { chromium } from "playwright";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const base = process.env.PW_BASE ?? "http://localhost:5197/";
const frames = Number(process.env.REPLAY_FRAMES ?? 10000), repetitions = Number(process.env.REPLAY_REPETITIONS ?? 10);
if (!Number.isInteger(frames) || frames < 400 || !Number.isInteger(repetitions) || repetitions < 2) throw new Error("Need at least 400 frames and two repetitions");
const out = resolve(process.argv[2] ?? `/tmp/pokemon-replay-${Date.now()}`);
mkdirSync(out, { recursive: true });
const write = (name, value) => writeFileSync(resolve(out, name), JSON.stringify(value, null, 2) + "\n");
function treeDigest(root) {
  const h = createHash("sha256");
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) { h.update(relative(root, path)); h.update("\0"); h.update(readFileSync(path)); h.update("\0"); }
    }
  }
  visit(root); return h.digest("hex");
}
const manifest = { revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  sourceSHA256: treeDigest(resolve("src/fr")), dataSHA256: treeDigest(resolve("public/fr")),
  toolSHA256: createHash("sha256").update(readFileSync("tools/playtest/replay.js")).update(readFileSync("tools/playtest/determinism.mjs")).digest("hex"),
  dirty: !!execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(), frames, repetitions,
  entry: { mode: "new", timer1Low: 12345, bootstrapFrames: 120 },
  prepared: "Direct new-game entry; initial map/help assets preloaded; no full-game/audio/savestate guarantee" };
write("manifest.json", manifest);
const inputs = Array.from({ length: frames }, (_, i) => {
  const phase = i % 1000;
  return phase === 60 ? 8 : phase === 140 ? 2 : phase >= 240 && phase < 256 ? 0x10 : phase >= 320 && phase < 336 ? 0x20 : 0;
});
const browser = await chromium.launch(), runs = [], errors = [];
let reference;
try {
  for (let i = 0; i < repetitions; i++) {
    const context = await browser.newContext(), page = await context.newPage();
    page.on("pageerror", e => errors.push(String(e)));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(new URL("tools/playtest/replay.html", base).href);
    await page.waitForFunction(() => !!window.frReplay, undefined, { polling: 100 });
    await page.evaluate(entry => window.frReplay.launch(entry), manifest.entry);
    const contracts = await page.evaluate(() => {
      const before = JSON.stringify(frDebug.snapshot());
      const copy = frDebug.snapshot(); copy.save.money = -1; copy.random.seed = 0; copy.input.previousRaw = 999;
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyZ" }));
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyZ" }));
      window.dispatchEvent(new Event("blur"));
      frDebug.run(0);
      let rejected = 0;
      for (const [n, b] of [[-1, 0], [1.5, 0], [1, -1], [1, 1024]]) {
        try { frDebug.run(n, b); } catch { rejected++; }
      }
      return { detachedAndIsolated: before === JSON.stringify(frDebug.snapshot()), rejected };
    });
    if (!contracts.detachedAndIsolated || contracts.rejected !== 4) throw new Error("Input/observation contract failed");
    const hold = await page.evaluate(async () => {
      const before = frGame.frameCount;
      await new Promise(r => setTimeout(r, 80));
      return { before, after: frGame.frameCount };
    });
    if (hold.before !== hold.after) throw new Error("Manual session advanced while idle");
    let result;
    if (!reference) {
      reference = await page.evaluate(inputs => window.frReplay.record(inputs), inputs);
      write("reference.replay.json", { ...reference, manifest });
      result = { ok: true, frames: reference.inputs.length, finalHash: reference.hashes.at(-1), observation: reference.observation };
    } else result = await page.evaluate(reference => window.frReplay.play(reference), reference);
    const row = { repetition: i + 1, hold, contracts, ...result };
    runs.push(row);
    write("summary.json", { ok: result.ok && !errors.length, manifest, runs, errors });
    console.log(JSON.stringify({ repetition: i + 1, ok: result.ok, frames: result.frames, reason: result.reason, finalHash: result.finalHash }));
    await context.close();
    if (!result.ok || errors.length) throw new Error(`Replay failed at repetition ${i + 1}: ${result.reason ?? errors.join("; ")}`);
  }
  // Negative acceptance: same reconstructed entry with one altered key must expose the first divergent frame.
  const context = await browser.newContext(), page = await context.newPage();
  await page.goto(new URL("tools/playtest/replay.html", base).href);
  await page.waitForFunction(() => !!window.frReplay, undefined, { polling: 100 });
  await page.evaluate(entry => window.frReplay.launch(entry), manifest.entry);
  const corrupted = { ...reference, inputs: [...reference.inputs] }; corrupted.inputs[0] = 8;
  const negative = await page.evaluate(replay => window.frReplay.play(replay), corrupted);
  if (negative.ok || negative.reason !== "state-divergence" || negative.inputIndex !== 0) throw new Error("Replay did not detect the altered first input");
  write("negative.json", negative);
  await context.close();
  const checks = { alteredInput: { reason: negative.reason, inputIndex: negative.inputIndex, frame: negative.frame } };
  const seedContext = await browser.newContext(), seedPage = await seedContext.newPage();
  await seedPage.goto(new URL("tools/playtest/replay.html", base).href);
  await seedPage.waitForFunction(() => !!window.frReplay, undefined, { polling: 100 });
  await seedPage.evaluate(entry => window.frReplay.launch(entry), { ...manifest.entry, timer1Low: 12346 });
  const wrongSeed = await seedPage.evaluate(replay => window.frReplay.play(replay), reference);
  if (wrongSeed.ok || wrongSeed.reason !== "initial-state-mismatch" || wrongSeed.frame !== reference.startFrame) throw new Error("Different seed was not rejected before advancing");
  checks.wrongSeed = { reason: wrongSeed.reason, frame: wrongSeed.frame };
  await seedContext.close();

  const batchStates = [];
  for (const batch of [true, false]) {
    const context = await browser.newContext(), page = await context.newPage();
    await page.goto(new URL("tools/playtest/replay.html", base).href);
    await page.waitForFunction(() => !!window.frReplay, undefined, { polling: 100 });
    await page.evaluate(entry => window.frReplay.launch(entry), manifest.entry);
    batchStates.push(await page.evaluate(async batch => {
      const start = frGame.frameCount;
      if (batch) frDebug.run(3, 0x10); else for (let i = 0; i < 3; i++) frDebug.run(1, 0x10);
      await frDebug.wait(1);
      await frDebug.wait(5);
      if (frGame.frameCount !== start + 9) throw new Error("run/wait advanced a different number of frames");
      return JSON.stringify(frDebug.snapshot());
    }, batch));
    await context.close();
  }
  if (batchStates[0] !== batchStates[1]) throw new Error("Batch size changed manual simulation");
  checks.batches = { equal: true, frames: 9, includes: "held input; wait(1); wait(5)" };

  const normalContext = await browser.newContext(), normalPage = await normalContext.newPage();
  await normalPage.goto(new URL("?fr=new", base).href);
  await normalPage.waitForFunction(() => !!window.frDebug, undefined, { polling: 100 });
  checks.normal = await normalPage.evaluate(async () => {
    const before = frGame.frameCount;
    await new Promise(r => setTimeout(r, 100));
    return { mode: frDebug.executionMode, before, after: frGame.frameCount };
  });
  if (checks.normal.mode !== "realtime" || checks.normal.after <= checks.normal.before) throw new Error("Normal launch lost its automatic frame loop");
  await normalContext.close();
  write("summary.json", { ok: true, manifest, runs, checks, errors });
  console.log(JSON.stringify({ ok: true, repetitions, framesPerRun: frames, negative: negative.reason, artifacts: out }));
} catch (error) {
  write("summary.json", { ok: false, manifest, runs, errors, error: String(error?.stack ?? error) });
  throw error;
} finally { await browser.close(); }
