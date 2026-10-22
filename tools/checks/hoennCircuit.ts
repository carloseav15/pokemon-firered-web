// Hoenn circuit (step 3 of the Hoenn order in docs/HOJA-DE-RUTA.md): the viewer's EngineInteraction
// running pokeemerald content (DATA_ROOT "/emerald") through Oldale Town and Route 101, driven the way
// src/viewer/main.ts drives it (enterMap, show, interactFront, tryEmeraldStep) with keypresses on the
// engine frames. Expected values are read from the pokeemerald source checkout ($POKEEMERALD or
// ../refs-src/pokeemerald, as tools/decomp/common.py resolves it): map scripts and texts
// (data/maps/*/scripts.inc), mart lists, item prices (src/data/items.h), the wild table
// (src/data/wild_encounters.json) and heal locations (src/data/heal_locations.json).
// Scope: engine state and the world save with a mocked DOM/localStorage; no browser, no rendering check.
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------- DOM / frame mocks (PREPARED harness)
type Fake = Record<string, unknown>;
/** A 2D context whose drawing calls do nothing; pixel buffers have their requested size. */
const context2d = (): unknown => new Proxy({} as Fake, {
  get: (target, key) => key in target ? target[key as string]
    : key === "createImageData" ? (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
    : key === "getImageData" ? (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
    : () => undefined,
  set: (target, key, value) => { target[key as string] = value; return true; },
});
const element = (): Fake => {
  const el: Fake = {
    style: {}, dataset: {}, hidden: false, width: 0, height: 0, id: "", tabIndex: 0, textContent: "",
    setAttribute() {}, append() {}, remove() {}, focus() {}, parentElement: null,
    getContext: () => context2d(),
  };
  return el;
};
const g = globalThis as unknown as Fake;
(g.document as Fake).createElement = element;
(g.document as Fake).body = { append() {}, remove() {} };
g.addEventListener = () => {};
g.removeEventListener = () => {};
let rafQueue: Array<(now: number) => void> = [];
let clock = 0;
g.requestAnimationFrame = (cb: (now: number) => void) => { rafQueue.push(cb); return rafQueue.length; };
g.cancelAnimationFrame = () => {};
const storage = new Map<string, string>();
g.localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v); }, removeItem: (k: string) => { storage.delete(k); } };
{
  // Missing files 404 (the engine's own loaders fall back to the FireRed export where they are meant to).
  const base = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/") && !existsSync(process.cwd() + "/public" + url)) return new Response("", { status: 404 });
    return base(input as RequestInfo, init);
  }) as typeof fetch;
}

