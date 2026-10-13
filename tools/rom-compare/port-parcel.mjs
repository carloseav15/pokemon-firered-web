// Port side of the Route 1 -> Viridian City -> Poke Mart (Oak's Parcel) comparison (parcel.lua is the ROM side).
// Plays the opening and the rival battle as port-rival.mjs, then walks lab -> Pallet Town -> Route 1 -> Viridian ->
// Mart in real time with the keyboard, planning with the driver's BFS and a constant gRngValue and wild-encounter rng (no wild battles),
// and writes the tile trace for parcel.lua plus the flags/vars at every map change and at the end.
// Usage: BASE=http://[::1]:5197/ OUT=/tmp/port-parcel.json TRACE=/tmp/port-parcel-trace.lua node tools/rom-compare/port-parcel.mjs
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
  const { gEnemyParty } = await import("/src/fr/pokemon/mon.ts");
  const e = gEnemyParty[0];
  return { tag, st: s, scene: sv.vars[0x55], money: sv.money, flags: sv.flags.slice(), vars: sv.vars.slice(),
    partyCount: sv.party.length, mon0: sv.party[0] ? JSON.parse(JSON.stringify(sv.party[0])) : null,
    bag: JSON.parse(JSON.stringify(sv.bag)),
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

// ---- Rival battle (same events as port-rival.mjs) ----
if (!battleStart) { note("NO BATTLE", JSON.stringify(await state())); process.exit(1); }
if (RNG !== null) await p.evaluate(async v => { const m = await import("/src/fr/random.ts"); m.setRandomStateForTest(v >>> 0); }, RNG);
for (let t = Date.now(); Date.now() - t < 240000;) { if (!(await inBattle())) break; await tapA(); await sleep(260); }
let doneAt = null;
for (let t = Date.now(); Date.now() - t < 120000;) {
  if (await scene() === 4 && doneAt === null) doneAt = Date.now();
  if (doneAt && Date.now() - doneAt >= 15000) break;
  await tapA(); await sleep(260);
}
note("rival battle done", JSON.stringify(await state()));
// ---- Route to the Mart ----
const mapNum = JSON.parse(await p.evaluate(() => JSON.stringify(window.frDebug.rom.constants)));
const trace = [];
const mapId = m => mapNum[m];
const mapDumps = [], mapCount = {};
let lastMap = (await state()).map;
async function record(dir) {
  const s = await state();
  trace.push({ num: mapId(s.map), x: s.x, y: s.y, dir: dir ?? null, script: s.script === true, t: Date.now() });
  if (s.map !== lastMap) {
    mapCount[s.map] = (mapCount[s.map] ?? 0) + 1;
    mapDumps.push(await dump(`map:${s.map}#${mapCount[s.map]}`)); lastMap = s.map; note("map", s.map);
  }
}
await p.evaluate(async () => {
  const { H } = await import("/tools/playtest/driver.js");
  window.H = H; await H.init();
  // The first tiles of Route 1 are tall grass (the connection from Pallet Town is a grass strip), so wild battles
  // cannot be avoided by planning. Instead gRngValue is rewritten before every frame, here and in parcel.lua, to a
  // value whose next ten LCG outputs are all >= 900 mod 1600: the encounter roll (rate 25*16 = 400) never succeeds.
  const { setRandomStateForTest } = await import("/src/fr/random.ts");
  // The wild-encounter rng (WildEncounterRandom, sWildEncounterData.rngState) is a separate LCG: pinned the same way
  // (ROM address 0x020386d0, found by differential scan), to a value whose first output is >= 1000 mod 1600.
  const { sWildEncounterData } = await import("/src/fr/field/wildEncounter.ts");
  const game = window.frGame, frame = game.frame.bind(game);
  game.frame = () => { setRandomStateForTest(0x1B5BD042); sWildEncounterData.rngState = 0x8B529B4A; frame(); };
});
const bfs = (x, y) => p.evaluate(([x, y]) => window.H.bfs(x + 7, y + 7), [x, y]);
const free = () => p.evaluate(() => window.H.observe().fieldFree);
async function settle(maxMs = 120000) {
  const t = Date.now();
  while (Date.now() - t < maxMs) {
    if (await free()) return true;
    await record(null);
    await tapA(); await sleep(260);
  }
  return false;
}
async function stepDir(dir) {
  const before = await state();
  await record(dir);
  await p.keyboard.down(KEY[{ U: "UP", D: "DOWN", L: "LEFT", R: "RIGHT" }[dir]]);
  const t = Date.now();
  try {
    while (Date.now() - t < 3000) {
      const s = await state();
      if (s.x !== before.x || s.y !== before.y || s.map !== before.map || s.script) break;
      await sleep(8);
    }
  } finally { await p.keyboard.up(KEY[{ U: "UP", D: "DOWN", L: "LEFT", R: "RIGHT" }[dir]]); }
  for (let i = 0; i < 400 && !(await free()); i++) { await record(null); await sleep(20); if ((await state()).script) await settle(); }
  await record(null);
}
async function gotoTile(tx, ty, guard = 400) {
  for (let i = 0; i < guard; i++) {
    const s = await state();
    if (s.x === tx && s.y === ty) return true;
    if (!(await free())) { await settle(); continue; }
    const steps = await bfs(tx, ty);
    if (!steps || !steps.length) { note("no path", `${tx},${ty} from ${JSON.stringify(s)}`); return false; }
    await stepDir(steps[0]);
  }
  return false;
}
async function leaveMap(target, dir, xs) {
  // Try the border tiles in order: the first one whose neighbour across the connection is walkable (not grass,
  // not a tree) changes the map.
  const from = (await state()).map;
  for (const [tx, ty] of xs) {
    if (!(await bfs(tx, ty))) continue;
    if (!(await gotoTile(tx, ty))) continue;
    await stepDir(dir); await settle();
    if ((await state()).map !== from) break;
  }
  const s = await state();
  note("left " + from, JSON.stringify(s));
  return s.map === target;
}
await record(null);
// Lab -> Pallet Town: the door warp at (6,12).
await gotoTile(6, 12);
for (let i = 0; i < 5 && (await state()).map === "MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB"; i++) { await stepDir("D"); await settle(); }
note("in town", JSON.stringify(await state()));
// Pallet Town -> Route 1 (north connection): any reachable tile of the top row.
const top = Array.from({ length: 24 }, (_, x) => [x, 0]).sort((a, b) => Math.abs(a[0] - 11) - Math.abs(b[0] - 11));
await leaveMap("MAP_ROUTE1", "U", top);
const w1 = await p.evaluate(() => window.frGame.overworld.loaded.layout.width);
const top1 = Array.from({ length: w1 }, (_, x) => [x, 0]).sort((a, b) => Math.abs(a[0] - 11) - Math.abs(b[0] - 11));
await leaveMap("MAP_VIRIDIAN_CITY", "U", top1);
// Viridian City -> Poke Mart door.
const door = await p.evaluate(() => window.H.warps().find(w => /VIRIDIAN_CITY_MART/.test(w[2])));
note("mart door", JSON.stringify(door));
// A door tile is impassable: stand below it and press UP (field_control_avatar.c TryDoorWarp).
await gotoTile(door[0], door[1] + 1);
for (let i = 0; i < 5 && (await state()).map === "MAP_VIRIDIAN_CITY"; i++) { await stepDir("U"); await settle(); }
// Parcel scene: A until the scene variable reaches 1 and the field is free.
for (let t = Date.now(); Date.now() - t < 180000;) {
  const v = await p.evaluate(() => window.frDebug.save.save.vars[0x57]);
  if (v === 1 && await free()) break;
  await record(null); await tapA(); await sleep(260);
}
await sleep(5000);
const parcelDump = await dump("parcel");
note("parcel", JSON.stringify(parcelDump.st) + " scene=" + parcelDump.vars[0x57]);
// ---- Back to the lab: Mart -> Viridian -> Route 1 -> Pallet Town -> Oak (Pokedex scene) ----
// The three mat tiles are warp events but only the middle one has an arrow-warp behavior: try them in order.
for (const w of (await p.evaluate(() => window.H.warps()))) {
  if ((await state()).map !== "MAP_VIRIDIAN_CITY_MART") break;
  if (!(await gotoTile(w[0], w[1]))) continue;
  for (let i = 0; i < 2 && (await state()).map === "MAP_VIRIDIAN_CITY_MART"; i++) { await stepDir("D"); await settle(); }
}
const wv = await p.evaluate(() => window.frGame.overworld.loaded.layout.width);
const hv = await p.evaluate(() => window.frGame.overworld.loaded.layout.height);
const bottom = (w, h) => Array.from({ length: w }, (_, x) => [x, h - 1]).sort((a, b) => Math.abs(a[0] - 23) - Math.abs(b[0] - 23));
await leaveMap("MAP_ROUTE1", "D", bottom(wv, hv));
const wr = await p.evaluate(() => window.frGame.overworld.loaded.layout.width);
const hr = await p.evaluate(() => window.frGame.overworld.loaded.layout.height);
await leaveMap("MAP_PALLET_TOWN", "D", bottom(wr, hr).sort((a, b) => Math.abs(a[0] - 12) - Math.abs(b[0] - 12)));
const labDoor = await p.evaluate(() => window.H.warps().find(w => /OAKS_LAB/.test(w[2])));
note("lab door", JSON.stringify(labDoor));
await gotoTile(labDoor[0], labDoor[1] + 1);
for (let i = 0; i < 5 && (await state()).map === "MAP_PALLET_TOWN"; i++) { await stepDir("U"); await settle(); }
await settle();
await gotoTile(6, 4);                       // Oak stands at (6,3): face him and talk
await stepDir("U"); await settle();
for (let t = Date.now(); Date.now() - t < 240000;) {
  const v = await p.evaluate(() => window.frDebug.save.save.vars[0x55]);
  if (v === 6 && await free()) break;
  await record(null); await tapA(); await sleep(260);
}
await sleep(10000);
const end = await dump("end");
note("end", JSON.stringify(end.st) + " lab scene=" + end.vars[0x55]);
// ---- Route 2: lab -> Pallet Town -> Route 1 -> Viridian (old man's catching tutorial) -> Route 2 -> forest gate ----
if (process.env.ROUTE2 !== "0") {
  for (const w of (await p.evaluate(() => window.H.warps()))) {
    if ((await state()).map !== "MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB") break;
    if (!(await gotoTile(w[0], w[1]))) continue;
    for (let i = 0; i < 2 && (await state()).map === "MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB"; i++) { await stepDir("D"); await settle(); }
  }
  const topOf = async (cx) => {
    const w = await p.evaluate(() => window.frGame.overworld.loaded.layout.width);
    return Array.from({ length: w }, (_, x) => [x, 0]).sort((a, b) => Math.abs(a[0] - cx) - Math.abs(b[0] - cx));
  };
  await leaveMap("MAP_ROUTE1", "U", await topOf(12));
  await leaveMap("MAP_VIRIDIAN_CITY", "U", await topOf(12));
  // The old man's tutorial triggers at (20,8)/(22,8) while VAR_MAP_SCENE_VIRIDIAN_CITY_OLD_MAN = 1: it starts a scripted battle.
  await leaveMap("MAP_ROUTE2", "U", await topOf(20));
  const gate = await p.evaluate(() => window.H.warps().find(w => /VIRIDIAN_FOREST_SOUTH_ENTRANCE/.test(w[2])));
  note("forest gate", JSON.stringify(gate));
  await gotoTile(gate[0], gate[1] + 1);
  for (let i = 0; i < 5 && (await state()).map === "MAP_ROUTE2"; i++) { await stepDir("U"); await settle(); }
  await settle();
  await sleep(5000);
  var route2End = await dump("route2");
  note("route2", JSON.stringify(route2End.st));
}
// ---- Viridian Forest -> Pewter City (FOREST=1; draft: the ROM side compares through PV_ENDMAP / PV_ENDTAG) ----
// Trainer battles and wild encounters (rng pinned above) are played by A taps inside settle(); a whiteout ends the walk.
if (process.env.FOREST === "1" && route2End) {
  const whiteout = async () => /PALLET_TOWN|VIRIDIAN_CITY_POKEMON_CENTER/.test((await state()).map);
  // Take the first warp whose destination matches `re`: walk onto it (arrow/mat tiles) or, when the tile is
  // impassable (doors), stand next to it and press toward it; then try each direction until the map changes.
  const takeWarp = async (re, label) => {
    const from = (await state()).map;
    const ws = (await p.evaluate(() => window.H.warps())).filter(w => re.test(w[2]));
    for (const w of ws) {
      if (await bfs(w[0], w[1])) {
        await gotoTile(w[0], w[1]);
        for (const d of ["D", "U", "L", "R"]) {
          if ((await state()).map !== from) break;
          await stepDir(d); await settle();
          if ((await state()).map === from) await gotoTile(w[0], w[1]);
        }
      } else {
        for (const [dx, dy, d] of [[0, 1, "U"], [0, -1, "D"], [1, 0, "L"], [-1, 0, "R"]]) {
          if (!(await bfs(w[0] + dx, w[1] + dy)) || !(await gotoTile(w[0] + dx, w[1] + dy))) continue;
          for (let i = 0; i < 3 && (await state()).map === from; i++) { await stepDir(d); await settle(); }
          if ((await state()).map !== from) break;
        }
      }
      if ((await state()).map !== from) break;
    }
    note(label, JSON.stringify(await state()));
    return (await state()).map !== from;
  };
  const ok = await takeWarp(/^MAP_VIRIDIAN_FOREST$/, "enter forest")
    && await takeWarp(/ROUTE2_VIRIDIAN_FOREST_NORTH_ENTRANCE$/, "forest north exit")
    && await takeWarp(/^MAP_ROUTE2$/, "gate north exit");
  if (ok && !(await whiteout())) {
    const w2 = await p.evaluate(() => window.frGame.overworld.loaded.layout.width);
    const top2 = Array.from({ length: w2 }, (_, x) => [x, 0]).sort((a, b) => Math.abs(a[0] - 6) - Math.abs(b[0] - 6));
    await leaveMap("MAP_PEWTER_CITY", "U", top2);
    await settle(); await sleep(5000);
    var pewterEnd = await dump("pewter");
    note("pewter", JSON.stringify(pewterEnd.st));
  } else note("forest walk ended", JSON.stringify(await state()) + (await whiteout() ? " (whiteout)" : ""));
}
// One entry per visited tile: the last direction pressed there and whether a script ran there.
const tiles = [];
for (let i = 0; i < trace.length; i++) {
  const t = trace[i], last = tiles[tiles.length - 1];
  // Wall-clock milliseconds this tile spent with a script running (until the next sample, capped at 1 s).
  const ms = t.script && trace[i + 1] ? Math.min(1000, trace[i + 1].t - t.t) : 0;
  if (last && last.num === t.num && last.x === t.x && last.y === t.y) { last.dir = t.dir ?? last.dir; last.script = last.script || t.script; last.ms += ms; }
  else tiles.push({ ...t, ms });
}
writeFileSync(process.env.TRACE ?? "/tmp/port-parcel-trace.lua",
  "PARCEL_TRACE = {\n" + tiles.map(t => { const g = t.num >> 8, n = t.num & 255; return `{${g},${n},${t.x},${t.y},${t.dir ? `"${t.dir}"` : "nil"},${t.script},${Math.ceil(t.ms * 0.06 * 1.3) + 180}},`; }).join("\n") + "\n}\n");
writeFileSync(process.env.OUT ?? "/tmp/port-parcel.json", JSON.stringify({ log, mapDumps, parcel: parcelDump, end, route2: typeof route2End === "undefined" ? null : route2End, pewter: typeof pewterEnd === "undefined" ? null : pewterEnd, errors: errs, traceLength: tiles.length }, null, 1));
console.log("trace", trace.length, "errors", errs.length, errs.slice(0, 3).join(" | "));
await b.close();
