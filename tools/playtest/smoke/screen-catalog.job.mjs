// Screen catalog coverage (tools/playtest/driver/screens.js). Each case loads a checkpoint, drives the game to
// the screens it targets with the driver's real inputs (PREPARED input is declared per case) while
// H.trackScreens() records recognize() on every frame, then checks:
//   1. every screen the case targets was recognized (by name),
//   2. no frame was "unknown" (the dump of the first one is printed if it happens),
//   3. recognize() agrees with the legacy observe().fieldFree on every frame (field-free <=> fieldFree).
// The final line prints the coverage "N pantallas reconocidas" against CATALOG; screens no case can reach in the
// one-player game are listed with the reason (NOT_REACHED) and do not count as recognized.
const NOT_REACHED = {
  "battle-target": "only double battles ask for a target; the driver stops on double battles",
  "battle-nickname-yesno": "appears after catching a wild Pokemon; the driver never throws a Poke Ball (policy.catchWild=false)",
  "naming-screen": "needs a nickname prompt (Oak speech or a gift/catch); no checkpoint is in front of one",
};

const track = (body) => `
  H.trackScreens(true);
  let out, err = null;
  try { out = await (async () => { ${body} })(); } catch (e) { err = String(e?.stack ?? e); }
  const seen = H.trackScreens(false);
  return { out, err, seen };
`;

