// Real-time keyboard run of the new-game opening (player's room -> town -> Oak -> lab -> starter), no frDebug.run:
// the engine runs on rAF at wall-clock speed and this script only presses keys (ArrowKeys, KeyZ = A) and polls
// frDebug.state(). It validates that the scripted-movement scenes (applymovement/waitmovement) finish in normal play.
// Usage: BASE=http://[::1]:5197/ OUT=/tmp/port-realtime.json node tools/rom-compare/port-realtime.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("playwright");
const BASE = process.env.BASE ?? "http://[::1]:5197/";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 720, height: 540 } });
const errs = [];
p.on("pageerror", e => errs.push(String(e)));
p.on("console", m => { if (m.type() === "error") errs.push("console:" + m.text().slice(0, 200)); });
await p.goto(new URL("?fr=new", BASE).href);
await p.waitForFunction(() => !!window.frDebug?.state?.()?.map, undefined, { polling: 200, timeout: 90000 });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const state = () => p.evaluate(() => window.frDebug.state());
const t0 = Date.now(), log = [];
const note = (label, ok, extra = "") => { log.push({ label, ok, ms: Date.now() - t0, extra }); console.log(ok ? "ok  " : "FAIL", label, extra); return ok; };
const KEY = { UP: "ArrowUp", DOWN: "ArrowDown", LEFT: "ArrowLeft", RIGHT: "ArrowRight", A: "KeyZ" };
async function tapA(ms = 70) { await p.keyboard.down(KEY.A); await sleep(ms); await p.keyboard.up(KEY.A); }
async function hold(dir, pred, label, timeout = 8000) {
  const t = Date.now();
  await p.keyboard.down(KEY[dir]);
  try {
    while (Date.now() - t < timeout) { const s = await state(); if (pred(s)) return note(label, true, JSON.stringify(s)); await sleep(15); }
    return note(label, false, JSON.stringify(await state()));
  } finally { await p.keyboard.up(KEY[dir]); }
}
// Hold a direction until the map changes (stairs/doors need the press to continue into the warp).
async function holdUntilMap(dir, target, label, timeout = 12000) {
  const t = Date.now();
  await p.keyboard.down(KEY[dir]);
  try {
    while (Date.now() - t < timeout) { const s = await state(); if (s?.map === target) return note(label, true, JSON.stringify(s)); await sleep(20); }
    return note(label, false, JSON.stringify(await state()));
  } finally { await p.keyboard.up(KEY[dir]); }
}
async function control(label, timeout = 30000) {
  const t = Date.now(); let quiet = 0;
  while (Date.now() - t < timeout) {
    const s = await state();
    quiet = s?.map && s.script === false ? quiet + 1 : 0;
    if (quiet >= 20) return note(label, true, JSON.stringify(s));
    await sleep(25);
  }
  return note(label, false, JSON.stringify(await state()));
}
// Press A until the predicate holds; reports the longest time the scene sat without any position/map/script change.
async function advance(pred, label, timeout = 300000) {
  const t = Date.now(); let last = "", lastChange = Date.now(), longest = 0, presses = 0;
  while (Date.now() - t < timeout) {
    const s = await state();
    if (pred(s)) return note(label, true, `${Math.round((Date.now() - t) / 1000)}s, ${presses} A, longest quiet ${longest} ms, ${JSON.stringify(s)}`);
    const sig = JSON.stringify([s?.map, s?.x, s?.y, s?.facing, s?.script]);
    if (sig !== last) { longest = Math.max(longest, Date.now() - lastChange); last = sig; lastChange = Date.now(); }
    await tapA(); presses++;
    await sleep(260);
  }
  return note(label, false, JSON.stringify(await state()));
}

await control("room control");
await hold("RIGHT", s => s.x >= 10, "room right");
await hold("UP", s => s.y <= 2, "room up");
await holdUntilMap("LEFT", "MAP_PALLET_TOWN_PLAYERS_HOUSE_1F", "stairs to 1F");
await control("1F control");
await hold("DOWN", s => s.y >= 8, "1F down");
await hold("LEFT", s => s.x <= 4, "1F left");
await holdUntilMap("DOWN", "MAP_PALLET_TOWN", "door to town");
await control("town control");
await hold("DOWN", s => s.y >= 8, "town down");
await hold("RIGHT", s => s.x >= 12, "town right");
// Walking north out of town triggers Oak's scene (Oak appears, leads the player to the lab).
await hold("UP", s => s.script === true, "oak trigger", 12000);
await advance(s => s.map === "MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB" && s.script === false && s.y <= 4, "oak scene -> lab control");
await hold("DOWN", s => s.y >= 5, "lab down");
await hold("RIGHT", s => s.x >= 8, "lab right");
await sleep(500);
await p.keyboard.down(KEY.UP); await sleep(150); await p.keyboard.up(KEY.UP);
// Ball prompt (YES is the default), nickname prompt (declined with B is not needed: A on "NO" is the second option), then rival picks.
{
  const t = Date.now(); let ok = false, presses = 0;
  while (Date.now() - t < 150000) {
    const n = await p.evaluate(() => window.frDebug.save.save.party.length);
    const s = await state();
    if (n > 0 && s.script === false) { await sleep(1500); const s2 = await state(); if (s2.script === false) { ok = true; break; } }
    await tapA(); presses++; await sleep(260);
  }
  note("starter chosen -> control", ok, `${Math.round((Date.now() - t) / 1000)}s, ${presses} A, ${JSON.stringify(await state())}`);
}
await sleep(1500);
const final = await p.evaluate(() => {
  const sv = window.frDebug.save.save, st = window.frDebug.state();
  return { st, party: sv.party.map(m => ({ species: m.species, level: m.level })), flags: sv.flags.slice(), vars: sv.vars.slice() };
});
const hasStarter = final.party.length > 0;
note("starter in party", hasStarter, JSON.stringify(final.party));
note("no page errors", errs.length === 0, errs.slice(0, 4).join(" | "));
writeFileSync(process.env.OUT ?? "/tmp/port-realtime.json", JSON.stringify({ log, final, errors: errs }, null, 1));
await b.close();
process.exitCode = log.every(l => l.ok) ? 0 : 1;