// Unported specials / script commands only warn at run time: collect them so the circuit can require none.
const warnings: string[] = [];
{ const warn = console.warn; console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ")); warn(...args); }; }
const { rom, setDataRoot } = await import("../../src/core/rom.ts");
const { SetTilesetProfile } = await import("../../src/core/field/fieldmap.ts");
setDataRoot("/emerald");
SetTilesetProfile("emerald");
rom.constants = JSON.parse(readFileSync("public/emerald/constants.json", "utf8"));
rom.charmap = JSON.parse(readFileSync("public/emerald/charmap.json", "utf8"));
await rom.load();
const C = await import("../../src/games/firered/generated/constants.ts");
const EM = await import("../../src/games/emerald/generated/constants.ts");
const saveModule = await import("../../src/games/firered/save.ts");
const { flagGet, flagSet, newSaveData, setSave, varGet, varSet } = saveModule;
/** The live SaveBlock (setSave replaces it, so it is read through the module namespace). */
const live = () => saveModule.save;
const { encode } = await import("../../src/core/gba/charmap.ts");
const { stringVars } = await import("../../src/core/gba/stringBuffers.ts");
const { joy, A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_RIGHT } = await import("../../src/core/gba/input.ts");
const { createMon } = await import("../../src/core/pokemon/pokemon.ts");
const { checkBagHasItem } = await import("../../src/core/pokemon/items.ts");
const { incbinFallbacks, cdataFallbacks } = await import("../../src/core/hw/assets.ts");
const { textFallbacks } = await import("../../src/core/rom.ts");
const { lastGeneratedWildMon } = await import("../../src/games/emerald/wildEncounter.ts");
const EMB = await import("../../src/games/emerald/generated/metatileBehavior.ts");
const { G, gBattlerControllerFuncs } = await import("../../src/core/battle/globals.ts");
const { enterKanto, reloadWorldSave, writeWorldSave, WORLD_SAVE_KEY } = await import("../../src/viewer/regionSave.ts");
type WorldSaveData = import("../../src/viewer/regionSave.ts").WorldSaveData;
const { continueRegionalSession, initializeRegionalSession, resetViewerSessionInitialized, saveViewerSession } = await import("../../src/viewer/session.ts");
const { EngineInteraction } = await import("../../src/viewer/engineInteraction.ts");
const { gMain } = await import("../../src/core/hw/runtime.ts");
const { FRAME_MS } = await import("../../src/games/firered/game.ts");
type NavigationSave = import("../../src/viewer/session.ts").NavigationSave;

// ---------------------------------------------------------------- pokeemerald source
const decomp = process.env.POKEEMERALD ? resolve(process.env.POKEEMERALD) : resolve(process.cwd(), "../refs-src/pokeemerald");
assert.ok(existsSync(resolve(decomp, "data/maps/OldaleTown/scripts.inc")), `pokeemerald source not found at ${decomp} (set POKEEMERALD)`);
const src = (path: string): string => readFileSync(resolve(decomp, path), "utf8");
/** The bytes of an assembled `.string` label: charmap characters, \n, \l, \p and the $ terminator. */
function sourceText(path: string, label: string): Uint8Array {
  const lines = src(path).split("\n");
  const start = lines.findIndex(l => l.trim() === `${label}:` || l.trim() === `${label}::`);
  assert.ok(start >= 0, `${label} in ${path}`);
  const out: number[] = [];
  for (const line of lines.slice(start + 1)) {
    const m = /^\s*\.string "(.*)"\s*$/.exec(line);
    if (!m) break;
    const body = m[1]!;
    for (let i = 0; i < body.length; i++) {
      const c = body[i]!;
      if (c === "\\") {
        const e = body[++i];
        out.push(e === "n" ? 0xfe : e === "l" ? 0xfa : e === "p" ? 0xfb : (() => { throw Error(`escape \\${e}`); })());
      } else if (c === "$") { out.push(0xff); return Uint8Array.from(out); }
      else out.push(...encode(c, false));
    }
  }
  throw Error(`${label}: no terminator`);
}
/** `.2byte ITEM_*` entries of a mart list label up to pokemartlistend. */
function sourceMart(path: string, label: string): number[] {
  const lines = src(path).split("\n");
  const start = lines.findIndex(l => l.trim() === `${label}:`);
  assert.ok(start >= 0, `${label} in ${path}`);
  const items: number[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "pokemartlistend") return items;
    const m = /^\s*\.2byte (ITEM_\w+)/.exec(line);
    assert.ok(m, `unexpected line in ${label}: ${line}`);
    items.push((EM as Record<string, number>)[m[1]!]!);
  }
  throw Error(`${label}: no pokemartlistend`);
}
function sourcePrice(itemConst: string): number {
  const m = new RegExp(`\\[${itemConst}\\] =\\s*\\{[^}]*?\\.price = (\\d+),`, "s").exec(src("src/data/items.h"));
  assert.ok(m, `${itemConst} price in src/data/items.h`);
  return Number(m[1]);
}

// ---------------------------------------------------------------- engine driver
const recoveryRelocations: NavigationSave[] = [];
const engine = new EngineInteraction({
  pause() {}, project() {}, hideObjects() {}, relocate(nav) { recoveryRelocations.push(structuredClone(nav)); }, readObjects: () => [],
  mapOrigin: () => ({ x: 0, y: 0, width: 0, height: 0 }) as never, syncObjects() {}, setBike() {},
});
/** Run queued animation frames (one engine frame each) until `done` or the frame budget ends. */
async function pump(maxFrames: number, input: (frame: number) => number = () => 0, done: () => boolean = () => !engine.open): Promise<number> {
  let idle = 0;
  for (let f = 0; f < maxFrames; f++) {
    if (done()) return f;
    const queue = rafQueue; rafQueue = [];
    // No frame requested: an asynchronous load is pending; wait for it without spending the frame budget.
    if (!queue.length) { if (++idle > 5000) break; await new Promise(r => setTimeout(r, 1)); f--; continue; }
    const keys = input(f);
    if (keys) joy.press(keys); else joy.release(A_BUTTON | B_BUTTON | DPAD_DOWN | DPAD_RIGHT);
    clock += FRAME_MS;
    for (const cb of queue) cb(clock);
    // Let the engine's promise continuations (asset loads behind a screen) run between frames, as in a browser.
    await new Promise(r => setImmediate(r));
    if (process.env.TRACE) {
      const root = (engine as unknown as { root: { dataset: Record<string, string> } }).root.dataset;
      const line = `${root.script}|${root.native}|${root.mode}|${root.battle}|${root.scriptActive}|tasks=${(await import("../../src/core/gba/tasks.ts")).tasks.tasks.filter(t => t.isActive).map(t => t.func?.name).join(",")}|money=${live().money}`;
      if (line !== lastTrace) { console.log(f, line); lastTrace = line; }
    }
  }
  return maxFrames;
}
let lastTrace = "";
/** A tap every 24 frames: advances messages without holding keys. */
const tap = (keys: number) => (f: number) => (f % 24 === 12 ? keys : 0);
const facingNav = (mapId: string, x: number, y: number, direction: NavigationSave["direction"]): NavigationSave => ({ mapId, x, y, direction, dynamic: null });