const CASES = [
  { name: "start-options-save", save: "mtmoon-1f", expect: ["field-free", "start-menu", "options-menu", "save-prompt", "save-busy"], body: `
      const C = H.C, S = await H.mod("/src/fr/save.ts"), SM = await H.mod("/src/fr/startMenu.ts");
      const menu = { order: [], numItems: 0, pokedexObtained: S.FlagGet(C.FLAG_SYS_POKEDEX_GET), pokemonObtained: S.FlagGet(C.FLAG_SYS_POKEMON_GET),
        linkStateActive: false, inUnionRoom: false, inSafariZone: false };
      SM.SetUpStartMenu(menu);
      const option = menu.order.indexOf(5); // start_menu.c STARTMENU_OPTION
      if (option < 0) throw new Error("OPTION not in the start menu");
      window.frGame.startMenuCursor = 0;
      await H.tap(8, 30);
      await H.until(() => H.hasTask("startInput"), null, 60);
      for (let i = 0; i < option; i++) await H.tap(0x80, 12);
      await H.tap(1, 30);
      await H.until(() => H.recognize().screen === "options-menu", null, 120);
      await H.tap(2, 40); // B leaves the options menu
      await H.until(() => H.fieldFree(), "B", 200);
      const saved = await H.saveGame();
      if (!saved.ok) throw new Error("SAVE: " + JSON.stringify(saved));
      return { option, saved: saved.ok };` },
  { name: "dialog-yesno", save: "mtmoon-1f", expect: ["field-free", "yes-no"], prepared: "ScriptMenu_YesNo opened directly (key handling only)", body: `
      const SM = await H.mod("/src/fr/menus/scriptMenu.ts");
      SM.ScriptMenu_YesNo(); await H.wait(2);
      const r = await H.answerYesNo(false);
      return r.ok;` },
  { name: "center-nurse-pc", save: "pewter-pc", expect: ["field-free", "dialog", "multichoice", "field-busy", "pc-menu"], body: `
      const T = H.T;
      // PC: the checkpoint stands at the PC; A opens it (menu is observed before any further input).
      await H.face("U");
      await H.until(() => H.recognize().screen === "dialog" || H.recognize().screen === "multichoice" || H.recognize().screen === "pc-menu", "A", 200);
      for (let i = 0; i < 6 && H.recognize().screen === "multichoice"; i++) { await H.wait(15); await H.press("A", 20); }
      await H.until(() => H.recognize().screen === "pc-menu", "A", 400);
      const atPc = H.recognize().screen;
      await H.until(() => H.fieldFree(), "B", 400);
      // Nurse: heal() talks to her, sees the offer and confirms.
      const healed = await H.heal({ leave: false });
      return { atPc, healed: healed.ok };` },
  { name: "party-bag-summary", save: "mtmoon-1f", expect: ["party-menu", "bag-menu", "bag-context", "item-use-animation", "summary-view"], prepared: "lead HP lowered so a Potion is usable", body: `
      const C = H.C, sv = frDebug.save.save;
      sv.party[0].hp = Math.max(1, sv.party[0].stats[0] - 15); // PREPARED
      if (!sv.bag.items.some(e => e.item === C.ITEM_POTION && e.quantity > 0)) sv.bag.items.push({ item: C.ITEM_POTION, quantity: 2 }); // PREPARED
      const used = await H.useItem(C.ITEM_POTION, 0);
      // Summary: START > POKEMON > A on the first member > SUMMARY.
      const S = await H.mod("/src/fr/save.ts"), SM = await H.mod("/src/fr/startMenu.ts");
      const menu = { order: [], numItems: 0, pokedexObtained: S.FlagGet(H.C.FLAG_SYS_POKEDEX_GET), pokemonObtained: S.FlagGet(H.C.FLAG_SYS_POKEMON_GET),
        linkStateActive: false, inUnionRoom: false, inSafariZone: false };
      SM.SetUpStartMenu(menu);
      const pokemon = menu.order.indexOf(1); // start_menu.c STARTMENU_POKEMON
      window.frGame.startMenuCursor = 0;
      await H.wait(60); // the START menu ignores input while it opens
      await H.tap(8, 30); await H.until(() => H.hasTask("startInput"), null, 60);
      await H.wait(30);
      for (let i = 0; i < pokemon; i++) await H.tap(0x80, 20);
      await H.tap(1, 40);
      await H.until(() => H.recognize().screen === "party-menu", null, 200);
      await H.wait(60);
      await H.tap(1, 30); // A on slot 0: member menu (submenu task)
      if (!await H.until(() => H.recognize().details?.submenu === true, null, 120)) throw new Error("member menu did not open: " + JSON.stringify(H.recognize().details));
      await H.wait(20); await H.tap(1, 30); // first entry of the field list: SUMMARY (sPartyMenuAction_SummarySwitchCancel)
      await H.until(() => H.recognize().screen === "summary-view", null, 300);
      await H.wait(60);
      const atSummary = H.recognize().screen;
      await H.until(() => H.fieldFree(), "B", 600);
      return { used: used.ok, atSummary };` },
  { name: "shop", save: "mart", expect: ["shop-menu", "shop-loading", "shop-list", "shop-quantity", "shop-confirm", "shop-message"], body: `
      const r = await H.buyItem(H.C.ITEM_POTION, 2);
      return r.ok;` },
  { name: "wild-battle-switch", save: "mtmoon-1f", expect: ["battle-transition", "battle-action", "battle-move", "battle-busy", "party-menu"], body: `
      for (let i = 0; i < 200 && !H.inBattle(); i++) await H.walk(i % 2 ? "D" : "U", 1);
      if (!H.inBattle()) throw new Error("no encounter");
      const b = await H.battle("switch", 0, 4000);
      return { stop: b.stop, outcome: b.outcome };` },
  { name: "levelup-learn-move", save: "route2-north", expect: ["battle-levelup-box", "battle-learn-yesno", "summary-forget-move"], prepared: "experience one point below level 20 (Razor Leaf)", body: `
      const C = H.C, mon = frDebug.save.save.party[0], P = await H.mod("/src/fr/pokemon/pokemon.ts");
      mon.exp = P.expForLevel(mon.species, 20) - 1; // PREPARED
      for (let i = 0; i < 200 && !H.inBattle(); i++) await H.walk(i % 2 ? "D" : "U", 1);
      if (!H.inBattle()) throw new Error("no encounter");
      const b = await H.battle("auto", 0, 6000);
      await H.idle(3000, true);
      return { stop: b.stop, level: mon.level };` },
  { name: "evolution", save: "route2-north", expect: ["evolution"], prepared: "experience one point below level 16 (Bulbasaur -> Ivysaur)", body: `
      const mon = frDebug.save.save.party[0], P = await H.mod("/src/fr/pokemon/pokemon.ts");
      mon.exp = P.expForLevel(mon.species, 16) - 1; mon.hp = 0; mon.stats = [0, 0, 0, 0, 0, 0]; P.calculateStats(mon); // PREPARED
      for (let i = 0; i < 200 && !H.inBattle(); i++) await H.walk(i % 2 ? "D" : "U", 1);
      if (!H.inBattle()) throw new Error("no encounter");
      const b = await H.battle("auto", 0, 6000);
      for (let i = 0; i < 40 && !H.fieldFree(); i++) await H.idle(1500, true);
      return { stop: b.stop, species: mon.species };` },
  { name: "evolution-learn", save: "route2-north", expect: ["evolution", "evolution-yesno", "summary-forget-move"], prepared: "Abra L15 with four moves one point below level 16 (Kadabra learns Confusion)", body: `
      const C = H.C, mon = frDebug.save.save.party[0], P = await H.mod("/src/fr/pokemon/pokemon.ts");
      mon.species = C.SPECIES_ABRA; mon.moves = [C.MOVE_TACKLE, C.MOVE_GROWL, C.MOVE_TAIL_WHIP, C.MOVE_LEER]; mon.pp = mon.moves.map(id => H.rom.moves[id].pp);
      mon.exp = P.expForLevel(mon.species, 16) - 1; mon.hp = 0; mon.stats = [0, 0, 0, 0, 0, 0]; P.calculateStats(mon); // PREPARED
      for (let i = 0; i < 200 && !H.inBattle(); i++) await H.walk(i % 2 ? "D" : "U", 1);
      if (!H.inBattle()) throw new Error("no encounter");
      const b = await H.battle("auto", 0, 6000);
      for (let i = 0; i < 40 && !H.fieldFree(); i++) await H.idle(1500, true);
      return { stop: b.stop, species: mon.species, moves: [...mon.moves] };` },
  { name: "whiteout", save: "mtmoon-1f", expect: ["whiteout-message", "dialog", "field-free"], prepared: "frGame.whiteOut() called directly (the aftermath of a lost battle, without fighting one)", body: `
      frGame.whiteOut();
      const r = await H.idle(9000, true);
      if (!r.ok || !/POKEMON_CENTER_1F$/.test(H.st().map)) throw new Error("whiteout did not end at a Pokemon Center with the field free: " + JSON.stringify({ ok: r.ok, reason: r.reason, map: H.st().map }));
      return { map: H.st().map, party: H.party() };` },
  { name: "trainer-battle", save: "mtmoon-1f", expect: ["battle-yesno"], prepared: "none; Josh's second Pokemon asks 'Will you switch?'", body: `
      const C = H.C, ow = frGame.overworld;
      ow.setWarpDestination(C.MAP_MT_MOON_1F >> 8, C.MAP_MT_MOON_1F & 255, -1, 14, 18); ow.warpIntoMapAndLoad();
      await H.until(() => H.st().map === H.rom.mapIdByNum(C.MAP_MT_MOON_1F) && H.fieldFree(), "A", 800);
      await frDebug.walk("U", 1);
      if (H.fieldFree()) await H.face("L");
      await frDebug.press("A");
      for (let i = 0; i < 200 && !H.inBattle(); i++) await frDebug.press("A", 4);
      const b = await H.battle("auto", 0, 4000);
      return { stop: b.stop, outcome: b.outcome };` },
];

