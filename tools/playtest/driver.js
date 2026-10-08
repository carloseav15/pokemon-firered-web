// Browser playtest driver for window.frDebug (dev server only).
// Load from the devtools console or a browser tool:
//   const { H } = await import("/tools/playtest/driver.js");
// Coordinates are the ones frDebug.state() reports (map coords, without the +7 border).
// Never walk while a script runs applymovement/waitmovement: goto()/path() only
// move when no script is active and controls are unlocked; idle() stops at choices.
// Call `await H.init()` after every page load (see AGENTS.md §6.5).

import { rankMoves, simulateBattle } from "./strategy.js";
import { recognize, CATALOG } from "./driver/screens.js";
import { Policy } from "./driver/policy.js";
import { drive, input as pressChecked, DriverStop } from "./driver/loop.js";
import { battleItemMenu } from "./driver/handlers/menus.js";

const g = () => window.frGame;
const dbg = () => window.frDebug;
const DIRS = [[0, 1, 1, 0x80, "D"], [0, -1, 2, 0x40, "U"], [-1, 0, 3, 0x20, "L"], [1, 0, 4, 0x10, "R"]];
const COLLISION_NONE = 0, COLLISION_OBJECT_EVENT = 4;

export const H = {
  log: [],
  st() {
    const game = g();
    return { ...dbg()?.state?.(), locked: game?.overworld.controlsLocked, scene: game?.scene?.constructor?.name, party: this.party() };
  },
  party() {
    return (dbg()?.save?.save?.party ?? []).map((p) => `${p.species}:L${p.level}:${p.hp}/${p.stats?.[0]}`).join(",");
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
    this.PM = await this.mod("/src/fr/partyMenu.ts");
    this.C = await this.mod("/src/fr/generated/constants.ts");
    this.rom = (await this.mod("/src/fr/rom.ts")).rom;
    this.T = await this.mod("/src/fr/gba/tasks.ts");
    this.B = await this.mod("/src/fr/bagMenu.ts");
    this.BS = await this.mod("/src/fr/battle/bscript.ts");
    this.Q = await this.mod("/src/fr/questLogState.ts");
    this.SC = await this.mod("/src/fr/script/context.ts");
    this.SUM = await this.mod("/src/fr/pokemonSummaryScreen.ts");
    this.MON = await this.mod("/src/fr/pokemon/mon.ts");
    this.CMDS = await this.mod("/src/fr/battle/cmds/index.ts");
    this.MENU = await this.mod("/src/fr/hw/menu.ts");
    this.LM = await this.mod("/src/fr/hw/listMenu.ts");
    this.TXT = await this.mod("/src/fr/hw/text.ts");
    this.PSA = await this.mod("/src/fr/pokemonSpecialAnim.ts");
    return this.observe();
  },
  /** { screen, details, raw }: the catalog name of what the player sees (driver/screens.js). */
  recognize() { return recognize(this); },
  catalog: CATALOG,
  /**
   * Record recognize() on every commanded frame while on. Turning it off returns
   * { screens: {name: {count, first}}, unknown, mismatch }: "unknown" is the first unnamed state's dump and "mismatch"
   * counts frames where field-free disagrees with the legacy fieldFree().
   */
  trackScreens(on) {
    if (on) { this.tracking = { screens: {}, unknown: null, mismatch: 0, mismatchSample: null }; return true; }
    const t = this.tracking; this.tracking = null; return t;
  },
  trackFrame() {
    const t = this.tracking, r = recognize(this);
    const e = t.screens[r.screen] ??= { count: 0, first: r.details };
    e.count++;
    if (r.screen === "unknown" && !t.unknown) t.unknown = r.details;
    if ((r.screen === "field-free") !== this.observe().fieldFree) { t.mismatch++; t.mismatchSample ??= { screen: r.screen, details: r.details }; }
  },
  /** Active callbacks: gMain runs only inside HwScene. Its field value can be stale. */
  cb2() { return g()?.scene?.constructor?.name === "HwScene" ? this.R?.gMain.callback2?.name : g()?.callback2?.name; },
  observe() {
    const game = g(), state = this.st();
    const scene = game?.scene?.constructor?.name ?? null;
    const tasks = this.T?.tasks.tasks.filter(t => t.isActive).map(t => t.func.name) ?? [];
    const cb1 = scene === "HwScene" ? this.R?.gMain.callback1?.name : game?.callback1?.name;
    const cb2 = this.cb2();
    const questLog = this.Q?.gQuestLogState;
    const playback = this.C && [this.C.QL_STATE_PLAYBACK, this.C.QL_STATE_PLAYBACK_LAST].includes(questLog);
    const battle = scene === "BattleTransitionScene" || scene === "HwScene" &&
      (this.R?.gMain.inBattle || cb1 === "BattleMainCB1" || /Battle/.test(cb2 ?? ""));
    const choice = tasks.some(n => ["Task_MultichoiceMenu_HandleInput", "Task_YesNoMenu_HandleInput", "Task_PCMainMenu"].includes(n));
    const menu = tasks.includes("startInput");
    const saveCallback = game?.activeSaveDialog?.saveDialogCB.name ?? null;
    const saveChoice = ["SaveDialogCB_AskSaveHandleInput", "SaveDialogCB_AskOverwriteOrReplacePreviousFileHandleInput"].includes(saveCallback);
    const standing = !!game?.overworld.player.object && game.overworld.player.isStandingStill();
    const fieldFree = standing && !!state.map && !!game?.callback1 && !scene && !playback && !state.script && !state.locked && !choice && !menu && !tasks.includes("saveInput") && !saveCallback;
    const controller = battle ? this.G?.gBattlerControllerFuncs[0]?.name : null;
    const dialog = !!game?.overworld.messageBox.printer?.active;
    const script = game?.overworld.script.global;
    const waitingForButton = !!state.script && script?.mode === this.SC?.SCRIPT_MODE_NATIVE && script?.nativePtr?.name === "bound WaitForAorBPress";
    const phase = playback ? "quest-log" : scene === "BattleTransitionScene" ? "battle-transition"
      : scene === "HwScene" && cb2 === "CB2_UpdatePartyMenu" ? "party-menu"
      : scene === "HwScene" && cb2 === "CB2_BagMenuRun" ? "bag-menu"
      : battle ? controller === "HandleInputChooseAction" ? "battle-action" : controller === "HandleInputChooseMove" ? "battle-move" : "battle"
      : choice ? "choice" : saveChoice ? "save-choice" : menu ? "start-menu" : tasks.includes("saveInput") ? "save-dialog" : scene ? "screen"
      : !state.map || !game?.callback1 ? "loading" : fieldFree ? "field" : waitingForButton ? "dialog-wait" : dialog ? "dialog" : "field-busy";
    const rec = this.C && this.T ? recognize(this) : null;
    return { ...state, screen: rec?.screen ?? "map-loading", screenDetails: rec?.details ?? null, phase, fieldFree, standing, battle: !!battle, dialog, waitingForButton, tasks, saveCallback, cb1: cb1 ?? null, cb2: cb2 ?? null,
      hardwareCb2: this.R?.gMain.callback2?.name ?? null, controller, questLog, frame: game?.frameCount };
  },
  /** Wait for actual field control, including recorded Quest Log scenes. Never sends A. */
  async ready(maxFrames = 18000) {
    if (!Number.isInteger(maxFrames) || maxFrames < 0) throw new Error("invalid ready frame budget");
    const start = performance.now();
    while (!dbg() && performance.now() - start < 20000) await new Promise(r => setTimeout(r, 20));
    if (!dbg()) throw new Error("driver unavailable after 20s");
    await this.init();
    const observed = [];
    this.readyScreens = {};
    for (let f = 0; f <= maxFrames; f++) {
      const state = this.observe();
      this.readyScreens[state.screen] = (this.readyScreens[state.screen] ?? 0) + 1;
      if (!observed.some(s => s.phase === state.phase && s.questLog === state.questLog && s.map === state.map))
        observed.push({ phase: state.phase, questLog: state.questLog, map: state.map });
      if (state.fieldFree) return { ...state, ok: true, status: "success", frames: f, observed };
      if (f === maxFrames) throw Object.assign(new Error("field readiness timeout"), { result: { ok: false, status: "failure", reason: "ready-timeout", state, frames: f, observed } });
      await this.wait(1);
    }
  },
  inBattle() { return this.observe().battle; },
  /**
   * Long work inside the page: tool calls time out (~45 s) but the page keeps
   * running. Start with H.job(async () => …), then poll H.jobStatus().
   */
  job(fn, { maxFrames = 120000, timeoutMs = 120000 } = {}) {
    if (this.execution && !this.execution.done) return { ok: false, status: "blocked", reason: "job-running", id: this.execution.id };
    if (!(maxFrames > 0) || !(timeoutMs > 0)) throw new Error("positive job budgets required");
    const st = { id: (this.jobSequence = (this.jobSequence ?? 0) + 1), done: false, out: null,
      t0: performance.now(), frames: 0, maxFrames, timeoutMs, game: g(), debug: dbg(), cancelled: false };
    this.execution = this.jobState = st;
    (async () => {
      try { st.out = await fn(); this.checkExecution(); }
      catch (e) { st.out = e.result ?? { ok: false, status: "failure", reason: "exception", error: String(e?.stack ?? e), state: this.observe() }; }
      finally { st.done = true; }
    })();
    return "started"; // preserved for existing polling callers
  },
  cancelJob() {
    const st = this.execution;
    if (!st || st.done) return { ok: false, status: "blocked", reason: "no-active-job" };
    st.cancelled = true;
    dbg()?.joy?.release(0xffff);
    return { ok: true, status: "success", id: st.id, reason: "cancellation-requested" };
  },
  checkExecution(checkFrames = false) {
    const st = this.execution;
    if (!st || st.done) return;
    const reason = st.cancelled ? "cancelled" : st.game !== g() || st.debug !== dbg() || window.H !== this ? "session-changed"
      : checkFrames && st.frames >= st.maxFrames ? "frame-budget" : performance.now() - st.t0 >= st.timeoutMs ? "time-budget" : null;
    if (reason) throw Object.assign(new Error(reason), { result: { ok: false, status: "failure", reason, id: st.id, frames: st.frames } });
  },
  jobStatus() {
    const st = this.jobState;
    if (!st) return { done: true, status: "idle", st: this.observe() };
    const { game, debug, ...publicState } = st;
    return { ...publicState, s: Math.round((performance.now() - st.t0) / 1000), st: this.observe() };
  },
  /** Walking uses guarded single frames, never the uninterruptible debug.walk batch. */
  async walk(dir, tiles = 1) {
    const bits = { R: 0x10, L: 0x20, U: 0x40, D: 0x80 }[dir];
    if (!bits || !Number.isInteger(tiles) || tiles < 1) throw new Error("invalid walk request");
    const player = () => g().overworld.player;
    const map = this.st().map, start = { ...player().object.currentCoords };
    const moved = () => Math.abs(player().object.currentCoords.x - start.x) + Math.abs(player().object.currentCoords.y - start.y);
    for (let f = 0; f < 40 * tiles + 40; f++) {
      if (this.st().map !== map || !g().callback1 || g().scene || this.st().script || this.st().locked) break;
      this.step(moved() >= tiles ? 0 : bits);
      if (moved() >= tiles && player().tileTransitionState !== 1) break;
      if (f % 4 === 3) await new Promise(r => setTimeout(r, 1));
    }
    await this.wait(8);
    return this.st();
  },
  warps() { return g().overworld.loaded.header.warps.map((w) => [w.x, w.y, w.destMap]); },
  coords() { return g().overworld.loaded.header.coords.map((c) => [c.x, c.y, c.scriptName]); },
  objects() {
    return g().overworld.objects.objects.filter((o) => o && o.currentCoords)
      .map((o) => [o.localId, o.currentCoords.x - 7, o.currentCoords.y - 7, o.graphicsId, o.invisible]);
  },
  /** Settle scripts through the single loop; menus and choices are handed back to the caller (reason "input-required"). */
  async idle(max = 3000, tapA = true) {
    const quiet = async (ctx) => { await ctx.wait(2); };
    const r = await drive(this, { label: "idle", maxFrames: max, handlers: tapA ? {} : { dialog: quiet, "dialog-wait": quiet },
      until: (rec) => rec.raw?.inBattle ? "battle-started" : rec.screen === "field-free" ? "field-free" : false });
    const f = r.frames;
    if (r.ok) return r.reason === "battle-started" ? { ...this.observe(), f, battle: true, ok: true, status: "success", reason: "battle-started" } : { ...this.observe(), f, ok: true, status: "success" };
    if (["input-required", "unanswered-yes-no", "unhandled-multichoice"].includes(r.reason)) return { ...this.observe(), f, ok: false, status: "blocked", reason: "input-required", note: "input required", stop: r };
    if (r.reason === "frame-budget") return { ...this.observe(), ok: false, status: "failure", reason: "idle-timeout", timeout: true };
    return { ...this.observe(), f, ok: false, status: "failure", reason: r.reason, note: r.reason, driver: r };
  },
  /** Back out of whatever menu is open until the field is free again (cleanup after a failed menu flow). */
  async escapeMenus(maxFrames = 4000) {
    return drive(this, { label: "escape", state: { exitMenus: true }, maxFrames, until: (rec) => rec.screen === "field-free" || rec.raw?.inBattle });
  },
  dbgParty() { return dbg().save.save.party; },
  /** The one decision policy (driver/policy.js): thresholds, noItems, declared answers. Options: H.policy.options. */
  policy: new Policy(),
  /** Party in the shape the policy reads: slot, hp, maxHP, identity and the battle-mon view used to rank attacks. */
  policyMons() {
    return dbg().save.save.party.map((m, slot) => m.species ? { slot, species: m.species, isEgg: m.isEgg, hp: m.hp, maxHP: m.stats[0],
      personality: m.personality, otId: m.otId, battleMon: this.partyBattleMon(m) } : null).filter(Boolean);
  },
  policyDeps() { return { C: this.C, rom: this.rom, bestMoves: (mon) => this.bestMoves(mon) }; },
  fieldFree() { return this.observe().fieldFree; },
  /** One commanded frame; browser rAF may also run frames while yielding. */
  step(bits = 0) {
    this.checkExecution(true);
    dbg().run(1, bits);
    if (this.execution && !this.execution.done) this.execution.frames++;
    if (this.tracking) this.trackFrame();
  },
  async wait(frames, bits = 0) {
    for (let f = 0; f < frames; f++) {
      this.step(bits);
      if (f % 4 === 3 || frames === 1) await new Promise(r => setTimeout(r, 1));
    }
  },
  async press(button, settle = 30) {
    const bits = { A: 1, B: 2, SELECT: 4, START: 8 }[button];
    if (!bits) throw new Error("unsupported button " + button);
    return this.tap(bits, settle); // primitive: public low-level press for jobs; the driver itself never calls it
  },
  async tap(bits, settle = 16) {
    this.step(); // ReadKeys must observe release before the next edge.
    this.step(bits);
    await this.wait(Math.max(1, settle));
  },
  /** Inspect predicates every frame; limit retains the old iteration budget (~16 frames each). */
  async until(test, button = null, limit = 180) {
    const bits = button ? { A: 1, B: 2, SELECT: 4, START: 8 }[button] : 0;
    if (button && !bits) throw new Error("unsupported button " + button);
    for (let f = 0; f < limit * 16; f++) {
      this.checkExecution();
      if (test()) return true;
      this.step(f % 32 === 1 ? bits : 0);
      if (f % 4 === 3) await new Promise(r => setTimeout(r, 1));
    }
    return !!test();
  },
  hasTask(name) { return this.T.tasks.tasks.some(t => t.isActive && t.func.name === name); },
  countItem(item) { return Object.values(dbg().save.save.bag).flat().filter(e => e.item === item).reduce((n, e) => n + e.quantity, 0); },
  resources() {
    const sv = dbg().save.save;
    return { money: sv.money, items: sv.bag.items.map(e => ({ ...e })),
      party: sv.party.map((m, slot) => ({ slot, species: m.species, level: m.level,
        hp: m.hp, maxHP: m.stats[0], status: m.status, moves: [...m.moves], pp: [...m.pp],
        attackPP: m.moves.reduce((n, id, j) => n + ((this.rom.moves[id]?.power ?? 0) > 1 ? m.pp[j] : 0), 0) })).filter(m => m.species) };
  },
  partyBattleMon(m) {
    const info = this.rom.species[m.species];
    return { species: m.species, hp: m.hp, maxHP: m.stats[0], attack: m.stats[1], defense: m.stats[2],
      spAttack: m.stats[4], spDefense: m.stats[5], type1: info.types[0], type2: info.types[1],
      ability: info.abilities[m.abilityNum], moves: m.moves, pp: m.pp, status1: m.status, status2: 0 };
  },
  /**
   * Strength estimate for a trainer battle (simulateBattle in strategy.js; an estimate, not the battle engine).
   * Foes come from the exported trainer party: createMon with the party's fixed IV (iv * 31 / 255, as
   * CreateNPCTrainerParty) and personality 0 so no RNG is used, custom moves when the party has them. The own team is
   * a copy of the party, at full HP unless fullHp is false. levelsNeeded is the smallest +k levels for every member
   * that makes the estimate favorable (stats recomputed with calculateStats on the copy; no evolution assumed).
   */
  async assessTrainer(trainerId, { fullHp = true, maxExtraLevels = 15 } = {}) {
    const P = await this.mod("/src/fr/pokemon/pokemon.ts");
    const trainer = this.rom.trainers[trainerId];
    if (!trainer) return { ok: false, reason: "unknown trainer " + trainerId };
    const desc = (m) => ({ ...this.partyBattleMon(m), level: m.level, speed: m.stats[3] });
    const foes = trainer.party.map(p => {
      const m = P.createMon(p.species, p.level, { personality: 0, fixedIV: Math.floor(p.iv * 31 / 255), otId: 0 });
      if (p.moves?.some(Boolean)) m.moves = [...p.moves];
      return desc(m);
    });
    const team = (extra) => dbg().save.save.party.filter(m => m.species && !m.isEgg).map(m => {
      const c = structuredClone(m);
      if (extra) {
        // Level by level, as the game would: level-up evolution (levelUpEvolution) and learnset moves through the
        // same chooseMoveToForget policy the battle loop now applies.
        const target = Math.min(100, c.level + extra);
        for (let lvl = c.level + 1; lvl <= target; lvl++) {
          c.exp = P.expForLevel(c.species, lvl); P.calculateStats(c);
          const evo = P.levelUpEvolution(c);
          if (evo && evo !== c.species) { c.species = evo; P.calculateStats(c); }
          for (const [l, mv] of this.rom.species[c.species].learnset) {
            if (l !== lvl || c.moves.includes(mv)) continue;
            const free = c.moves.findIndex(x => !x);
            const slot = free >= 0 ? free : this.policy.forgetMove({ moves: c.moves, move: mv, types: this.rom.species[c.species].types }, this.policyDeps());
            if (slot >= 0) { c.moves[slot] = mv; c.pp[slot] = this.rom.moves[mv].pp; }
          }
        }
      }
      if (fullHp || extra) c.hp = c.stats[0];
      return desc(c);
    });
    const now = simulateBattle(team(0), foes, this.rom, this.C);
    let levelsNeeded = now.verdict === "favorable" ? 0 : null;
    for (let k = 1; levelsNeeded === null && k <= maxExtraLevels; k++) if (simulateBattle(team(k), foes, this.rom, this.C).verdict === "favorable") levelsNeeded = k;
    return { ok: true, trainerId, double: !!trainer.double, foes: foes.map(f => [f.species, f.level]), team: team(0).map(m => [m.species, m.level, m.hp + "/" + m.maxHP]),
      verdict: now.verdict, win: now.win, hpLeft: now.hpLeft, foesLeft: now.foesLeft, levelsNeeded, log: now.log };
  },
  bestMoves(mon = this.G.gBattleMons[0], foe = this.G.gBattleMons[1]) {
    const d = this.G.gDisableStructs[0];
    return rankMoves(mon, foe, this.rom, this.C, mon === this.G.gBattleMons[0] ?
      { disabledMove: d.disabledMove, encoredMove: d.encoreTimer ? d.encoredMove : 0 } : {});
  },
  bestReplacement(healthy = false) {
    return this.policy.bestReplacement({ mons: this.policyMons(), active: this.G.gBattleMons[0], healthy }, this.policyDeps()) ;
  },
  recoverReplacement() {
    return this.policy.recoverReplacement({ mons: this.policyMons(), active: this.G.gBattleMons[0], bag: this.policy.bag(dbg().save.save.bag.items) }, this.policyDeps());
  },
  battleDecision(incoming = 0) {
    return this.policy.battle({ flags: this.G.G.gBattleTypeFlags, mon: this.G.gBattleMons[0], mons: this.policyMons(),
      bag: dbg().save.save.bag.items, incoming, training: this.training }, this.policyDeps());
  },
  /** Use one supported medicine through BAG > USE > the observed party slot (loop goal "use-item").
   * No item-effect function is called. Result includes actual consumption. */
  async useItem(item, target, { battle = false } = {}) {
    const before = this.resources(), mon = dbg().save.save.party[target];
    if (!this.policy.itemsAllowed) return { ok: false, status: "blocked", reason: "items-disabled", note: "items disabled by policy (noItems)", before };
    const hpItems = [this.C.ITEM_POTION, this.C.ITEM_SUPER_POTION, this.C.ITEM_HYPER_POTION, this.C.ITEM_MAX_POTION];
    const statusItems = [this.C.ITEM_ANTIDOTE, this.C.ITEM_PARALYZE_HEAL, this.C.ITEM_BURN_HEAL, this.C.ITEM_ICE_HEAL, this.C.ITEM_AWAKENING];
    if (!mon?.species || mon.isEgg || mon.hp <= 0 || !hpItems.includes(item) && !statusItems.includes(item)
        || this.countItem(item) < 1) return { ok: false, note: "medicine unavailable or invalid target", before };
    const count = this.countItem(item), hp0 = mon.hp, status0 = mon.status;
    if (battle ? this.recognize().screen !== "battle-action" : !this.fieldFree()) return { ok: false, note: battle ? "battle action not ready" : "field not free", before };
    const goal = { kind: "use-item", item, target, battle, personality: mon.personality, otId: mon.otId, count0: count,
      consumed: false, started: false, menuUsed: false, effectSeen: null };
    const r = await drive(this, { goal, label: "use-item", maxFrames: 30000, handlers: battle ? { "battle-action": battleItemMenu } : {},
      until: (rec) => {
        if (!goal.consumed && this.countItem(item) < count) {
          // The effect is read at consumption, before the turn continues: a foe can re-poison or hit the target afterwards.
          goal.consumed = true;
          const atUse = dbg().save.save.party.find(m => m.personality === mon.personality && m.otId === mon.otId);
          goal.effectSeen = hpItems.includes(item) ? atUse.hp > hp0 : atUse.status !== status0;
        }
        if (!goal.consumed) return false;
        if (battle) return rec.screen === "battle-action";
        // Closing the bag returns to the START menu (reopened a few frames later): only a field that stays free is the end.
        if (rec.screen !== "field-free") { goal.freeSince = null; return false; }
        goal.freeSince ??= window.frGame.frameCount;
        return window.frGame.frameCount - goal.freeSince >= 45;
      } });
    const after = this.resources();
    const ok = r.ok && this.countItem(item) === count - 1 && !!goal.effectSeen;
    const result = { ok, note: ok ? null : r.ok ? "medicine did not complete correctly" : (r.note ?? r.reason), item, target, before, after };
    if (!r.ok) result.driver = { reason: r.reason, screen: r.rec?.screen, details: r.rec?.details, dump: r.dump };
    this.log.push({ medicine: result });
    return result;
  },
  /** Heal before walking; stop for exhausted PP, fainted members or no reserves. Every choice is the policy's (prepare). */
  async prepareStep() {
    if (!this.fieldFree()) return { ok: false, note: "field not free", resources: this.resources() };
    const snapshot = this.resources(), o = this.policy.options, deps = this.policyDeps();
    if (!snapshot.party.length || snapshot.party.some(m => m.hp <= 0 || m.attackPP < o.minAttackPP)) return { ok: false, note: "return to center: hp or pp exhausted", resources: snapshot };
    const live = (m) => dbg().save.save.party[m.slot];
    const plan = (m) => this.policy.prepare({ mon: { hp: live(m).hp, maxHP: m.maxHP, attackPP: m.attackPP, status: live(m).status },
      bag: dbg().save.save.bag.items, stock: [this.C.ITEM_POTION, this.C.ITEM_SUPER_POTION, this.C.ITEM_HYPER_POTION, this.C.ITEM_MAX_POTION].reduce((n, id) => n + this.countItem(id), 0) }, deps);
    for (const m of snapshot.party) {
      let p = plan(m);
      if (p.retreat && m.status && !p.cure) return { ok: false, note: p.retreat, resources: this.resources() };
      if (p.cure) { const used = await this.useItem(p.cure, m.slot); if (!used.ok) return { ...used, resources: this.resources() }; }
      for (let attempts = 0; attempts < 4 && live(m).hp / m.maxHP < o.fieldHp; attempts++) {
        p = plan(m);
        if (p.retreat) return { ok: false, note: p.retreat, resources: this.resources() };
        const used = await this.useItem(p.heal, m.slot);
        if (!used.ok) return { ...used, resources: this.resources() };
      }
      if (live(m).hp / m.maxHP < o.fieldHp) return { ok: false, note: "return to center: healing budget", resources: this.resources() };
    }
    return { ok: true, resources: this.resources() };
  },
  /**
   * Finish the current battle through the single loop (recognize -> handler -> verified input), no blind presses.
   * mode "auto": rank attacks, use medicine, switch/escape with resource guards (Policy).
   * mode "fight": FIGHT, then the move in `slot` (0 TL, 1 TR, 2 BL, 3 BR; or a function of the active species);
   * mode "run": RUN; mode "switch": shift the lead to party slot 1 on the first turn, then fight with `slot`.
   * A screen without a handler (or "unknown") stops the battle with the state dump in `driver`.
   */
  async battle(mode = "auto", slot = 0, maxSteps = 4000) {
    const start = this.party();
    const screens = new Set();
    if (this.training) this.training.switched = false;
    // Trainer battles: estimate before the first turn, so a loss or stop can be explained (diagnosis below).
    const C0 = this.C, opponent = this.G.G.gBattleTypeFlags & C0.BATTLE_TYPE_TRAINER ? this.G.G.gTrainerBattleOpponent_A : null;
    const assessment = opponent != null && this.rom.trainers[opponent] ? await this.assessTrainer(opponent, { fullHp: false }) : null;
    const teamStart = this.resources().party.map(m => ({ species: m.species, level: m.level, hp: m.hp, maxHP: m.maxHP }));
    const b = { mode, slot, decision: null, decisions: 0, unchanged: 0, lastKey: null, lastHp: null, incoming: 0, learn: null, sawPartyMenu: false };
    const EVO = new Set(["evolution", "evolution-yesno", "summary-forget-move"]);
    const d = await drive(this, { label: "battle", state: { battle: b }, maxFrames: maxSteps * 12,
      until: (rec) => { screens.add(rec.raw?.cb2); return !rec.raw?.inBattle && !EVO.has(rec.screen) && !/EvolutionScene/.test(rec.raw?.cb2 ?? ""); } });
    let stop = d.ok ? null : d.reason === "frame-budget" ? "step budget" : d.reason;
    const trace = d.trace;
    // battle_script_commands.c 0x5A: YES opens ShowSelectMovePokemonSummaryScreen; the slot is chosen there by real input
    // and the result is checked in the party data, since that screen's cursor is not observable.
    if (b.learn) {
      const moves = dbg().save.save.party[b.learn.monId]?.moves ?? [];
      if (moves[b.learn.slot] === b.learn.move) trace.push({ action: "learned move", ...b.learn, moves: [...moves] });
      else if (!stop) { stop = "learn move not applied"; trace.push({ action: "learn move mismatch", ...b.learn, moves: [...moves] }); }
    }
    const stuck = this.inBattle();
    if (stuck && !stop) stop = "step budget";
    await this.wait(30);
    const r = { battle: mode, slot, n: d.iterations, start, end: this.party(), outcome: g().battleOutcome, map: dbg().state().map, stuck, stop, decisions: b.decisions, trace, screens: [...screens].filter(Boolean) };
    if (!d.ok) r.driver = { reason: d.reason, screen: d.rec?.screen, details: d.rec?.details, dump: d.dump };
    if (assessment) r.assessment = { trainer: opponent, verdict: assessment.verdict, hpLeft: assessment.hpLeft, levelsNeeded: assessment.levelsNeeded, foes: assessment.foes };
    if (stop || r.outcome === this.C.B_OUTCOME_LOST || r.outcome === this.C.B_OUTCOME_DREW) r.diagnosis = this.battleDiagnosis(r, assessment, teamStart);
    this.log.push(r);
    return r;
  },
  /** Walk into this map's Pokémon Center (its warp to *_POKEMON_CENTER_1F), heal with the nurse and walk out. */
  async healAtCenter() {
    const map0 = this.st().map;
    const door = g().overworld.loaded.header.warps.find(w => /_POKEMON_CENTER_1F$/.test(w.destMap));
    if (!door) return { ok: false, note: "no Pokemon Center on " + map0 };
    const below = await this.goto(door.x, door.y + 1, { recovery: true });
    if (below.note) return { ok: false, note: "center door: " + below.note };
    const enter = await this.exit("U", 1, { recovery: true });
    if (!/_POKEMON_CENTER_1F$/.test(this.st().map)) return { ok: false, note: "did not enter the center", enter };
    const healed = await this.heal({ leave: true });
    if (!healed.ok) return { ok: false, note: healed.note ?? "nurse failed", healed };
    return { ok: this.st().map === map0, note: this.st().map === map0 ? null : "did not return to " + map0, map: this.st().map };
  },
  /**
   * Natural training before a trainer battle: walk between two tiles of the current map (grass), fighting wild
   * battles with the auto policy, until assessTrainer(trainer) is favorable. Medicine is kept (no items in battle,
   * no field potions: recovery walking); low HP/PP calls heal (default: this map's Pokémon Center; it must bring
   * the team back to the map of `between`). The lowest-level
   * healthy member is switched in once per wild battle to share experience. Evolutions and new moves are handled by
   * battle()/handleEvolution. Nothing is written to the game; stops on a lost battle or the battle budget.
   */
  async train({ trainer, between, maxBattles = 80, minHp = 0.5, heal = () => this.healAtCenter() } = {}) {
    const start = { party: this.party(), assessment: await this.assessTrainer(trainer) };
    if (!start.assessment.ok) return { ok: false, reason: start.assessment.reason, start };
    const battles0 = this.log.filter(e => e.battle).length;
    const battles = () => this.log.filter(e => e.battle).length - battles0;
    const heals = [];
    let assessment = start.assessment, reason = null;
    this.training = { target: null, switched: false };
    const noItems0 = this.policy.options.noItems;
    this.policy.set({ noItems: true });
    try {
      for (let loop = 0; loop < 400 && assessment.verdict !== "favorable"; loop++) {
        if (battles() >= maxBattles) { reason = "battle budget"; break; }
        const r = this.resources();
        if (r.party.some(m => m.hp / m.maxHP < minHp || m.attackPP < 5 || m.status)) {
          const h = await heal();
          heals.push({ ok: h.ok, note: h.note ?? null, party: this.party() });
          if (!h.ok) { reason = "heal failed: " + h.note; break; }
        }
        const alive = this.resources().party.filter(m => m.hp > 0);
        const weakest = alive.sort((a, b) => a.level - b.level)[0];
        this.training.target = weakest ? dbg().save.save.party[weakest.slot].personality : null;
        for (const [x, y] of between) {
          const g2 = await this.goto(x, y, { recovery: true, battle: "auto" });
          const stop = g2.note && g2.note !== "map changed" ? g2.note : null;
          if (stop) { reason = stop; break; }
        }
        if (reason) break;
        assessment = await this.assessTrainer(trainer);
      }
    } finally { this.training = null; this.policy.set({ noItems: noItems0 }); }
    const evolutions = this.log.filter(e => e.evolution).map(e => e.evolution.evolved).flat();
    const ok = assessment.verdict === "favorable";
    return { ok, reason: ok ? "favorable" : reason ?? "loop budget", battles: battles(), heals, evolutions,
      start: { party: start.party, verdict: start.assessment.verdict, levelsNeeded: start.assessment.levelsNeeded },
      end: { party: this.party(), verdict: assessment.verdict, hpLeft: assessment.hpLeft, levelsNeeded: assessment.levelsNeeded } };
  },
  /**
   * Evolution scene after a battle (evolution_scene.c Task_EvolutionScene) through the single loop. The scene runs by
   * itself; the learn-move prompts are answered by the Policy (chooseMoveToForget) and the forget-move summary screen
   * is driven with the slot read back from GetMoveSlotToReplace. B (which cancels an evolution) is never sent.
   */
  async handleEvolution(maxFrames = 12000) {
    const party = () => dbg().save.save.party;
    const before = party().map(m => m.species);
    const FAMILY = new Set(["evolution", "evolution-yesno", "summary-forget-move", "summary-view", "loading-screen"]);
    const state = { evolution: { before, trace: [] } };
    const r = await drive(this, { label: "evolution", state, maxFrames, handlers: { evolution: async (ctx) => { await ctx.wait(4); } },
      // The scene is over when its task is gone and no evolution/summary screen shows (the YES -> summary hand-over passes
      // through an anonymous battle callback, so the task is what keeps the scene alive).
      until: (rec) => !this.hasTask("Task_EvolutionScene") && !FAMILY.has(rec.screen) && !/EvolutionScene|PSS|PokemonSummary/.test(rec.raw?.cb2 ?? "") });
    const evolved = party().map((m, i) => m.species !== before[i] ? { slot: i, from: before[i], to: m.species } : null).filter(Boolean);
    const trace = state.evolution.trace, learn = state.forget;
    if (!r.ok) return { ok: false, reason: r.reason === "frame-budget" ? "evolution scene did not finish" : r.reason, evolved, trace, driver: { reason: r.reason, screen: r.rec?.screen, dump: r.dump } };
    if (learn?.slot >= 0 && party()[learn.monId].moves[learn.slot] !== learn.move) return { ok: false, reason: "evolution learn move not applied", evolved, trace };
    const result = { ok: true, evolved, trace };
    this.log.push({ evolution: result });
    return result;
  },
  /**
   * Why a battle was lost or stopped, from observable data only: the pre-battle estimate (trainer battles), level
   * gap, foes left, medicine and attack PP left. "underleveled" means the estimate was not favorable before the
   * first turn (train first, see H.train); "policy" means it was favorable, so the driver's choices are suspect;
   * "resources" means no medicine and no attack PP were left; "budget" is a driver limit, not a game result.
   */
  battleDiagnosis(r, assessment, teamStart) {
    const foesLeft = (this.MON?.gEnemyParty ?? []).filter(m => m && m.species && m.hp > 0).map(m => [m.species, m.level, m.hp]);
    const res = this.resources();
    const medicine = [this.C.ITEM_POTION, this.C.ITEM_SUPER_POTION, this.C.ITEM_HYPER_POTION, this.C.ITEM_MAX_POTION].reduce((n, id) => n + this.countItem(id), 0);
    const attackPP = res.party.reduce((n, m) => n + m.attackPP, 0);
    const maxFoe = Math.max(0, ...(assessment?.foes ?? []).map(f => f[1])), maxOwn = Math.max(0, ...teamStart.map(m => m.level));
    const cause = /budget|step budget/.test(r.stop ?? "") ? "budget"
      : assessment && assessment.verdict !== "favorable" ? "underleveled"
      : medicine === 0 && attackPP === 0 ? "resources" : assessment ? "policy" : "unknown";
    return { cause, stop: r.stop, outcome: r.outcome, estimate: assessment ? { verdict: assessment.verdict, levelsNeeded: assessment.levelsNeeded } : null,
      levelGap: assessment ? maxFoe - maxOwn : null, teamStart, foesLeft, medicine, attackPP };
  },
  /** Navigation must stop after defeat or an unfinished battle, even after the
   * whiteout script heals the team. Direct battle() remains usable by C7. */
  battleStop(result) {
    if (result.stuck) return result.stop ?? "battle stuck";
    if (result.outcome === this.C.B_OUTCOME_LOST || result.outcome === this.C.B_OUTCOME_DREW) return "battle lost";
    return null;
  },
  /**
   * Multi-floor navigation (caves, towers): on each map take a reachable warp
   * not used yet, until `isTarget(map, warp)` is reachable and taken.
   * `avoid(map, warp)` excludes warps (e.g. the cave entrance).
   * Warps are { i, x, y, dest } in frDebug.state() coordinates.
   */
  async explore(isTarget, avoid = () => false, maxMoves = 40) {
    const used = new Map();
    const path = [];
    for (let m = 0; m < maxMoves; m++) {
      if (this.inBattle()) {
        const b = await this.battle(this.battleDefaults.mode, this.battleDefaults.slot);
        const note = this.battleStop(b);
        if (note) return { ...this.st(), note, battleResult: b, path };
      }
      const here = dbg().state();
      const warps = g().overworld.loaded.header.warps.map((w, i) => ({ i, x: w.x, y: w.y, dest: w.destMap }));
      const reachable = warps.filter((w) => this.bfs(w.x + 7, w.y + 7) !== null && !avoid(here.map, w));
      const target = reachable.find((w) => isTarget(here.map, w));
      // Prefer the least-used warp so dead ends (one-way ledges) are backed out of.
      const count = (w) => used.get(`${here.map}#${w.i}`) ?? 0;
      const pick = target ?? [...reachable].sort((a, b) => count(a) - count(b))[0];
      if (!pick) return { stuck: true, map: here.map, path };
      used.set(`${here.map}#${pick.i}`, count(pick) + 1);
      path.push(`${here.map}->${pick.dest}@${pick.x},${pick.y}`);
      const r = await this.goto(pick.x, pick.y);
      if (r.note && r.note !== "map changed") return { ...r, path };
      // Some warps (ladders) fire on arrival; stairs and exits need one more step.
      if (dbg().state().map === here.map && !r.note) {
        for (const d of ["U", "D", "L", "R"]) { if ((await this.exit(d, 1)).map !== here.map) break; }
      }
      const settled = await this.idle(600, false);
      if (!settled.ok) return { ...settled, path };
      if (target && dbg().state().map === target.dest) return { ok: true, path };
    }
    return { max: true, path };
  },
  /** Nurse through dialogue; verify every HP/PP/status before optionally leaving.
   * The counter coordinates are the standard Center 1F layout. */
  async heal({ leave = true } = {}) {
    if (!/POKEMON_CENTER_1F$/.test(this.st().map)) return { ok: false, note: "not a standard pokemon center" };
    const before = this.resources();
    const identityBefore = JSON.stringify(dbg().save.save.party.filter(m => m.species).map(m => [m.species, m.personality, m.otId, [...m.moves]]));
    const arrived = await this.goto(7, 4, { battle: "fight" });
    if (arrived.note) return { ok: false, note: arrived.note, before };
    await this.face("U");
    const talk = await this.interact();
    if (talk.note) return { ok: false, note: "nurse offer missing", before };
    // Nurse offer opens at YES (multichoice, goal "heal"); the loop answers it, lets the dialogue and the healing
    // movement script finish and returns when the field is free. The walk through that script is never driven by hand.
    const goal = { kind: "heal", offered: false };
    const run = await drive(this, { goal, label: "heal", maxFrames: 20000, until: (rec) => goal.offered && rec.screen === "field-free" });
    if (!run.ok) return { ok: false, note: goal.offered ? "nurse did not return control" : "nurse offer missing", before, driver: { reason: run.reason, screen: run.rec?.screen, details: run.rec?.details, dump: run.dump } };
    const after = this.resources();
    const healed = dbg().save.save.party.filter(m => m.species).every(m => m.hp === m.stats[0] && m.status === 0 && m.moves.every((id, slot) =>
      m.pp[slot] === (id ? this.rom.moves[id].pp + Math.floor(this.rom.moves[id].pp * 20 * ((m.ppBonuses >> (slot * 2)) & 3) / 100) : 0)));
    const identities = () => dbg().save.save.party.filter(m => m.species).map(m => [m.species, m.personality, m.otId]);
    // The test oracle independently compares source PP; this is a runtime guard.
    if (JSON.stringify(dbg().save.save.party.filter(m => m.species).map(m => [m.species, m.personality, m.otId, [...m.moves]])) !== identityBefore) return { ok: false, note: "nurse changed party identity", before, after };
    if (!healed || after.money !== before.money || after.party.length !== before.party.length) return { ok: false, note: "nurse result mismatch", before, after };
    const result = { ok: true, before, after, identity: identities() };
    this.log.push({ nurse: result });
    if (!leave) return result;
    const door = await this.goto(7, 7, { battle: "fight" });
    if (door.note) return { ...result, ok: false, note: door.note };
    const exit = await this.exit("D", 3);
    return { ...result, ok: !exit.note, note: exit.note, exit };
  },
  /**
   * Walk back and forth over two tiles (e.g. tall grass) fighting with move
   * `slot` until the lead reaches `level` or drops below `minHp` of max HP.
   */
  async grind(a, b, { slot = 0, level = 100, minHp = 0.4, loops = 30 } = {}) {
    const lead = () => dbg().save.save.party[0];
    for (let i = 0; i < loops; i++) {
      if (lead().level >= level) return { stop: "level", party: this.party() };
      if (lead().hp < lead().stats[0] * minHp) return { ok: false, status: "blocked", reason: "low-hp", stop: "lowhp", party: this.party() };
      const saved = this.battleDefaults;
      this.battleDefaults = { mode: "fight", slot };
      try {
        for (const tile of [a, b]) {
          const r = await this.goto(...tile);
          if (r.note) return { ok: false, status: r.status ?? "failure", reason: r.reason ?? r.note, stop: r.note, state: r };
        }
      } finally { this.battleDefaults = saved; }
    }
    return { ok: false, status: "failure", reason: "loop-budget", stop: "loops", party: this.party() };
  },
  battleDefaults: { mode: "auto", slot: 0 },
  /** Shortest path in map-internal coords (+7), using the live collision checks. */
  bfs(tx, ty) {
    const ow = g().overworld, player = ow.player.object, objects = ow.objects;
    if (!this.fieldFree()) return null;
    const sx = player.currentCoords.x, sy = player.currentCoords.y;
    const key = (x, y, elevation) => `${x},${y},${elevation}`;
    const xy = (x, y) => `${x},${y}`;
    const inside = (x, y) => x >= 7 && y >= 7 && x < ow.loaded.layout.width + 7 && y < ow.loaded.layout.height + 7;
    // Plan only within the current map; exit() executes camera connections.
    if (!inside(tx, ty)) return null;
    const warps = new Set(ow.loaded.header.warps.map(w => xy(w.x + 7, w.y + 7)));
    const initial = key(sx, sy, player.currentElevation);
    const prev = new Map([[initial, null]]), queue = [[sx, sy, player.currentElevation]];
    let end = null;
    for (let head = 0; head < queue.length; head++) {
      const [x, y, elevation] = queue[head], from = key(x, y, elevation);
      if (x === tx && y === ty) { end = from; break; }
      // Collision queries read the source tile and elevation. Use a virtual
      // object for each node, without moving/mutating the real player or camera.
      const probe = { ...player, currentCoords: { x, y }, currentElevation: elevation,
        currentMetatileBehavior: ow.map.behaviorAt(x, y), trackedByCamera: false };
      for (const [dx, dy, dir, , name] of DIRS) {
        let nx = x + dx, ny = y + dy;
        if (!inside(nx, ny)) continue;
        const c = objects.GetCollisionAtCoords(probe, nx, ny, dir);
        // The object's collision API never returns LEDGE_JUMP. PlayerAvatar's
        // pure ledge predicate supplies it; CheckForObjectEventCollision would
        // also increment the jump statistic, so never call it during planning.
        if (ow.player.GetLedgeJumpDirection(nx, ny, dir)) {
          nx += dx; ny += dy;
          if (!inside(nx, ny) || ow.map.collisionAt(nx, ny) || objects.objectAt(probe, nx, ny)) continue;
        } else if (c !== COLLISION_NONE && !(nx === tx && ny === ty && c === COLLISION_OBJECT_EVENT)) continue;
        const destination = xy(nx, ny);
        if (warps.has(destination) && !(nx === tx && ny === ty)) continue;
        const nextElevation = ow.map.elevationAt(nx, ny);
        const next = nextElevation === 15 || ow.map.elevationAt(x, y) === 15 ? elevation : nextElevation;
        const k = key(nx, ny, next);
        if (prev.has(k)) continue;
        prev.set(k, [from, name]);
        queue.push([nx, ny, next]);
      }
    }
    if (end === null) return null;
    const steps = [];
    for (let cur = end; prev.get(cur); ) {
      const [parent, name] = prev.get(cur);
      steps.unshift(name); cur = parent;
    }
    return steps;
  },
  /** Walk to (x, y) on the current map, replanning every step and resolving battles/scripts. */
  async goto(x, y, opts = {}) {
    const mode = opts.battle ?? this.battleDefaults.mode;
    const slot = opts.slot ?? this.battleDefaults.slot;
    const map0 = dbg().state().map;
    for (let guard = 0; guard < 500; guard++) {
      if (this.inBattle()) {
        const b = await this.battle(mode, slot);
        const note = this.battleStop(b);
        if (note) return { ...this.st(), note, battleResult: b };
        continue;
      }
      const s = this.st();
      if (s.map !== map0) return { ...s, note: "map changed" };
      if (!this.fieldFree()) {
        const r = await this.idle(opts.idle ?? 4000);
        if (r.status === "blocked" || r.timeout) return { ...r, note: r.note ?? "script stuck" };
        continue;
      }
      if (s.x === x && s.y === y) return s;
      if (mode === "auto" && !opts.recovery) {
        const health = await this.prepareStep();
        if (!health.ok) return { ...this.st(), note: health.note, resources: health.resources };
      }
      const steps = this.bfs(x + 7, y + 7);
      if (!steps) return { ...s, note: "no path" };
      if (!steps.length) return s;
      await this.walk(steps[0], 1);
    }
    return { ...this.st(), note: "guard" };
  },
  /** Walk one direction until the map changes (connections, door/arrow warps). */
  async exit(dir, maxTiles = 4, opts = {}) {
    const map0 = dbg().state().map;
    for (let i = 0; i < maxTiles; i++) {
      if (this.inBattle()) {
        const b = await this.battle(this.battleDefaults.mode, this.battleDefaults.slot);
        const note = this.battleStop(b);
        if (note) return { ...this.st(), note, battleResult: b };
      }
      if (!this.fieldFree()) {
        const settled = await this.idle(opts.idle ?? 4000);
        if (settled.status === "blocked" || settled.timeout) return { ...settled, note: settled.note ?? "script stuck" };
        if (settled.battle) continue;
      }
      // The pending warp may finish while idle() runs. Do not execute the old
      // map's exit direction in the destination (it could enter the cave again).
      if (dbg().state().map !== map0 && this.fieldFree()) return this.st();
      if (this.battleDefaults.mode === "auto" && !opts.recovery) {
        const health = await this.prepareStep();
        if (!health.ok) return { ...this.st(), note: health.note, resources: health.resources };
      }
      await this.walk(dir, 1);
      for (let t = 0; t < 60; t++) {
        if (this.inBattle()) {
          const b = await this.battle(this.battleDefaults.mode, this.battleDefaults.slot);
          const note = this.battleStop(b);
          if (note) return { ...this.st(), note, battleResult: b };
        }
        const s = this.st();
        if (s.map !== map0 && this.fieldFree()) return s;
        if (s.map === map0 && !s.locked && !s.script && t > 2) break;
        await this.wait(30);
      }
    }
    return { ...this.st(), note: "no exit" };
  },
  /** Stand below a door warp at (x, y) and step in. */
  async enter(x, y, from = "D", opts = {}) {
    const [dx, dy] = { D: [0, 1], U: [0, -1], L: [-1, 0], R: [1, 0] }[from];
    const r = await this.goto(x + dx, y + dy, opts);
    if (r.note) return r;
    return this.exit({ D: "U", U: "D", L: "R", R: "L" }[from], 1, opts);
  },
  /** Face a direction without moving (tap). */
  async face(dir) {
    if (!this.fieldFree()) return { ...this.st(), ok: false, status: "blocked", reason: "field-not-free", note: "field not free" };
    const bits = { R: 0x10, L: 0x20, U: 0x40, D: 0x80 }[dir];
    if (!bits) throw new Error("invalid facing direction");
    const facing = { D: 1, U: 2, L: 3, R: 4 }[dir];
    const object = () => g().overworld.player.object;
    // Hold only until the turn registers so the player does not also step.
    for (let f = 0; f < 16 && object().facingDirection !== facing; f++) this.step(bits);
    await this.wait(12);
  },
  /** Talk across a counter: stand two tiles below (x, y), face up, interact. */
  async counter(x, y) {
    const r = await this.goto(x, y + 2);
    if (r.note) return r;
    await this.face("U");
    return this.interact();
  },
  /** Answer the script Yes/No menu (ScriptMenu_YesNo; cursor starts on YES) by key input.
   * Only for a menu observed open; the caller states the answer, nothing is chosen implicitly. */
  async answerYesNo(yes) {
    if (typeof yes !== "boolean") throw new Error("answerYesNo needs an explicit boolean");
    if (!this.hasTask("Task_YesNoMenu_HandleInput")) return { ok: false, status: "blocked", reason: "no-yes-no-menu", note: "no yes/no menu", state: this.observe() };
    try {
      // The task ignores input for its first frames: the same verified press is repeated if it had no effect.
      await pressChecked(this, yes ? "A" : "B", { expect: (r) => r.screen !== "yes-no", within: 60, retry: 2, label: "answerYesNo" }); // input: yes-no
    } catch (e) {
      if (!(e instanceof DriverStop)) throw e;
      return { ok: false, status: "failure", reason: "yes-no-not-closed", note: "yes/no menu did not close", state: this.observe(), driver: { reason: e.reason, ...e.info } };
    }
    return { ok: true, status: "success", answered: yes ? "yes" : "no", state: this.observe() };
  },
  /** Press A on the field for the faced object/tile; verified: a script, dialog or battle must start. */
  async interact() {
    try { await pressChecked(this, "A", { expect: (r) => r.screen !== "field-free", within: 120, label: "interact" }); return this.st(); } // input: field-free
    catch (e) { if (e instanceof DriverStop) return { ...this.st(), ok: false, note: "nothing to interact with", driver: { reason: e.reason, ...e.info } }; throw e; }
  },
  /** Buy `quantity` of `item` at a Poke Mart counter through the real clerk menu (loop goal "buy": BUY > list > quantity > YES).
   * The listed entry is read from the buy list and checked on the quantity prompt before anything is confirmed; the result is
   * verified by money (price * quantity from the item data) and bag count. Leaves the shop with B afterwards. */
  async buyItem(item, quantity, { clerk = [2, 3] } = {}) {
    if (!Number.isInteger(item) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error("invalid buyItem request");
    const price = (await this.mod("/src/fr/pokemon/items.ts")).itemInfo(item)?.price;
    const before = this.resources(), count0 = this.countItem(item);
    if (!price || before.money < price * quantity) return { ok: false, status: "blocked", reason: "not-enough-money", note: "not enough money", price, before };
    const leave = async (note, r) => { await this.escapeMenus(); return { ok: false, status: "failure", reason: note, note, price, before, after: this.resources(), state: this.observe(), driver: r && { reason: r.reason, screen: r.rec?.screen, details: r.rec?.details, dump: r.dump } }; };
    const talked = await this.counter(clerk[0], clerk[1]);
    if (talked.note) return talked;
    const goal = { kind: "buy", item, quantity, count0, bought: false };
    const r = await drive(this, { goal, label: "buy", maxFrames: 40000, until: (rec) => goal.bought && rec.screen === "field-free" });
    if (!r.ok) return leave(r.reason, r);
    const paid = before.money - this.resources().money, gained = this.countItem(item) - count0;
    const after = this.resources();
    const ok = paid === price * quantity && gained === quantity && this.fieldFree();
    const result = { ok, status: ok ? "success" : "failure", reason: ok ? "completed" : "purchase-mismatch", note: ok ? null : "purchase did not match", item, quantity, price, paid, gained, before, after };
    this.log.push({ purchase: { item, quantity, paid, ok } });
    return result;
  },
  /** Walk next to an object/tile, face it and interact (verified: a script starts). */
  async talk(x, y) {
    // Prefer standing below the target (facing up), as most counters/NPCs expect.
    for (const [name, ox, oy] of [["U", 0, 1], ["L", 1, 0], ["R", -1, 0], ["D", 0, -1]]) {
      if (this.bfs(x + ox + 7, y + oy + 7) === null) continue;
      const r = await this.goto(x + ox, y + oy);
      if (!r.note && r.x === x + ox && r.y === y + oy) {
        await this.face(name);
        return this.interact();
      }
    }
    return { ...this.st(), note: "cannot reach" };
  },
  validateCheckpointName(name) {
    if (typeof name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(name)) throw new Error("invalid checkpoint name");
    return name;
  },
  saveSnapshot() {
    const sv = dbg().save.save, st = this.st();
    return { map: st.map, x: st.x, y: st.y, money: sv.money,
      party: sv.party.filter(m => m.species).map(m => ({ species: m.species, personality: m.personality, otId: m.otId,
        level: m.level, exp: m.exp, hp: m.hp, status: m.status, moves: [...m.moves], pp: [...m.pp], heldItem: m.heldItem })),
      bag: JSON.parse(JSON.stringify(sv.bag)), heal: sv.lastHealLocation, escape: sv.escapeWarp,
      saved: sv.gameStats[this.C.GAME_STAT_SAVED_GAME] };
  },
  /** SAVE through the normal start menu, with explicit YES on each observed prompt.
   * Copies only bytes actually written by this operation, never calls writeSave. */
  async saveGame({ checkpointName, maxFrames = 6000 } = {}) {
    if (checkpointName !== undefined) {
      this.validateCheckpointName(checkpointName);
      if (localStorage.getItem(`fr-playtest-cp:${checkpointName}`) !== null)
        return { ok: false, status: "blocked", reason: "checkpoint-exists", note: "checkpoint exists" };
    }
    if (!Number.isInteger(maxFrames) || maxFrames < 1) throw new Error("invalid save budget");
    if (!this.fieldFree()) return { ok: false, status: "blocked", reason: "field-not-free", note: "field not free" };
    const S = await this.mod("/src/fr/save.ts"), SM = await this.mod("/src/fr/startMenu.ts");
    if (S.FlagGet(this.C.FLAG_SYS_SAFARI_MODE)) return { ok: false, status: "blocked", reason: "save-unavailable", note: "SAVE unavailable in Safari Zone" };
    const menu = { order: [], numItems: 0, pokedexObtained: S.FlagGet(this.C.FLAG_SYS_POKEDEX_GET),
      pokemonObtained: S.FlagGet(this.C.FLAG_SYS_POKEMON_GET), linkStateActive: false, inUnionRoom: false, inSafariZone: false };
    SM.SetUpStartMenu(menu);
    const index = menu.order.indexOf(4); // start_menu.c STARTMENU_SAVE
    if (index < 0) return { ok: false, status: "blocked", reason: "save-unavailable", note: "SAVE unavailable" };
    const before = this.saveSnapshot(), rawBefore = localStorage.getItem(SAVE_KEY);
    const goal = { kind: "save", started: false, menuUsed: false, prompts: 0, promptLog: [] };
    const run = await drive(this, { goal, label: "save", maxFrames, until: (rec) => goal.prompts > 0 && rec.screen === "field-free" });
    const prompts = goal.promptLog;
    if (!run.ok) return { ok: false, note: /^unexpected additional/.test(run.reason) ? run.reason : "SAVE did not finish and persist", before, after: this.saveSnapshot(), prompts,
      driver: { reason: run.reason, screen: run.rec?.screen, details: run.rec?.details, dump: run.dump } };
    const raw = localStorage.getItem(SAVE_KEY), after = this.saveSnapshot();
    if (!this.fieldFree() || after.saved !== before.saved + 1 || !raw || raw === rawBefore)
      return { ok: false, note: "SAVE did not finish and persist", before, after, prompts };
    const { saved: oldCounter, ...oldState } = before, { saved: newCounter, ...newState } = after;
    if (JSON.stringify(oldState) !== JSON.stringify(newState)) return { ok: false, note: "SAVE changed semantic state", before, after, prompts };
    const data = JSON.parse(raw);
    if (data.gameStats[this.C.GAME_STAT_SAVED_GAME] !== after.saved || data.pos.x !== after.x || data.pos.y !== after.y)
      return { ok: false, note: "written save does not match live state", before, after, prompts };
    const receipt = { source: "in-game-SAVE", before, after, prompts };
    if (checkpointName !== undefined) {
      if (localStorage.getItem(`fr-playtest-cp:${checkpointName}`) !== null) return { ok: false, note: "checkpoint appeared during SAVE" };
      localStorage.setItem(`fr-playtest-cp:${checkpointName}`, raw);
      localStorage.setItem(`fr-playtest-meta:${checkpointName}`, JSON.stringify(receipt));
    }
    return { ok: true, ...receipt, checkpointName: checkpointName ?? null, rawLength: raw.length };
  },
  /** Return exact persisted bytes and provenance, without manufacturing a save. */
  async checkpointData(name) {
    this.validateCheckpointName(name);
    const raw = localStorage.getItem(`fr-playtest-cp:${name}`);
    if (!raw) throw new Error(`no checkpoint ${name}`);
    const bytes = new TextEncoder().encode(raw), digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
    const provenance = JSON.parse(localStorage.getItem(`fr-playtest-meta:${name}`) ?? "null");
    return { name, raw, sha256, provenance };
  },
  /**
   * Debug checkpoint: Game.writeSave() plus a named copy in localStorage.
   * Not the in-game SAVE flow (test that separately through the start menu).
   */
  checkpoint(name) {
    this.validateCheckpointName(name);
    if (!this.fieldFree()) throw new Error("field not free for debug checkpoint");
    if (localStorage.getItem(`fr-playtest-cp:${name}`) !== null) throw new Error("checkpoint exists");
    if (!g().writeSave()) throw new Error("debug save failed");
    localStorage.setItem(`fr-playtest-cp:${name}`, localStorage.getItem(SAVE_KEY));
    localStorage.setItem(`fr-playtest-meta:${name}`, JSON.stringify({source: "PREPARED-debug-writeSave"}));
    return name;
  },
  /** Restore a checkpoint into the save slot; then load `?fr=continue`. */
  restore(name) {
    this.validateCheckpointName(name);
    const data = localStorage.getItem(`fr-playtest-cp:${name}`);
    if (!data) throw new Error(`no checkpoint ${name}`);
    localStorage.setItem(SAVE_KEY, data);
    location.href = `${location.pathname}?fr=continue`;
  },
  /**
   * Checkpoints in the repo (tools/playtest/saves/<name>.json) so they do not
   * live only in one browser. exportSave returns gzip+base64 of a checkpoint;
   * write it with: echo <b64> | base64 -d | gunzip > tools/playtest/saves/<name>.json
   */
  async exportSave(name) {
    this.validateCheckpointName(name);
    const data = localStorage.getItem(`fr-playtest-cp:${name}`);
    if (!data) throw new Error(`no checkpoint ${name}`);
    const gz = await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
    let bin = "";
    for (const b of new Uint8Array(gz)) bin += String.fromCharCode(b);
    return btoa(bin);
  },
  /** Load tools/playtest/saves/<name>.json as checkpoint <name> and restore it. */
  async importSave(name) {
    this.validateCheckpointName(name);
    const res = await fetch(`/tools/playtest/saves/${name}.json`);
    if (!res.ok) throw new Error(`no saved checkpoint ${name}`);
    const raw = await res.text(), data = JSON.parse(raw);
    if (!Array.isArray(data.party) || !data.location || !data.pos) throw new Error("invalid saved checkpoint");
    localStorage.setItem(`fr-playtest-cp:${name}`, raw);
    localStorage.setItem(`fr-playtest-meta:${name}`, JSON.stringify({source: "fixture", path: `/tools/playtest/saves/${name}.json`}));
    this.restore(name);
  },
  checkpoints() {
    return Object.keys(localStorage).filter((k) => k.startsWith("fr-playtest-cp:")).map((k) => k.slice(15));
  },
};
// Primitive predicates keep boolean returns. Public actions keep their existing
// payloads and add a common envelope; exceptions (including abort) propagate.
for (const name of ["walk", "goto", "exit", "enter", "face", "counter", "talk", "explore", "grind", "battle", "heal", "useItem", "prepareStep", "saveGame"]) {
  const action = H[name];
  H[name] = async function(...args) {
    this.checkExecution();
    const value = await action.apply(this, args);
    this.checkExecution();
    const result = value ?? this.st();
    if (result.status) return result;
    const note = result.note;
    const failed = result.ok === false || result.timeout || result.stuck || result.max ||
      note && note !== "map changed" || name === "battle" && this.battleStop(result);
    return { ...result, ok: !failed, status: failed ? "failure" : "success",
      reason: result.reason ?? result.stop ?? note ?? (result.max ? "step-budget" : failed ? "action-failed" : "completed"), action: name };
  };
}
const SAVE_KEY = "pokemon-gba-web-lab.firered.v2";
window.H = H;