// ---------------------------------------------------------------- PREPARED trainer
// A stored Kanto trainer (the shared party/money/bag) enters Hoenn for the first time.
const data: WorldSaveData = newSaveData();
data.playerName = Array.from(encode("RED"));
data.playerGender = C.MALE;
data.viewerStart = "definitive-kanto-v1";
data.money = 3000;
setSave(data);
enterKanto();
live().location = { mapGroup: 3, mapNum: 0, warpId: -1, x: 5, y: 6 };
live().pos = { x: 5, y: 6 };
live().lastHealLocation = { mapGroup: 3, mapNum: 0, warpId: -1, x: 5, y: 6 };
data.viewerNavigation = { mapId: "MAP_PALLET_TOWN", x: 5, y: 6, direction: "south", dynamic: null, region: "kanto" } as NavigationSave;
flagSet(C.FLAG_BADGE01_GET); // PREPARED Kanto progress that must stay Kanto's
live().party = [createMon(EM.SPECIES_TORCHIC, 7)]; // PREPARED party (species IDs are shared by both games)
assert.equal(writeWorldSave(), true);
const kantoBefore: WorldSaveData = JSON.parse(storage.get(WORLD_SAVE_KEY)!);
resetViewerSessionInitialized();
initializeRegionalSession("hoenn", () => {});
console.log("PREPARED: Kanto trainer (Torchic Lv 7, ¥3000, FLAG_BADGE01_GET) saved, then a new Hoenn bank");

if (process.argv.includes('--mossdeep')) {
  const { runMossdeepWarpChecks } = await import('./emeraldMossdeepWarp.ts');
  await runMossdeepWarpChecks(engine, pump);
  process.exit(0);
}

// ---------------------------------------------------------------- 1. map entry + NPC + sign
const oldale = facingNav("MAP_OLDALE_TOWN", 16, 12, "north");
const entry = await engine.enterMap(oldale);
assert.ok(entry, "Oldale Town entry ran");
assert.equal(entry.transition, "OldaleTown_OnTransition");
assert.ok(src("data/maps/OldaleTown/scripts.inc").includes("setflag FLAG_VISITED_OLDALE_TOWN"));
assert.equal(flagGet(EM.FLAG_VISITED_OLDALE_TOWN), true, "OnTransition: setflag FLAG_VISITED_OLDALE_TOWN");
// call_if_unset FLAG_ADVENTURE_STARTED / FLAG_RECEIVED_POTION_OLDALE: setobjectxyperm targets from the source.
const xyperm = (label: string) => {
  const m = new RegExp(`${label}::\\s*\\n\\s*setobjectxyperm (\\w+), (\\d+), (\\d+)\\s*\\n\\s*setobjectmovementtype \\w+, (\\w+)`).exec(src("data/maps/OldaleTown/scripts.inc"));
  assert.ok(m, label);
  return { localId: (EM as Record<string, number>)[m[1]!]!, x: Number(m[2]), y: Number(m[3]), movementType: (EM as Record<string, number>)[m[4]!]! };
};
for (const expected of [xyperm("OldaleTown_EventScript_BlockWestEntrance"), xyperm("OldaleTown_EventScript_MoveMartEmployee")]) {
  const t = entry.changedTemplates.find(o => o.localId === expected.localId);
  assert.ok(t, `template ${expected.localId} moved`);
  assert.deepEqual([t.x, t.y, t.movementType], [expected.x, expected.y, expected.movementType]);
}
console.log(`map entry: ${entry.transition}; templates ${entry.changedTemplates.map(t => `${t.localId}@${t.x},${t.y}`).join(" ")}`);