export default async function run(ctx) {
  const results = [], recognized = new Set();
  const catalog = await (async () => { await ctx.loadSave("mtmoon-1f"); return ctx.runEval(`const m = await import("/tools/playtest/driver/screens.js"); return m.CATALOG;`); })();
  const only = process.env.CASE?.split(",");
  if (only?.some(name => !CASES.some(c => c.name === name))) throw new Error("unknown catalog CASE: " + only.join(","));
  for (const c of CASES) {
    if (only && !only.includes(c.name)) continue;
    if (c.save !== "mtmoon-1f" || results.length) await ctx.loadSave(c.save);
    const r = await ctx.runEval(track(c.body));
    const seen = r.seen.screens;
    const missing = c.expect.filter(s => !(s in seen));
    const row = { case: c.name, prepared: c.prepared ?? null, expect: c.expect, seen: Object.keys(seen), missing, unknown: r.seen.unknown, fieldFreeMismatch: r.seen.mismatch, err: r.err, out: r.out };
    results.push(row);
    process.stderr.write(`case ${c.name}: seen=${row.seen} missing=${row.missing} unknown=${JSON.stringify(row.unknown)} mismatch=${row.fieldFreeMismatch} err=${row.err?.slice(0, 300)}\n`);
    for (const s of Object.keys(seen)) recognized.add(s);
  }
  // Loading, map loading and Quest Log playback: H.ready() records what it saw while waiting for field control.
  await ctx.loadSave("cerulean-arrival");
  const ready = await ctx.runEval(`return H.readyScreens;`);
  const rrow = { case: "continue-quest-log", prepared: null, expect: ["quest-log"], seen: Object.keys(ready), missing: ["quest-log"].filter(s => !(s in ready)), unknown: ready.unknown ? ready.unknown : null, fieldFreeMismatch: 0, err: null, out: ready };
  results.push(rrow);
  for (const s of Object.keys(ready)) recognized.add(s);
  const unreached = catalog.filter(s => !recognized.has(s));
  const report = { scope: only ?? "full-catalog", recognized: [...recognized].sort(), unreached: unreached.map(s => ({ screen: s, reason: NOT_REACHED[s] ?? (only ? "NOT RUN (filtered catalog)" : "NOT COVERED") })), cases: results };
  const bad = results.filter(r => r.missing.length || r.unknown || r.fieldFreeMismatch || r.err);
  const uncovered = only ? [] : unreached.filter(s => !NOT_REACHED[s]);
  console.log(`${recognized.size} pantallas reconocidas de ${catalog.length} (${catalog.length - Object.keys(NOT_REACHED).length} alcanzables)`);
  if (ctx.errors().length) throw new Error(ctx.errors().join("; "));
  if (bad.length || uncovered.length) throw Object.assign(new Error("screen catalog: " + JSON.stringify({ bad, uncovered }).slice(0, 3000)), { result: report });
  return report;
}
