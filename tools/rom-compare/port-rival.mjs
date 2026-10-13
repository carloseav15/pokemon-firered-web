// Port side of the rival-battle comparison (rival.lua is the ROM side): same route, synchronized by events and run in
// real time with the keyboard (ArrowKeys, KeyZ = A). gRngValue is written at the battle-start event with
// setRandomStateForTest, as RV_RNG does in rival.lua.
// Usage: BASE=http://[::1]:5197/ RNG=0x1A2B3C4D OUT=/tmp/port-rival.json node tools/rom-compare/port-rival.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("playwright");
const BASE = process.env.BASE ?? "http://[::1]:5197/";
const RNG = process.env.RNG !== undefined ? Number(process.env.RNG) : null;
const SCENE = 0x4055 - 0x4000;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 720, height: 540 } });
const errs = [];
p.on("pageerror", e => errs.push(String(e)));
p.on("console", m => { if (m.type() === "error") errs.push("console:" + m.text().slice(0, 200)); });
await p.goto(new URL("?fr=new", BASE).href);
await p.waitForFunction(() => !!window.frDebug?.state?.()?.map, undefined, { polling: 200, timeout: 90000 });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const state = () => p.evaluate(() => window.frDebug.state());
const KEY = { UP: "ArrowUp", DOWN: "ArrowDown", LEFT: "ArrowLeft", RIGHT: "ArrowRight", A: "KeyZ" };
const t0 = Date.now(), log = [], dumps = {};
const note = (label, extra = "") => { log.push({ label, ms: Date.now() - t0, extra }); console.log(label, extra); };
async function tapA(ms = 60) { await p.keyboard.down(KEY.A); await sleep(ms); await p.keyboard.up(KEY.A); }
const scene = () => p.evaluate(i => window.frDebug.save.save.vars[i], SCENE);
const inBattle = () => p.evaluate(() => window.frDebug.snapshot().hardware.inBattle);
const dump = tag => p.evaluate(async ({ tag }) => {
  const sv = window.frDebug.save.save, s = window.frDebug.state();
  const { gEnemyParty } = await import("/src/core/pokemon/mon.ts");
  const e = gEnemyParty[0];
  return { tag, st: s, scene: sv.vars[0x55], money: sv.money, flags: sv.flags.slice(), vars: sv.vars.slice(),
    partyCount: sv.party.length, mon0: sv.party[0] ? JSON.parse(JSON.stringify(sv.party[0])) : null,
    enemy0: e && e.species ? JSON.parse(JSON.stringify(e)) : null };
}, { tag });
async function hold(dir, pred, label, timeout = 8000) {
  const t = Date.now();
  await p.keyboard.down(KEY[dir]);
  try {
    while (Date.now() - t < timeout) { const s = await state(); if (pred(s)) { note(label, JSON.stringify(s)); return true; } await sleep(15); }
    note(label + " TIMEOUT", JSON.stringify(await state())); return false;
  } finally { await p.keyboard.up(KEY[dir]); }
}
async function holdUntilMap(dir, target, label, timeout = 12000) {
  const t = Date.now();
  await p.keyboard.down(KEY[dir]);
  try {
    while (Date.now() - t < timeout) { const s = await state(); if (s?.map === target) { note(label, JSON.stringify(s)); return; } await sleep(20); }
    note(label + " TIMEOUT", JSON.stringify(await state()));
  } finally { await p.keyboard.up(KEY[dir]); }
}
async function control(label, timeout = 30000) {
  const t = Date.now(); let quiet = 0;
  while (Date.now() - t < timeout) {
    const s = await state(); quiet = s?.map && s.script === false ? quiet + 1 : 0;
    if (quiet >= 20) { note(label, JSON.stringify(s)); return; }
    await sleep(25);
  }
  note(label + " NO CONTROL", JSON.stringify(await state()));
}
// Opening: room -> town -> Oak -> lab (validated by port-realtime.mjs).
await control("room control");
await hold("RIGHT", s => s.x >= 10, "room right");
await hold("UP", s => s.y <= 2, "room up");
await holdUntilMap("LEFT", "MAP_PALLET_TOWN_PLAYERS_HOUSE_1F", "stairs");
await control("1F control");
await hold("DOWN", s => s.y >= 8, "1F down");
await hold("LEFT", s => s.x <= 4, "1F left");
await holdUntilMap("DOWN", "MAP_PALLET_TOWN", "door");
await control("town control");
await hold("DOWN", s => s.y >= 8, "town down");
await hold("RIGHT", s => s.x >= 12, "town right");
await hold("UP", s => s.script === true, "oak trigger", 12000);
for (let t = Date.now(); Date.now() - t < 300000;) {
  const s = await state();
  if (s.map === "MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB" && s.script === false && s.y <= 4) break;
  await tapA(); await sleep(260);
}
note("lab control", JSON.stringify(await state()));
// From here on the same events as rival.lua.
await hold("DOWN", s => s.y >= 5, "ball: down");
await hold("RIGHT", s => s.x >= 8, "ball: right");
await sleep(500);
await p.keyboard.down(KEY.UP); await sleep(150); await p.keyboard.up(KEY.UP);
await sleep(300);
for (let t = Date.now(); Date.now() - t < 120000;) {
  if (await scene() === 3) break;
  await tapA(); await sleep(260);
}
dumps.starterChosen = await dump("starter-chosen"); note("starter chosen", `scene=${dumps.starterChosen.scene}`);
// 900 frames of A taps after the pick (15 s of game time).
for (let t = Date.now(); Date.now() - t < 15000;) { await tapA(); await sleep(260); }
dumps.afterpick = await dump("afterpick");
// Walk to x=6 and down through the rival trigger row (y=8), tapping A; stop at battle start.
let battleStart = false;
for (let t = Date.now(); Date.now() - t < 120000 && !battleStart;) {
  const s = await state();
  const key = s.x > 6 ? "LEFT" : s.x < 6 ? "RIGHT" : "DOWN";
  await p.keyboard.down(KEY[key]);
  await sleep(40);
  await p.keyboard.up(KEY[key]);
  await tapA(40);
  battleStart = await inBattle();
}
if (battleStart) {
  if (RNG !== null) await p.evaluate(async v => { const m = await import("/src/core/random.ts"); m.setRandomStateForTest(v >>> 0); }, RNG);
  dumps.battleStart = await dump("battle-start"); note("battle start", JSON.stringify(dumps.battleStart.st));
  // FIGHT -> first move until the battle ends.
  for (let t = Date.now(); Date.now() - t < 240000;) {
    if (!(await inBattle())) break;
    await tapA(); await sleep(260);
  }
  dumps.battleEnd = await dump("battle-end"); note("battle end", JSON.stringify(dumps.battleEnd.st));
  let doneAt = null;
  for (let t = Date.now(); Date.now() - t < 120000;) {
    if (await scene() === 4 && doneAt === null) doneAt = Date.now();
    if (doneAt && Date.now() - doneAt >= 15000) break;
    await tapA(); await sleep(260);
  }
  dumps.final = await dump("final"); note("final", `scene=${dumps.final.scene} ${JSON.stringify(dumps.final.st)}`);
} else note("NO BATTLE", JSON.stringify(await state()));
writeFileSync(process.env.OUT ?? "/tmp/port-rival.json", JSON.stringify({ log, dumps, errors: errs, rng: RNG }, null, 1));
console.log("errors", errs.length, errs.slice(0, 3).join(" | "));
await b.close();