// The girl at (16,11), talked to from (16,12) facing north: OldaleTown_EventScript_Girl (msgbox MSGBOX_NPC).
await engine.show(oldale, { mapId: "MAP_OLDALE_TOWN", localId: 1 });
assert.equal(engine.open, true, "NPC script started");
let printed: Uint8Array | null = null;
await pump(600, tap(A_BUTTON), () => { if (!printed && stringVars.var4[0] !== 0xff) printed = Uint8Array.from(stringVars.var4); return !engine.open; });
assert.equal(engine.open, false, "NPC script finished");
assert.deepEqual(Array.from(printed!).slice(0, printed!.indexOf(0xff) + 1), Array.from(sourceText("data/maps/OldaleTown/scripts.inc", "OldaleTown_Text_SavingMyProgress")), "NPC text is the source string");
console.log("NPC: OldaleTown_EventScript_Girl printed OldaleTown_Text_SavingMyProgress");

// The town sign (bg event at 11,9, BG_EVENT_PLAYER_FACING_ANY) read from (11,10) facing north.
stringVars.var4 = Uint8Array.of(0xff);
live().facing = C.DIR_NORTH;
assert.equal(await engine.interactFront(facingNav("MAP_OLDALE_TOWN", 11, 10, "north"), false), true, "sign script started");
printed = null;
await pump(600, tap(A_BUTTON), () => { if (!printed && stringVars.var4[0] !== 0xff) printed = Uint8Array.from(stringVars.var4); return !engine.open; });
assert.deepEqual(Array.from(printed!).slice(0, printed!.indexOf(0xff) + 1), Array.from(sourceText("data/maps/OldaleTown/scripts.inc", "OldaleTown_Text_TownSign")), "sign text is the source string");
console.log("sign: OldaleTown_EventScript_TownSign printed OldaleTown_Text_TownSign");

// ---------------------------------------------------------------- 2. Poké Mart (OldaleTown_Mart_EventScript_Clerk)
const game = (engine as unknown as { game: import("../../src/games/firered/game.ts").Game }).game;
const martPtrs: number[] = [];
{
  const create = game.createPokemartMenu.bind(game); // observation only: records the pokemart argument
  game.createPokemartMenu = (ptr: number) => { martPtrs.push(ptr); create(ptr); };
}
const martNav = facingNav("MAP_OLDALE_TOWN_MART", 3, 3, "west");
await engine.enterMap(martNav);
live().facing = C.DIR_WEST;
assert.equal(flagGet(EM.FLAG_ADVENTURE_STARTED), false, "fresh bank: adventure not started");
const potion = EM.ITEM_POTION, potionPrice = sourcePrice("ITEM_POTION");
const moneyBefore = live().money;
await engine.show(martNav, { mapId: "MAP_OLDALE_TOWN_MART", localId: EM.LOCALID_OLDALE_MART_CLERK });
// A until the purchase is paid, then B to leave the list, the menu and the farewell message.
let paid = false;
await pump(6000, f => { if (live().money !== moneyBefore) paid = true; return f % 24 === 12 ? (paid ? B_BUTTON : A_BUTTON) : 0; });
assert.equal(engine.open, false, "mart script finished");
assert.equal(martPtrs.length, 1, "one pokemart command");
assert.equal(rom.labelAt(martPtrs[0]!), "OldaleTown_Mart_Pokemart_Basic", "goto_if_set FLAG_ADVENTURE_STARTED not taken");
const sold: number[] = [];
for (let i = 0; rom.u16(martPtrs[0]! + i * 2) !== EM.ITEM_NONE; i++) sold.push(rom.u16(martPtrs[0]! + i * 2));
assert.deepEqual(sold, sourceMart("data/maps/OldaleTown_Mart/scripts.inc", "OldaleTown_Mart_Pokemart_Basic"), "mart list is the source list");
assert.equal(moneyBefore - live().money, potionPrice, "one Potion at its src/data/items.h price");
assert.equal(checkBagHasItem(potion, 1), true, "the Potion is in the shared bag");
assert.deepEqual(live().bag.items.find(s => s.item === potion), { item: potion, quantity: 1 }, "in the Items pocket");
console.log(`mart: OldaleTown_Mart_Pokemart_Basic = [${sold.join(", ")}]; bought ITEM_POTION for ¥${potionPrice}`);

