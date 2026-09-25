// Browser playtest driver for window.frDebug (dev server only).
// Load from the devtools console or a browser tool:
//   const { H } = await import("/tools/playtest/driver.js");
// Coordinates are the ones frDebug.state() reports (map coords, without the +7 border).
// Never walk while a script runs applymovement/waitmovement: goto()/path() only
// move when no script is active and controls are unlocked; idle() only taps A.
// Call `await H.init()` after every page load (see AGENTS.md §6.5).

const g = () => window.frGame;
const dbg = () => window.frDebug;
const DIRS = [[0, 1, 1, 0x80, "D"], [0, -1, 2, 0x40, "U"], [-1, 0, 3, 0x20, "L"], [1, 0, 4, 0x10, "R"]];
const COLLISION_NONE = 0, COLLISION_OBJECT_EVENT = 4, COLLISION_LEDGE_JUMP = 6;

export const H = {
  log: [],
  st() {
    const game = g();
    return { ...dbg().state(), locked: game.overworld.controlsLocked, scene: game.scene?.constructor?.name, party: this.party() };
  },
  party() {
    return dbg().save.save.party.map((p) => `${p.species}:L${p.level}:${p.hp}/${p.stats?.[0]}`).join(",");
  },
  /**
   * Import a module as the running app sees it. After an HMR update the app
   * imports "x.ts?t=…"; a plain import("/src/…/x.ts") would load a second,
   * empty instance and every read would be wrong.
   */
  async mod(path) {
    const hits = performance.getEntriesByType("resource").map((r) => r.name).filter((n) => n.includes(path + "?") || n.endsWith(path));
    return import(hits.length ? hits[hits.length - 1] : path);
  },
  /** Cache gMain and the battle globals; call once after each page load. */
  async init() {
    this.R = await this.mod("/src/fr/hw/runtime.ts");
    this.G = await this.mod("/src/fr/battle/globals.ts");
    return { cb2: this.R.gMain.callback2?.name };
  },
  cb2() { return this.R?.gMain.callback2?.name; },
  inBattle() {
    const name = g().scene?.constructor?.name;
    if (name === "BattleTransitionScene") return true;
    if (name !== "HwScene") return false;
    // Without init() any hardware screen (shop, bag) looks like a battle.
    if (!this.R) return true;
    return this.R.gMain.callback1?.name === "BattleMainCB1" || /Battle/.test(this.cb2() ?? "");
  },
  /**
   * Long work inside the page: tool calls time out (~45 s) but the page keeps
   * running. Start with H.job(async () => …), then poll H.jobStatus().
   */
  job(fn) {
    this.jobState = { done: false, out: null, t0: performance.now() };
    const st = this.jobState;
    (async () => {
      try { st.out = await fn(); } catch (e) { st.out = "ERR " + (e?.stack ?? e); }
      st.done = true;
    })();
    return "started";
  },
  jobStatus() { return { ...this.jobState, s: Math.round((performance.now() - (this.jobState?.t0 ?? 0)) / 1000), st: this.st() }; },
  warps() { return g().overworld.loaded.header.warps.map((w) => [w.x, w.y, w.destMap]); },
  coords() { return g().overworld.loaded.header.coords.map((c) => [c.x, c.y, c.scriptName]); },
  objects() {
    return g().overworld.objects.objects.filter((o) => o && o.currentCoords)
      .map((o) => [o.localId, o.currentCoords.x - 7, o.currentCoords.y - 7, o.graphicsId, o.invisible]);
  },
  /** Run frames tapping A until no script runs and controls are free. */
  async idle(max = 3000, tapA = true) {
    for (let f = 0; f < max; f += 20) {
      const s = this.st();
      // A trainer script can start a battle: hand it back to goto()/battle().
      if (this.inBattle()) return { ...s, f, battle: true };
      if (!s.script && !s.locked && f > 40) return { ...s, f };
      await dbg().wait(16);
      if (tapA) await dbg().wait(4, 1);
    }
    return { ...this.st(), timeout: true };
  },
  /**
   * Finish the current battle with real button presses.
   * mode "fight": FIGHT, then the move in `slot` (0 TL, 1 TR, 2 BL, 3 BR);
   * mode "run": RUN. With init() the cursor positions are read from
   * gActionSelectionCursor/gMoveSelectionCursor, so presses are never blind;
   * other screens (text, learn-move prompt, summary) get A.
   */
  async battle(mode = "fight", slot = 0, maxSteps = 4000) {
    const start = this.party();
    const screens = new Set();
    let n = 0;
    const press = async (bits) => { await dbg().wait(2, bits); await dbg().wait(4); };
    while (this.inBattle() && n < maxSteps) {
      n++;
      screens.add(this.cb2());
      const f = this.G?.gBattlerControllerFuncs[0]?.name;
      if (f === "HandleInputChooseAction") {
        const want = mode === "run" ? 3 : 0, c = this.G.gActionSelectionCursor[0];
        if (c !== want) { await press((c & 1) < (want & 1) ? 0x10 : (c & 1) > (want & 1) ? 0x20 : (c >> 1) < (want >> 1) ? 0x80 : 0x40); continue; }
        await dbg().press("A");
        continue;
      }
      if (f === "HandleInputChooseMove") {
        const c = this.G.gMoveSelectionCursor[0];
        // With 0 PP the C prints "There's no PP left…" and returns to move
        // selection: pick another slot with PP, or it loops forever.
        const pp = this.G.gBattleMons?.[0]?.pp;
        let want = slot;
        if (pp && pp[want] === 0) for (let i = 0; i < 4; i++) if (pp[i] > 0) { want = i; break; }
        if (c !== want) { await press((c & 1) < (want & 1) ? 0x10 : (c & 1) > (want & 1) ? 0x20 : (c >> 1) < (want >> 1) ? 0x80 : 0x40); continue; }
        await dbg().press("A");
        continue;
      }
      await dbg().press("A", 8);
    }
    const stuck = n >= maxSteps && this.inBattle();
    await dbg().wait(30);
    const r = { battle: mode, slot, n, start, end: this.party(), outcome: g().battleOutcome, map: dbg().state().map, stuck, screens: [...screens].filter(Boolean) };
    this.log.push(r);
    return r;
  },
  /** Heal inside a Pokémon Center 1F (nurse counter at 7,2) and walk back to the door mat. */
  async heal() {
    await this.counter(7, 2);
    await this.idle(4000);
    await this.goto(7, 7);
    return this.exit("D", 3);
  },
  /**
   * Walk back and forth over two tiles (e.g. tall grass) fighting with move
   * `slot` until the lead reaches `level` or drops below `minHp` of max HP.
   */
  async grind(a, b, { slot = 0, level = 100, minHp = 0.4, loops = 30 } = {}) {
    const lead = () => dbg().save.save.party[0];
    for (let i = 0; i < loops; i++) {
      if (lead().level >= level) return { stop: "level", party: this.party() };
      if (lead().hp < lead().stats[0] * minHp) return { stop: "lowhp", party: this.party() };
      const saved = this.battleDefaults;
      this.battleDefaults = { mode: "fight", slot };
      await this.goto(...a);
      await this.goto(...b);
      this.battleDefaults = saved;
    }
    return { stop: "loops", party: this.party() };
  },
  battleDefaults: { mode: "fight", slot: 0 },
  /** Shortest path in map-internal coords (+7), using the live collision checks. */
  bfs(tx, ty) {
    const ow = g().overworld, player = ow.player.object, objects = ow.objects;
    const sx = player.currentCoords.x, sy = player.currentCoords.y;
    const key = (x, y) => `${x},${y}`;
    const prev = new Map([[key(sx, sy), null]]);
    const queue = [[sx, sy]];
    while (queue.length) {
      const [x, y] = queue.shift();
      if (x === tx && y === ty) break;
      for (const [dx, dy, dir, , name] of DIRS) {
        let nx = x + dx, ny = y + dy;
        const c = objects.collisionAt(player, nx, ny, dir);
        if (c === COLLISION_LEDGE_JUMP) { nx += dx; ny += dy; }
        else if (c !== COLLISION_NONE && !(nx === tx && ny === ty && c === COLLISION_OBJECT_EVENT)) continue;
        const k = key(nx, ny);
        if (prev.has(k)) continue;
        prev.set(k, [x, y, name]);
        queue.push([nx, ny]);
      }
    }
    if (!prev.has(key(tx, ty))) return null;
    const steps = [];
    for (let cur = [tx, ty]; ;) {
      const p = prev.get(key(cur[0], cur[1]));
      if (!p) break;
      steps.unshift(p[2]);
      cur = [p[0], p[1]];
    }
    return steps;
  },
  /** Walk to (x, y) on the current map, replanning every step and resolving battles/scripts. */
  async goto(x, y, opts = {}) {
    const mode = opts.battle ?? this.battleDefaults.mode;
    const slot = opts.slot ?? this.battleDefaults.slot;
    const map0 = dbg().state().map;
    for (let guard = 0; guard < 500; guard++) {
      if (this.inBattle()) { await this.battle(mode, slot); continue; }
      const s = this.st();
      if (s.map !== map0) return { ...s, note: "map changed" };
      if (s.script || s.locked) {
        const r = await this.idle(opts.idle ?? 4000);
        if (r.timeout) return { ...r, note: "script stuck" };
        continue;
      }
      if (s.x === x && s.y === y) return s;
      const steps = this.bfs(x + 7, y + 7);
      if (!steps) return { ...s, note: "no path" };
      if (!steps.length) return s;
      await dbg().walk(steps[0], 1);
    }
    return { ...this.st(), note: "guard" };
  },
  /** Walk one direction until the map changes (connections, door/arrow warps). */
  async exit(dir, maxTiles = 4) {
    const map0 = dbg().state().map;
    for (let i = 0; i < maxTiles; i++) {
      await dbg().walk(dir, 1);
      for (let t = 0; t < 60; t++) {
        const s = this.st();
        if (s.map !== map0 && !s.locked) return s;
        if (s.map === map0 && !s.locked && !s.script && t > 2) break;
        await dbg().wait(30);
      }
    }
    return { ...this.st(), note: "no exit" };
  },
  /** Stand below a door warp at (x, y) and step in. */
  async enter(x, y, from = "D") {
    const [dx, dy] = { D: [0, 1], U: [0, -1], L: [-1, 0], R: [1, 0] }[from];
    const r = await this.goto(x + dx, y + dy);
    if (r.note) return r;
    return this.exit({ D: "U", U: "D", L: "R", R: "L" }[from], 1);
  },
  /** Face a direction without moving (tap). */
  async face(dir) {
    const bits = { R: 0x10, L: 0x20, U: 0x40, D: 0x80 }[dir];
    const facing = { D: 1, U: 2, L: 3, R: 4 }[dir];
    const object = () => g().overworld.player.object;
    // Hold only until the turn registers so the player does not also step.
    for (let f = 0; f < 16 && object().facingDirection !== facing; f++) dbg().run(1, bits);
    await dbg().wait(12);
  },
  /** Talk across a counter: stand two tiles below (x, y), face up, press A. */
  async counter(x, y) {
    const r = await this.goto(x, y + 2);
    if (r.note) return r;
    await this.face("U");
    await dbg().press("A");
    return this.st();
  },
  /** Walk next to an object/tile, face it and press A. */
  async talk(x, y) {
    // Prefer standing below the target (facing up), as most counters/NPCs expect.
    for (const [name, ox, oy] of [["U", 0, 1], ["L", 1, 0], ["R", -1, 0], ["D", 0, -1]]) {
      if (this.bfs(x + ox + 7, y + oy + 7) === null) continue;
      const r = await this.goto(x + ox, y + oy);
      if (!r.note && r.x === x + ox && r.y === y + oy) {
        await this.face(name);
        await dbg().press("A");
        return this.st();
      }
    }
    return { ...this.st(), note: "cannot reach" };
  },
  /**
   * Debug checkpoint: Game.writeSave() plus a named copy in localStorage.
   * Not the in-game SAVE flow (test that separately through the start menu).
   */
  checkpoint(name) {
    g().writeSave();
    localStorage.setItem(`fr-playtest-cp:${name}`, localStorage.getItem(SAVE_KEY));
    return name;
  },
  /** Restore a checkpoint into the save slot; then load `?fr=continue`. */
  restore(name) {
    const data = localStorage.getItem(`fr-playtest-cp:${name}`);
    if (!data) throw new Error(`no checkpoint ${name}`);
    localStorage.setItem(SAVE_KEY, data);
    location.href = `${location.pathname}?fr=continue`;
  },
  checkpoints() {
    return Object.keys(localStorage).filter((k) => k.startsWith("fr-playtest-cp:")).map((k) => k.slice(15));
  },
};
const SAVE_KEY = "pokemon-gba-web-lab.firered.v2";
window.H = H;
