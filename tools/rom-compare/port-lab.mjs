// Port side of the player's-room -> starter comparison (docs/ROM-COMPARACION-VIABILIDAD.md, phase 5).
// Same route as the ROM drive (room, 1F, town, Oak, lab, ball), but each step waits on a position/map/script condition
// instead of a frame count. Prints a JSON with flags, vars, party[0], money and position at the settled end state.
// Usage: OUT=/tmp/port-lab.json TIMERS=0x3649,0xbd99 node tools/rom-compare/port-lab.mjs   (vite dev server on BASE)
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("playwright");
const TIMERS = (process.env.TIMERS ?? "0x3649,0xbd99").split(",").map(Number);
const b = await chromium.launch(); const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
p.on("console", m => { if (["error", "warning"].includes(m.type())) errs.push("console:" + m.text()); });
p.on("requestfailed", r => errs.push("requestfailed:" + r.url()));
p.on("response", r => { if (r.status() >= 400) errs.push("http" + r.status() + ":" + r.url()); });
// Manual-frame test session straight into a new game (skips the intro/Oak speech, which port-new-game.mjs covers):
// frames are owned by this harness and map loads are awaited by the engine.
await p.goto(new URL("tools/playtest/replay.html", process.env.BASE ?? "http://localhost:5197/").href);
await p.waitForFunction(() => !!window.frReplay, undefined, { polling: 100, timeout: 60000 });
await p.evaluate(async ({ TIMERS }) => {
  const { launchFireRed } = await import("/src/fr/boot.ts");
  await launchFireRed({ mode: "new", playerName: "AAAAAAA", gender: 0, rivalName: "AAAAAAA", test: { timer1Low: TIMERS[0] } });
  window.__sleep = ms => new Promise(r => setTimeout(r, ms));
}, { TIMERS });
// Phase B: in-game, condition-driven.
const result = await p.evaluate(async () => {
  const dbg = window.frDebug, B = { A: 1, B: 2, START: 8, RIGHT: 0x10, LEFT: 0x20, UP: 0x40, DOWN: 0x80 };
  const st = () => dbg.state();
  const run = (n, m = 0) => dbg.run(n, m);
  const log = [];
  async function hold(key, pred, max, label) {
    for (let f = 0; f < max; f++) {
      if (pred(st())) { run(1, 0); log.push([label, "ok", f]); return true; }
      run(1, B[key]);
      if (f % 4 === 0) await window.__sleep(3);
    }
    log.push([label, "TIMEOUT", max, JSON.stringify(st())]); return false;
  }
  async function warpWith(key, taps, target, max, label) {
    for (let f = 0; f < max; f++) {
      const s = st();
      if (s.map === target) { log.push([label, "ok", f, JSON.stringify(s)]); return true; }
      run(1, f < taps ? B[key] : 0);
      await window.__sleep(f < taps ? 1 : 5);   // let the destination map finish loading in real time
    }
    log.push([label, "TIMEOUT", max, JSON.stringify(st())]); return false;
  }
  async function idle(n) { for (let f = 0; f < n; f++) { run(1, 0); if (f % 4 === 0) await window.__sleep(3); } }
  async function control(label, max = 600) {
    // control = no script running and nothing moving for 20 frames
    let quiet = 0;
    for (let f = 0; f < max; f++) {
      const s = st(); quiet = s && !s.script ? quiet + 1 : 0;
      if (quiet >= 20) { log.push([label, "control", f]); return true; }
      run(1, 0); if (f % 4 === 0) await window.__sleep(3);
    }
    log.push([label, "NO CONTROL", max, JSON.stringify(st())]); return false;
  }
  async function spamA(pred, max, label) {
    let lastMap = st().map;
    for (let f = 0; f < max; f++) {
      const m = st().map;
      if (m !== lastMap) { log.push(["map", f, m]); lastMap = m; await window.__sleep(400); }   // map data loads are async
      if (m === "MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB") { window.__labF = (window.__labF ?? 0) + 1; if (window.__labF % 40 === 1 && window.__labF < 1400) { const sn = dbg.snapshot(); log.push(["lab", window.__labF, JSON.stringify(st()), sn.script.mode, sn.script.native, sn.field.objects.filter(Boolean).length, JSON.stringify(sn.tasks.filter(t=>t.active).map(t=>t.func))]); } }
      if (pred(st())) { log.push([label, "ok", f]); return true; }
      run(1, f % 20 < 3 ? B.A : 0);
      if (f % 4 === 0) await window.__sleep(3);
    }
    log.push([label, "TIMEOUT", max, JSON.stringify(st())]); return false;
  }
  await control("room-control");
  await hold("RIGHT", s => s.x >= 10, 200, "room right");
  await hold("UP", s => s.y <= 2, 200, "room up");
  await warpWith("LEFT", 40, "MAP_PALLET_TOWN_PLAYERS_HOUSE_1F", 3000, "stairs");
  await control("1F control");
  await hold("DOWN", s => s.y >= 8, 200, "1F down");
  await hold("LEFT", s => s.x <= 4, 200, "1F left");
  await warpWith("DOWN", 40, "MAP_PALLET_TOWN", 3000, "door");
  await control("town control");
  await hold("DOWN", s => s.y >= 8, 60, "town down");
  await hold("RIGHT", s => s.x >= 12, 200, "town right");
  await hold("UP", s => s.script === true, 400, "oak trigger");
  await spamA(s => s.map === "MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB" && s.x === 6 && s.y <= 4 && s.script === false, 9000, "to lab table");
  { const sn = dbg.snapshot(), rc = n => dbg.rom.c(n), v = n => { try { return dbg.save.save.vars[rc(n) - 0x4000]; } catch { return "n/a"; } };
    log.push(["lab-state", JSON.stringify({ st: st(), script: sn.script.mode, entry: sn.script.entry, native: sn.script.native,
      tasks: sn.tasks.filter(t => t.active).map(t => t.func), hw: sn.hardware.callback2,
      sceneVar: v("VAR_MAP_SCENE_PALLET_TOWN_PROFESSOR_OAKS_LAB"),
      objs: sn.field.objects.filter(Boolean).map(o => [o.localId, o.currentCoords.x - 7, o.currentCoords.y - 7, o.invisible]) })]); }
  await window.__sleep(10);
  window.__shotLab = document.querySelector("canvas").toDataURL("image/png");
  await control("lab control", 400);
  await hold("DOWN", s => s.y >= 5, 60, "lab down");
  await hold("RIGHT", s => s.x >= 8, 100, "lab right");
  await idle(24);                       // let the last step finish before turning
  run(10, B.UP); await idle(10);        // face the ball (blocked: only turns)
  // ball prompt + YES, then keep pressing A until the party has the starter and the state settles
  const snap = () => JSON.stringify({ f: dbg.save.save.flags, v: dbg.save.save.vars, p: dbg.save.save.party.length });
  let last = snap(), stable = 0;
  for (let f = 0; f < 9000 && stable < 900; f++) {
    run(1, f % 20 < 3 ? B.A : 0);
    const cur = snap(); stable = cur === last ? stable + 1 : 0; last = cur;
    await window.__sleep(8);   // fanfares and fades are wall-clock based in the audio engine: pace like the game
  }
  log.push(["settled", stable]);
  { const sn = dbg.snapshot(); window.__shotEnd = document.querySelector("canvas").toDataURL("image/png");
    log.push(["end-state", JSON.stringify({ st: st(), script: sn.script.mode, native: sn.script.native, entry: sn.script.entry, party: sn.save.party.length,
      objs: sn.field.objects.filter(Boolean).map(o => [o.localId, o.currentCoords.x - 7, o.currentCoords.y - 7, o.invisible, o.facingDirection]) })]); }
  const sv = dbg.save.save;
  return { log, state: st(), flags: sv.flags, vars: sv.vars, party: sv.party.map(m => JSON.parse(JSON.stringify(m))),
    money: sv.money, trainerId: sv.trainerId, name: sv.playerName };
});
const shotEnd = await p.evaluate(() => window.__shotEnd);
if (shotEnd) writeFileSync("/tmp/port-lab-final.png", Buffer.from(shotEnd.split(",")[1], "base64"));
const shot = await p.evaluate(() => window.__shotLab);
if (shot) writeFileSync("/tmp/port-lab-end.png", Buffer.from(shot.split(",")[1], "base64"));
writeFileSync(process.env.OUT ?? "/tmp/port-lab.json", JSON.stringify(result, null, 1));
console.log("log:"); for (const l of result.log) console.log(" ", JSON.stringify(l));
console.log("state", JSON.stringify(result.state), "party", result.party.length, "errors", errs.length); for (const e of errs.slice(0, 8)) console.log("  ERR", e.slice(0, 200));
await b.close();