// With FLAG_ADVENTURE_STARTED the same clerk opens OldaleTown_Mart_Pokemart_Expanded.
flagSet(EM.FLAG_ADVENTURE_STARTED); // PREPARED story progress (set by the Pokédex scene in the source)
await engine.show(martNav, { mapId: "MAP_OLDALE_TOWN_MART", localId: EM.LOCALID_OLDALE_MART_CLERK });
await pump(4000, tap(B_BUTTON));
assert.equal(engine.open, false, "mart script finished (B leaves the menu)");
assert.equal(rom.labelAt(martPtrs[1]!), "OldaleTown_Mart_Pokemart_Expanded", "goto_if_set FLAG_ADVENTURE_STARTED taken");
const expanded: number[] = [];
for (let i = 0; rom.u16(martPtrs[1]! + i * 2) !== EM.ITEM_NONE; i++) expanded.push(rom.u16(martPtrs[1]! + i * 2));
assert.deepEqual(expanded, sourceMart("data/maps/OldaleTown_Mart/scripts.inc", "OldaleTown_Mart_Pokemart_Expanded"));
saveModule.flagClear(EM.FLAG_ADVENTURE_STARTED); // PREPARED: back to the fresh-bank state for the rest of the circuit
console.log(`mart: with FLAG_ADVENTURE_STARTED, OldaleTown_Mart_Pokemart_Expanded = [${expanded.join(", ")}]`);

// ---------------------------------------------------------------- 3. Pokémon Center (Common_EventScript_PkmnCenterNurse)
const centerNav = facingNav("MAP_OLDALE_TOWN_POKEMON_CENTER_1F", 7, 4, "north");
await engine.enterMap(centerNav);
const heal = (JSON.parse(src("src/data/heal_locations.json")) as { heal_locations: Array<{ id: string; map: string; x: number; y: number }> }).heal_locations.find(h => h.id === "HEAL_LOCATION_OLDALE_TOWN")!;
const healNum = rom.mapNum(heal.map);
assert.deepEqual(live().lastHealLocation, { mapGroup: healNum >> 8, mapNum: healNum & 0xff, warpId: -1, x: heal.x, y: heal.y }, "OnTransition: setrespawn HEAL_LOCATION_OLDALE_TOWN");
const mon = live().party[0]!;
mon.hp = 1; // PREPARED damage before healing
mon.pp[0] = 0; // PREPARED
const pokecenterUses = live().gameStats[EM.GAME_STAT_USED_POKECENTER] ?? 0;
live().facing = C.DIR_NORTH;
await engine.show(centerNav, { mapId: "MAP_OLDALE_TOWN_POKEMON_CENTER_1F", localId: EM.LOCALID_OLDALE_NURSE });
await pump(6000, tap(A_BUTTON));
assert.equal(engine.open, false, "nurse script finished");
assert.equal(mon.hp, mon.stats[0], "special HealPlayerParty restored HP");
assert.ok(mon.pp[0]! > 0, "and PP");
assert.equal(live().gameStats[EM.GAME_STAT_USED_POKECENTER], pokecenterUses + 1, "incrementgamestat GAME_STAT_USED_POKECENTER");
console.log("center: Common_EventScript_PkmnCenterNurse healed the party; respawn = HEAL_LOCATION_OLDALE_TOWN");

