// Browser playtest driver for window.frDebug (dev server only).
// Load from the devtools console or a browser tool:
//   const { H } = await import("/tools/playtest/driver.js");
// Coordinates are the ones frDebug.state() reports (map coords, without the +7 border).
// Never walk while a script runs applymovement/waitmovement: goto()/path() only
// move when no script is active and controls are unlocked; idle() only taps A.
// Call `await H.init()` after every page load (see AGENTS.md §6.5).

import { rankMoves, hpItem, statusItem } from "./strategy.js";

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
    this.PM = await this.mod("/src/fr/partyMenu.ts");
    this.C = await this.mod("/src/fr/generated/constants.ts");
    this.rom = (await this.mod("/src/fr/rom.ts")).rom;
    this.T = await this.mod("/src/fr/gba/tasks.ts");
    this.B = await this.mod("/src/fr/bagMenu.ts");
    this.BS = await this.mod("/src/fr/battle/bscript.ts");
    return { cb2: this.R.gMain.callback2?.name };
  },
  /** After restore()/importSave(): run frames until the field map is loaded, then init(). */
  async ready(maxFrames = 1200) {
    for (let f = 0; f < maxFrames && !dbg()?.state?.()?.map; f += 20) {
      if (dbg()?.wait) await dbg().wait(20); else await new Promise((r) => setTimeout(r, 200));
    }
    await this.init();
    return dbg().state();
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
      if (this.fieldFree() && f > 40) return { ...s, f };
      await dbg().wait(16);
      if (tapA) await dbg().wait(4, 1);
    }
    return { ...this.st(), timeout: true };
  },
  // Thresholds are walkthrough policy, not FireRed rules. Explicit fight/run
  // modes keep their existing behavior for C5/C7 and diagnostics.
  policy: { fieldHp: 0.6, battleHp: 0.4, minAttackPP: 2, reservePotions: 1, maxDecisions: 80, maxUnchanged: 6 },
  fieldFree() {
    const state = this.st();
    return !state.script && !state.locked && !g().scene && !this.T?.tasks.tasks.some(t => t.isActive &&
      ["startInput", "Task_PCMainMenu", "Task_MultichoiceMenu_HandleInput", "Task_YesNoMenu_HandleInput"].includes(t.func.name));
  },
  async tap(bits, settle = 16) { await dbg().wait(2, bits); await dbg().wait(settle); },
  async until(test, button = null, limit = 180) {
    for (let i = 0; i < limit; i++) {
      if (test()) return true;
      if (button) await dbg().press(button, 4);
      await dbg().wait(8);
    }
    return test();
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
  bestMoves(mon = this.G.gBattleMons[0], foe = this.G.gBattleMons[1]) {
    const d = this.G.gDisableStructs[0];
    return rankMoves(mon, foe, this.rom, this.C, mon === this.G.gBattleMons[0] ?
      { disabledMove: d.disabledMove, encoredMove: d.encoreTimer ? d.encoredMove : 0 } : {});
  },
  bestReplacement(healthy = false) {
    const active = this.G.gBattleMons[0];
    const choices = dbg().save.save.party.map((m, target) => {
      if (!m.species || m.isEgg || m.hp <= 0 || m.personality === active.personality
          || healthy && m.hp / m.stats[0] < this.policy.fieldHp) return null;
      const attacks = this.bestMoves(this.partyBattleMon(m));
      return attacks.length ? { target, score: attacks[0].score * m.hp / m.stats[0] } : null;
    }).filter(Boolean).sort((a, b) => b.score - a.score || a.target - b.target);
    return choices[0]?.target ?? -1;
  },
  recoverReplacement() {
    const active = this.G.gBattleMons[0], bag = dbg().save.save.bag.items;
    const choices = dbg().save.save.party.map((m, target) => {
      if (!m.species || m.isEgg || m.hp <= 0 || m.personality === active.personality) return null;
      const next = this.partyBattleMon(m), attacks = this.bestMoves(next), heal = hpItem(next, bag, this.C);
      // Recover a usable reserve with one real medicine, then reconsider switching.
      if (!attacks.length || !heal || (next.hp + heal.restores) / next.maxHP < this.policy.fieldHp) return null;
      return { target, personality: m.personality, otId: m.otId, item: heal.item,
        score: attacks[0].score * (next.hp + heal.restores) / next.maxHP };
    }).filter(Boolean).sort((a, b) => b.score - a.score || a.target - b.target);
    const choice = choices[0];
    return choice ? { action: "item", ...choice, reason: "recover attacking reserve" } : null;
  },
  battleDecision(incoming = 0) {
    const C = this.C, flags = this.G.G.gBattleTypeFlags;
    if (flags & (C.BATTLE_TYPE_DOUBLE | C.BATTLE_TYPE_LINK | C.BATTLE_TYPE_SAFARI | C.BATTLE_TYPE_POKEDUDE | C.BATTLE_TYPE_OLD_MAN_TUTORIAL)) {
      return { action: "stop", reason: "unsupported battle format" };
    }
    const mon = this.G.gBattleMons[0], bag = dbg().save.save.bag.items;
    const low = mon.hp <= Math.max(mon.maxHP * this.policy.battleHp, incoming * 1.5);
    const heal = hpItem(mon, bag, C);
    const attacks = this.bestMoves();
    if (!attacks.length) {
      const target = this.bestReplacement(true);
      if (target >= 0) return { action: "switch", target, personality: dbg().save.save.party[target].personality, reason: "no usable attack" };
      const recovery = this.recoverReplacement();
      if (recovery) return recovery;
      return flags & C.BATTLE_TYPE_TRAINER ? { action: "stop", reason: "resources exhausted in trainer battle" }
        : { action: "run", reason: "resources exhausted in wild battle" };
    }
    if (low && heal) return { action: "item", item: heal.item, reason: "low hp", incoming };
    const cure = statusItem(mon.status1, bag, C);
    if (cure) return { action: "item", item: cure, reason: "status" };
    const better = this.bestReplacement(true);
    if (attacks[0].effectiveness < 1 && better >= 0) {
      const next = this.partyBattleMon(dbg().save.save.party[better]);
      const best = this.bestMoves(next)[0];
      if (next.hp / next.maxHP >= this.policy.fieldHp && best.score > attacks[0].score * 1.8) return { action: "switch", target: better, personality: dbg().save.save.party[better].personality, reason: "better attack matchup" };
    }
    if (low && !heal) {
      const target = this.bestReplacement(true);
      if (target >= 0) return { action: "switch", target, personality: dbg().save.save.party[target].personality, reason: "low hp without medicine" };
      return flags & C.BATTLE_TYPE_TRAINER ? { action: "stop", reason: "resources exhausted in trainer battle" }
        : { action: "run", reason: "resources exhausted in wild battle" };
    }
    return { action: "move", ...attacks[0], reason: "ranked attack" };
  },
  async selectPartySlot(target) {
    for (let i = 0; i < 16 && this.PM.gPartyMenu.slotId !== target; i++) {
      await this.tap(this.PM.gPartyMenu.slotId < target ? 0x80 : 0x40, 20);
    }
    return this.PM.gPartyMenu.slotId === target;
  },
  /** Use one supported medicine through BAG > USE > the observed party slot.
   * No item-effect function is called. Result includes actual consumption. */
  async useItem(item, target, { battle = false } = {}) {
    const before = this.resources(), mon = dbg().save.save.party[target];
    const hpItems = [this.C.ITEM_POTION, this.C.ITEM_SUPER_POTION, this.C.ITEM_HYPER_POTION, this.C.ITEM_MAX_POTION];
    const statusItems = [this.C.ITEM_ANTIDOTE, this.C.ITEM_PARALYZE_HEAL, this.C.ITEM_BURN_HEAL, this.C.ITEM_ICE_HEAL, this.C.ITEM_AWAKENING];
    if (!mon?.species || mon.isEgg || mon.hp <= 0 || !hpItems.includes(item) && !statusItems.includes(item)
        || this.countItem(item) < 1) return { ok: false, note: "medicine unavailable or invalid target", before };
    const count = this.countItem(item);
    const hp0 = mon.hp, status0 = mon.status;
    if (battle) {
      if (this.G.gBattlerControllerFuncs[0]?.name !== "HandleInputChooseAction") return { ok: false, note: "battle action not ready" };
      for (let i = 0; i < 8 && this.G.gActionSelectionCursor[0] !== 1; i++) {
        const c = this.G.gActionSelectionCursor[0];
        await this.tap(c & 1 ? 0x40 : 0x10);
      }
      await dbg().press("A");
    } else {
      if (!this.fieldFree()) return { ok: false, note: "field not free", before };
      const S = await this.mod("/src/fr/save.ts");
      const SM = await this.mod("/src/fr/startMenu.ts");
      const menu = { order: [], numItems: 0, pokedexObtained: S.FlagGet(this.C.FLAG_SYS_POKEDEX_GET),
        pokemonObtained: S.FlagGet(this.C.FLAG_SYS_POKEMON_GET), linkStateActive: false, inUnionRoom: false, inSafariZone: false };
      SM.SetUpStartMenu(menu);
      const want = menu.order.indexOf(2); // start_menu.c STARTMENU_BAG
      if (want < 0) return { ok: false, note: "bag not in start menu" };
      const cursor = g().startMenuCursor;
      await this.tap(8, 60);
      if (!await this.until(() => this.hasTask("startInput"))) return { ok: false, note: "start menu did not open" };
      for (let i = 0; i < (want - cursor + menu.numItems) % menu.numItems; i++) await this.tap(0x80);
      await this.tap(1, 30);
    }
    if (!await this.until(() => this.cb2() === "CB2_BagMenuRun" && this.hasTask("Task_BagMenu_HandleInput"))) return { ok: false, note: "bag did not open" };
    await dbg().wait(60);
    for (let i = 0; i < 4 && this.B.gBagMenuState.pocket !== this.C.OPEN_BAG_ITEMS; i++) await this.tap(0x20, 60);
    if (this.B.gBagMenuState.pocket !== this.C.OPEN_BAG_ITEMS) return { ok: false, note: "items pocket unavailable" };
    const index = dbg().save.save.bag.items.findIndex(e => e.item === item && e.quantity > 0);
    const bagCursor = () => this.B.gBagMenuState.cursorPos[0] + this.B.gBagMenuState.itemsAbove[0];
    for (let i = 0; i < 60 && bagCursor() !== index; i++) await this.tap(bagCursor() < index ? 0x80 : 0x40, 18);
    if (index < 0 || bagCursor() !== index) return { ok: false, note: "medicine cursor not reached" };
    await this.tap(1, 40);
    if (!await this.until(() => this.hasTask("Task_FieldItemContextMenuHandleInput")) || this.B.bagResult.itemId !== item) return { ok: false, note: "wrong medicine selected" };
    await this.tap(1, 40);
    if (!await this.until(() => this.cb2() === "CB2_UpdatePartyMenu" && this.hasTask("Task_HandleChooseMonInput"))) return { ok: false, note: "medicine party menu missing" };
    const menuSlot = dbg().save.save.party.findIndex(m => m.personality === mon.personality && m.otId === mon.otId);
    if (menuSlot < 0 || !await this.selectPartySlot(menuSlot)) return { ok: false, note: "medicine target not reached" };
    await this.tap(1, 40);
    if (!await this.until(() => this.countItem(item) < count, "A")) return { ok: false, note: "medicine not consumed", before, after: this.resources() };
    // Acknowledgement uses B to avoid selecting another Pokémon/item.
    const finished = await this.until(() => battle ? this.G.gBattlerControllerFuncs[0]?.name === "HandleInputChooseAction" && this.cb2() === "BattleMainCB2" : this.fieldFree(), "B", 300);
    const after = this.resources();
    const changed = hpItems.includes(item) ? mon.hp > hp0 : mon.status !== status0;
    const ok = finished && this.countItem(item) === count - 1 && changed;
    const result = { ok, note: ok ? null : "medicine did not complete correctly", item, target, before, after };
    this.log.push({ medicine: result });
    return result;
  },
  /** Heal before walking; stop for exhausted PP, fainted members or no reserves. */
  async prepareStep() {
    if (!this.fieldFree()) return { ok: false, note: "field not free", resources: this.resources() };
    const snapshot = this.resources();
    if (!snapshot.party.length || snapshot.party.some(m => m.hp <= 0 || m.attackPP < this.policy.minAttackPP)) return { ok: false, note: "return to center: hp or pp exhausted", resources: snapshot };
    for (const m of snapshot.party) {
      const cure = statusItem(m.status, dbg().save.save.bag.items, this.C);
      if (m.status && !cure) return { ok: false, note: "return to center: untreated status", resources: this.resources() };
      if (cure) { const used = await this.useItem(cure, m.slot); if (!used.ok) return { ...used, resources: this.resources() }; }
      for (let attempts = 0; attempts < 4 && dbg().save.save.party[m.slot].hp / m.maxHP < this.policy.fieldHp; attempts++) {
        const heal = hpItem({ hp: dbg().save.save.party[m.slot].hp, maxHP: m.maxHP }, dbg().save.save.bag.items, this.C);
        const stock = [this.C.ITEM_POTION, this.C.ITEM_SUPER_POTION, this.C.ITEM_HYPER_POTION, this.C.ITEM_MAX_POTION].reduce((n, id) => n + this.countItem(id), 0);
        if (!heal || stock <= this.policy.reservePotions) return { ok: false, note: "return to center: low hp and medicine reserve", resources: this.resources() };
        const used = await this.useItem(heal.item, m.slot);
        if (!used.ok) return { ...used, resources: this.resources() };
      }
      if (dbg().save.save.party[m.slot].hp / m.maxHP < this.policy.fieldHp) return { ok: false, note: "return to center: healing budget", resources: this.resources() };
    }
    return { ok: true, resources: this.resources() };
  },
  /**
   * Finish the current battle with real button presses.
   * mode "auto": rank attacks, use medicine, switch/escape with resource guards.
   * mode "fight": FIGHT, then the move in `slot` (0 TL, 1 TR, 2 BL, 3 BR);
   * mode "run": RUN; mode "switch": shift the lead to party slot 1 on the
   * first turn, then fight with `slot`. With init() the cursor positions are read from
   * gActionSelectionCursor/gMoveSelectionCursor, so presses are never blind;
   * other screens (text, learn-move prompt, summary) get A.
   */
  async battle(mode = "auto", slot = 0, maxSteps = 4000) {
    const start = this.party();
    const screens = new Set();
    let n = 0, stop = null, decision = null, decisions = 0, unchanged = 0, lastKey = null, lastHp = null, incoming = 0;
    const trace = [];
    const press = async (bits) => { await dbg().wait(2, bits); await dbg().wait(4); };
    while (this.inBattle() && n < maxSteps) {
      n++;
      screens.add(this.cb2());
      // battle_script_commands.c 0x5A/0x5B: keep existing moves when full.
      // Decline replacement and confirm stopping learning through real input.
      if (mode === "auto" && this.G.gBattleScripting.learnMoveState === 1) {
        const opcode = this.BS.r8(this.G.G.gBattlescriptCurrInstr);
        if (opcode === 0x5a) {
          trace.push({ action: "decline replacement", move: this.G.G.gMoveToLearn });
          await dbg().press("B", 8); continue;
        }
        if (opcode === 0x5b) {
          if (this.G.gBattleCommunication[this.C.CURSOR_POSITION] !== 0) await this.tap(0x40);
          await dbg().press("A", 8); continue;
        }
      }
      const f = this.G?.gBattlerControllerFuncs[0]?.name;
      if (f === "HandleInputChooseAction") {
        if (decision?.action === "switch" && this.G.gBattleMons[0].personality === decision.personality) decision = null;
        if (mode === "auto" && !decision) {
          const mons = this.G.gBattleMons;
          const active = this.G.gBattlerPartyIndexes[0];
          const key = JSON.stringify([mons[1].species, mons[1].hp, mons[1].status1]);
          unchanged = key === lastKey ? unchanged + 1 : 0;
          incoming = lastHp?.active === active ? Math.max(0, lastHp.hp - mons[0].hp) : 0;
          lastHp = { active, hp: mons[0].hp }; lastKey = key;
          if (++decisions > this.policy.maxDecisions || unchanged >= this.policy.maxUnchanged) { stop = "decision budget"; break; }
          decision = this.battleDecision(incoming);
          trace.push({ ...decision, remainingPP: decision.pp, active, hp: mons[0].hp, foe: mons[1].species, foeHp: mons[1].hp, pp: [...mons[0].pp] });
          if (decision.action === "stop") { stop = decision.reason; break; }
          if (decision.action === "item") {
            const personality = decision.personality ?? mons[0].personality;
            const otId = decision.otId ?? mons[0].otId;
            const fieldSlot = dbg().save.save.party.findIndex(m => m.species && m.personality === personality && m.otId === otId);
            const used = await this.useItem(decision.item, fieldSlot, { battle: true });
            trace.at(-1).used = used;
            decision = null;
            if (!used.ok) { stop = used.note; break; }
            continue;
          }
        }
        // mode "switch": the lead comes out, then shift to party slot 1 so both
        // share the experience (a normal player technique).
        const wantSwitch = mode === "switch" && this.G.gBattlerPartyIndexes?.[0] === 0 && dbg().save.save.party[1]?.hp > 0;
        const want = mode === "run" || decision?.action === "run" ? 3 : wantSwitch || decision?.action === "switch" ? 2 : 0, c = this.G.gActionSelectionCursor[0];
        if (c !== want) { await press((c & 1) < (want & 1) ? 0x10 : (c & 1) > (want & 1) ? 0x20 : (c >> 1) < (want >> 1) ? 0x80 : 0x40); continue; }
        await dbg().press("A");
        if (decision?.action === "run") decision = null;
        continue;
      }
      if (f === "HandleInputChooseMove") {
        const c = this.G.gMoveSelectionCursor[0];
        // With 0 PP the C prints "There's no PP left…" and returns to move
        // selection: pick another slot with PP, or it loops forever.
        const pp = this.G.gBattleMons?.[0]?.pp;
        // `slot` may be a function of the active species: { 16: 2, 2: 3 }[species].
        let want = mode === "auto" ? this.bestMoves()[0]?.slot : typeof slot === "function" ? slot(this.G.gBattleMons?.[0]?.species) : slot;
        if (mode === "auto" && want === undefined) { stop = "no usable attack"; break; }
        if (pp && pp[want] === 0) for (let i = 0; i < 4; i++) if (pp[i] > 0) { want = i; break; }
        if (c !== want) { await press((c & 1) < (want & 1) ? 0x10 : (c & 1) > (want & 1) ? 0x20 : (c >> 1) < (want >> 1) ? 0x80 : 0x40); continue; }
        await dbg().press("A");
        decision = null;
        continue;
      }
      if (f === "WaitForMonSelection" && this.PM && this.cb2() === "CB2_UpdatePartyMenu") {
        // Forced switch after a faint: go to the first able Pokémon, then SHIFT.
        // Pressing A on the fainted one only prints "has no energy left" forever.
        const party = dbg().save.save.party;
        const active = this.G.gBattlerPartyIndexes?.[0];
        const target = decision?.action === "switch" ? dbg().save.save.party.findIndex(m => m.personality === decision.personality) : mode === "auto" ? this.bestReplacement() : mode === "switch" && active === 0 && party[1]?.hp > 0 ? 1
          : party.findIndex((m, i) => i !== active && m.species && !m.isEgg && m.hp > 0);
        if (target < 0) { stop = "no able replacement"; break; }
        const cur = this.PM.gPartyMenu.slotId;
        if (target >= 0 && cur !== target) { await press(0x80); continue; }
        await dbg().press("A", 20);
        if (this.cb2() !== "CB2_UpdatePartyMenu") decision = null;
        continue;
      }
      await dbg().press("A", 8);
    }
    const stuck = this.inBattle();
    if (stuck && !stop) stop = "step budget";
    await dbg().wait(30);
    const r = { battle: mode, slot, n, start, end: this.party(), outcome: g().battleOutcome, map: dbg().state().map, stuck, stop, decisions, trace, screens: [...screens].filter(Boolean) };
    this.log.push(r);
    return r;
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
      await this.idle(600, false);
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
    // press()/wait() advance batches of frames: an A batch can create and then
    // dismiss the offer before until() observes it. Inspect every frame, release
    // between key edges, and stop advancing A as soon as the offer exists.
    let offered = false;
    for (let frame = 0; frame < 3000; frame++) {
      if (this.hasTask("Task_MultichoiceMenu_HandleInput")) { offered = true; break; }
      dbg().run(1, frame % 32 === 0 ? 1 : 0);
      if (frame % 16 === 15) await new Promise(resolve => setTimeout(resolve, 1));
    }
    if (!offered) offered = this.hasTask("Task_MultichoiceMenu_HandleInput");
    dbg().run(1); // release A before the explicit YES confirmation
    if (!offered) return { ok: false, note: "nurse offer missing", before };
    // Nurse offer opens at YES. Never walk through the healing movement script.
    await dbg().wait(30); await dbg().press("A");
    if (!await this.until(() => this.fieldFree(), "A", 500)) return { ok: false, note: "nurse did not return control" };
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
      if (lead().hp < lead().stats[0] * minHp) return { stop: "lowhp", party: this.party() };
      const saved = this.battleDefaults;
      this.battleDefaults = { mode: "fight", slot };
      try {
        for (const tile of [a, b]) {
          const r = await this.goto(...tile);
          if (r.note) return { stop: r.note, state: r };
        }
      } finally { this.battleDefaults = saved; }
    }
    return { stop: "loops", party: this.party() };
  },
  battleDefaults: { mode: "auto", slot: 0 },
  /** Shortest path in map-internal coords (+7), using the live collision checks. */
  bfs(tx, ty) {
    const ow = g().overworld, player = ow.player.object, objects = ow.objects;
    const sx = player.currentCoords.x, sy = player.currentCoords.y;
    const key = (x, y) => `${x},${y}`;
    // Never step on a warp (door, ladder, stairs) unless it is the target.
    const warps = new Set(ow.loaded.header.warps.map((w) => key(w.x + 7, w.y + 7)));
    const prev = new Map([[key(sx, sy), null]]);
    const queue = [[sx, sy]];
    while (queue.length) {
      const [x, y] = queue.shift();
      if (x === tx && y === ty) break;
      for (const [dx, dy, dir, , name] of DIRS) {
        let nx = x + dx, ny = y + dy;
        const c = objects.GetCollisionAtCoords(player, nx, ny, dir);
        if (c === COLLISION_LEDGE_JUMP) { nx += dx; ny += dy; }
        else if (c !== COLLISION_NONE && !(nx === tx && ny === ty && c === COLLISION_OBJECT_EVENT)) continue;
        const k = key(nx, ny);
        if (prev.has(k)) continue;
        if (warps.has(k) && !(nx === tx && ny === ty)) continue;
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
        if (r.timeout) return { ...r, note: "script stuck" };
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
      await dbg().walk(steps[0], 1);
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
        if (settled.timeout) return { ...settled, note: "script stuck" };
        if (settled.battle) continue;
      }
      if (this.battleDefaults.mode === "auto" && !opts.recovery) {
        const health = await this.prepareStep();
        if (!health.ok) return { ...this.st(), note: health.note, resources: health.resources };
      }
      await dbg().walk(dir, 1);
      for (let t = 0; t < 60; t++) {
        if (this.inBattle()) {
          const b = await this.battle(this.battleDefaults.mode, this.battleDefaults.slot);
          const note = this.battleStop(b);
          if (note) return { ...this.st(), note, battleResult: b };
        }
        const s = this.st();
        if (s.map !== map0 && !s.locked) return s;
        if (s.map === map0 && !s.locked && !s.script && t > 2) break;
        await dbg().wait(30);
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
  /**
   * Checkpoints in the repo (tools/playtest/saves/<name>.json) so they do not
   * live only in one browser. exportSave returns gzip+base64 of a checkpoint;
   * write it with: echo <b64> | base64 -d | gunzip > tools/playtest/saves/<name>.json
   */
  async exportSave(name) {
    const data = localStorage.getItem(`fr-playtest-cp:${name}`);
    if (!data) throw new Error(`no checkpoint ${name}`);
    const gz = await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
    let bin = "";
    for (const b of new Uint8Array(gz)) bin += String.fromCharCode(b);
    return btoa(bin);
  },
  /** Load tools/playtest/saves/<name>.json as checkpoint <name> and restore it. */
  async importSave(name) {
    const res = await fetch(`/tools/playtest/saves/${name}.json`);
    if (!res.ok) throw new Error(`no saved checkpoint ${name}`);
    localStorage.setItem(`fr-playtest-cp:${name}`, await res.text());
    this.restore(name);
  },
  checkpoints() {
    return Object.keys(localStorage).filter((k) => k.startsWith("fr-playtest-cp:")).map((k) => k.slice(15));
  },
};
const SAVE_KEY = "pokemon-gba-web-lab.firered.v2";
window.H = H;