// ---------------------------------------------------------------- 4. Route 101 wild encounter and battle
const route = "MAP_ROUTE101";
const routeEntry = await engine.enterMap(facingNav(route, 10, 10, "north"));
assert.equal(routeEntry?.transition, "Route101_OnTransition");
// ON_FRAME_TABLE: map_script_2 VAR_ROUTE101_STATE, 0, Route101_EventScript_HideMapNamePopup runs once the map is entered.
assert.ok(/Route101_OnFrame:\s*\n\s*map_script_2 VAR_ROUTE101_STATE, 0, Route101_EventScript_HideMapNamePopup/.test(src("data/maps/Route101/scripts.inc")));
assert.equal(engine.open, true, "the ON_FRAME script started");
await pump(600, tap(A_BUTTON));
assert.equal(engine.open, false, "ON_FRAME script finished");
assert.equal(varGet(EM.VAR_ROUTE101_STATE), 1, "Route101_EventScript_HideMapNamePopup: setvar VAR_ROUTE101_STATE, 1");
assert.equal(flagGet(EM.FLAG_HIDE_MAP_NAME_POPUP), true, "setflag FLAG_HIDE_MAP_NAME_POPUP");
console.log("ON_FRAME: Route101_OnFrame ran Route101_EventScript_HideMapNamePopup");
const ow = game.overworld;
// The first land-encounter tile of the map, read from the engine's Emerald metatile behaviors.
let grass: { x: number; y: number } | undefined;
for (let y = 0; y < ow.loaded.layout.height && !grass; y++)
  for (let x = 0; x < ow.loaded.layout.width && !grass; x++)
    if (EMB.MetatileBehavior_IsLandWildEncounter(ow.map.behaviorAt(x + 7, y + 7))) grass = { x, y };
assert.ok(grass, "Route 101 has tall grass");
type SourceWild = { map: string; land_mons?: { encounter_rate: number; mons: Array<{ min_level: number; max_level: number; species: string }> } };
const table = (JSON.parse(src("src/data/wild_encounters.json")) as { wild_encounter_groups: Array<{ label: string; encounters: SourceWild[] }> })
  .wild_encounter_groups.find(g => g.label === "gWildMonHeaders")!.encounters.find(e => e.map === route)!.land_mons!;
const possible = table.mons.map(m => ({ species: (EM as Record<string, number>)[m.species]!, min: m.min_level, max: m.max_level }));
let steps = 0, hit = false;
const grassNav = facingNav(route, grass.x, grass.y, "north");
while (!hit && steps < 400) { steps++; hit = await engine.tryEmeraldStep(grassNav, "walk"); }
if (!hit) {
  const W = await import("../../src/games/emerald/wildEncounter.ts");
  console.log("debug", grass, W.GetCurrentMapWildMonHeaderId(), ow.map.behaviorAt(grass.x + 7, grass.y + 7), engine.busy, engine.open, live().location, live().gameStats[EM.GAME_STAT_STEPS]);
}
assert.ok(hit, "a wild encounter within 400 steps on tall grass");
assert.ok(steps > 4, "CheckStandardWildEncounter: 4 immunity steps after the map entry");
const wild = lastGeneratedWildMon()!;
assert.ok(possible.some(p => p.species === wild.species && wild.level >= p.min && wild.level <= p.max),
  `wild ${wild.species} Lv ${wild.level} is in the source Route 101 land table`);
console.log(`wild: species ${wild.species} Lv ${wild.level} after ${steps} steps (source table: ${[...new Set(table.mons.map(m => m.species))].join(", ")})`);
// Battle: A on every prompt (FIGHT, the first move, messages) until the battle ends.
const lead = live().party[0]!, expBefore = lead.exp;
let menuSeen = false;
const battleFrames = await pump(30000, f => {
  if ((gBattlerControllerFuncs[0]?.name ?? "").includes("HandleInputChooseAction")) menuSeen = true;
  return f % 24 === 12 ? A_BUTTON : 0;
});
assert.equal(engine.open, false, `battle finished (${battleFrames} frames)`);
assert.ok(menuSeen, "the battle reached the action menu");
assert.equal(gMain.inBattle, false, "back on the field");
assert.equal(G.gBattleOutcome, C.B_OUTCOME_WON, "the wild Pokémon was defeated");
assert.ok(lead.exp > expBefore, "the lead gained experience");
console.log(`battle: defeated the wild ${wild.species} on the FireRed battle engine (${battleFrames} frames, +${lead.exp - expBefore} exp)`);

// ---------------------------------------------------------------- 5. save in Hoenn, continue, Kanto untouched
const saveNav = facingNav("MAP_OLDALE_TOWN", 16, 12, "north");
const partyBefore = JSON.stringify(live().party), moneyAfter = live().money, oldaleNum = rom.mapNum("MAP_OLDALE_TOWN");
assert.equal(saveViewerSession(saveNav), true, "save in Hoenn");
const stored: WorldSaveData = JSON.parse(storage.get(WORLD_SAVE_KEY)!);
for (const key of ["flags", "vars", "location", "pos", "lastHealLocation", "viewerNavigation"] as const)
  assert.deepEqual(stored[key], kantoBefore[key], `Kanto ${key} unchanged by the Hoenn save`);
const bank = stored.world!.regions.hoenn!;
assert.equal(stored.world!.activeRegion, "hoenn");
assert.deepEqual(bank.field!.location, { mapGroup: oldaleNum >> 8, mapNum: oldaleNum & 0xff, warpId: -1, x: 16, y: 12 }, "Hoenn location banked in Emerald numbering");
assert.deepEqual(bank.field!.lastHealLocation, { mapGroup: healNum >> 8, mapNum: healNum & 0xff, warpId: -1, x: heal.x, y: heal.y }, "Hoenn respawn banked");
assert.equal(stored.money, moneyAfter, "money is global");
assert.equal(JSON.stringify(stored.party), partyBefore, "party (with the battle's experience) is global");

resetViewerSessionInitialized();
const resumed = continueRegionalSession("hoenn", () => assert.fail("the stored Hoenn bank must be reused"));
assert.deepEqual(resumed, { ...saveNav, region: "hoenn" }, "continue returns the saved Hoenn position");
assert.deepEqual(live().location, bank.field!.location, "live location is Hoenn's again");
assert.equal(flagGet(EM.FLAG_VISITED_OLDALE_TOWN), true, "Hoenn flags restored");
assert.equal(varGet(EM.VAR_ROUTE101_STATE), 1, "Hoenn vars restored");
assert.equal(live().money, moneyAfter);
assert.deepEqual(live().bag.items.find(s => s.item === potion), { item: potion, quantity: 1 });
assert.equal(JSON.stringify(live().party), partyBefore);
// Continuing in Hoenn after the reload: the next entry runs the source scripts on the restored bank.
const again = await engine.enterMap(resumed);
assert.equal(again?.transition, "OldaleTown_OnTransition");

// Route110 ON_RESUME special: compare all state branches, including the exact source-map guard.
const { UpdateCyclingRoadState } = await import("../../src/games/emerald/specials.ts");
const northEntrance = EM.MAP_ROUTE110_SEASIDE_CYCLING_ROAD_NORTH_ENTRANCE;
for (const fromNorth of [false, true]) for (const challengeState of [0, 1, 2, 3, 4]) {
  game.overworld.lastUsedWarp = { mapGroup: northEntrance >>> 8, mapNum: (northEntrance & 0xff) + (fromNorth ? 0 : 1), warpId: -1, x: 1, y: 1 }; // PREPARED origin
  game.overworld.Overworld_SetSavedMusic(EM.MUS_CYCLING); // PREPARED saved music
  varSet(EM.VAR_CYCLING_CHALLENGE_STATE, challengeState); // PREPARED cycling state
  UpdateCyclingRoadState({ ow: game.overworld } as import("../../src/core/script/context.ts").ScriptRunner);
  const reset = !fromNorth && (challengeState === 2 || challengeState === 3);
  assert.equal(varGet(EM.VAR_CYCLING_CHALLENGE_STATE), reset ? 0 : challengeState);
  assert.equal(game.overworld.savedMusic, reset ? EM.MUS_DUMMY : EM.MUS_CYCLING);
}
console.log("PREPARED cycling origins/states: UpdateCyclingRoadState guard and reset branches PASS");

// ---------------------------------------------------------------- 6. Emerald white-out recovery (PREPARED scheduler preconditions)
// The browser job covers a real defeat; here we isolate the 120-frame dispatch and source rules.
const whiteOutSource = src("src/overworld.c");
assert.match(whiteOutSource, /SetMoney\(&gSaveBlock1Ptr->money, GetMoney\(&gSaveBlock1Ptr->money\) \/ 2\)/);
const resetBody = whiteOutSource.match(/static void Overworld_ResetStateAfterWhiteOut\(void\)\s*\{([\s\S]*?)\n\}/)![1]!;
const resetFlags = [...resetBody.matchAll(/FlagClear\((FLAG_\w+)\)/g)].map(m => (EM as Record<string, number>)[m[1]!]!);
for (const flag of resetFlags) flagSet(flag); // PREPARED active field modes before defeat
varSet(EM.VAR_SHOULD_END_ABNORMAL_WEATHER, 1); // PREPARED reset-trigger condition
varSet(EM.VAR_ABNORMAL_WEATHER_LOCATION, 7); // PREPARED active abnormal weather
console.log("PREPARED: field modes, weather state (1, 7), odd money and a fainted party before white-out");
live().money = 2701; // PREPARED odd amount to check C unsigned integer division
live().party[0]!.hp = 0; // PREPARED fainted party; battle outcome is covered in the browser
const savedHeal = structuredClone(live().lastHealLocation);
await engine.show(saveNav, { mapId: "MAP_OLDALE_TOWN", localId: 1 });
const relocationsBeforeWhiteOut = recoveryRelocations.length;
game.whiteOut();
for (let frame = 0; frame < 119; frame++) game.frame();
assert.equal(live().money, 2701, "CB2_WhiteOut must wait 120 frames");
game.frame();
assert.equal(live().money, 1350, "Emerald halves money with unsigned integer division");
await pump(1200, tap(A_BUTTON));
assert.equal(engine.open, false, "Emerald recovery returned to the field");
assert.equal(recoveryRelocations.length - relocationsBeforeWhiteOut, 1, "one recovery must relocate the viewer once");
assert.deepEqual(live().location, savedHeal, "Emerald uses the exact saved outdoor heal warp");
assert.equal(live().party[0]!.hp, live().party[0]!.stats[0]);
for (const flag of resetFlags) assert.equal(flagGet(flag), false, `white-out cleared source flag ${flag}`);
assert.equal(varGet(EM.VAR_SHOULD_END_ABNORMAL_WEATHER), 0);
assert.equal(varGet(EM.VAR_ABNORMAL_WEATHER_LOCATION), EM.ABNORMAL_WEATHER_NONE);
// A value other than 1 must not clear the weather pair.
const { Overworld_ResetStateAfterWhiteOut } = await import("../../src/games/emerald/whiteOut.ts");
varSet(EM.VAR_SHOULD_END_ABNORMAL_WEATHER, 2); // PREPARED non-trigger condition
varSet(EM.VAR_ABNORMAL_WEATHER_LOCATION, 7); // PREPARED weather that must be preserved
console.log("PREPARED: non-trigger weather state (2, 7), reset must preserve it");
Overworld_ResetStateAfterWhiteOut({ resetInitialPlayerAvatarState() {} });
assert.equal(varGet(EM.VAR_SHOULD_END_ABNORMAL_WEATHER), 2);
assert.equal(varGet(EM.VAR_ABNORMAL_WEATHER_LOCATION), 7);
console.log("white-out: 120-frame wait, source script/flags/weather, half money, healed party and exact Emerald outdoor respawn PASS (PREPARED)");

resetViewerSessionInitialized();
const kanto = reloadWorldSave()!;
enterKanto();
assert.equal(flagGet(C.FLAG_BADGE01_GET), true, "Kanto progress intact");
assert.deepEqual(kanto.flags, kantoBefore.flags, "no Hoenn flag reached Kanto");
assert.deepEqual(kanto.vars, kantoBefore.vars, "no Hoenn var reached Kanto");
assert.deepEqual(kanto.location, kantoBefore.location);
console.log("save/continue: Hoenn bank (field, flags, vars) restored; Kanto flags, vars, location and respawn unchanged; party, money and bag shared");

// PetalburgCity_Gym `setorcopyvar VAR_TRAINER_BATTLE_OPPONENT_A, TRAINER_NORMAN_1` (0x8015 aliases
// gTrainerBattleOpponent_A; the FireRed special-var table has no slot for it) run through the command itself.
{
  const { G } = await import("../../src/core/battle/globals.ts");
  const { COMMANDS } = await import("../../src/core/script/commands.ts");
  assert.ok(saveModule.specialVarAliases.has(EM.VAR_TRAINER_BATTLE_OPPONENT_A), "the Hoenn engine installs the alias");
  const operands = [EM.VAR_TRAINER_BATTLE_OPPONENT_A, EM.TRAINER_NORMAN_1];
  COMMANDS.ScrCmd_setorcopyvar!({ ScriptReadHalfword: () => operands.shift()! } as never);
  assert.equal(G.gTrainerBattleOpponent_A, EM.TRAINER_NORMAN_1);
}

console.log("incbin fallbacks:", [...incbinFallbacks].sort().join(", "));
console.log("cdata fallbacks:", [...cdataFallbacks].sort().join(", "));
console.log("text fallbacks:", [...textFallbacks].sort().join(", "));
assert.deepEqual(warnings.filter(w => /special not implemented|script command|not implemented/i.test(w)), [], "every special and script command the circuit ran is ported");
console.log("check:hoenn-circuit PASS");
