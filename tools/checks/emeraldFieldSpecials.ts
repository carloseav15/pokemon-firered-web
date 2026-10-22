// Emerald specials ported on demand for the Hoenn circuit (src/games/emerald/specials.ts, berryPowder.ts,
// birchPc.ts, battleSetup.ts): the field_specials.c / tv.c / load_save.c / event_data.c / time_events.c /
// save_location.c / birch_pc.c / berry_powder.c / script_menu.c bodies, run headless against state PREPARED from
// the pokeemerald source (strings.c literals, starter_choose.c sStarterMon, battle_setup.c gRematchTable, the
// heal_locations.json export). Metatile specials run on the real exported maps. No rendering.
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Game } from "../../src/games/firered/game.ts";
import { newSaveData, setSave, save, flagGet, flagSet, varGet, varSet, SV, flagClear } from "../../src/games/firered/save.ts";
import { rom, setDataRoot } from "../../src/core/rom.ts";
import { loadCData } from "../../src/core/hw/assets.ts";
import { enterKanto } from "../../src/viewer/regionSave.ts";
import { initializeRegionalSession, resetViewerSessionInitialized } from "../../src/viewer/session.ts";
import { runEmeraldMapEntry } from "../../src/viewer/hoennMapEntry.ts";
import { setGameSpecials } from "../../src/games/firered/script/specials.ts";
import { EMERALD_SPECIALS, FIRERED_SPECIALS_SHARED_WITH_EMERALD } from "../../src/games/emerald/specials.ts";
import { gLocalTime } from "../../src/games/emerald/clock.ts";
import { ScriptRunner } from "../../src/core/script/context.ts";
import { tasks } from "../../src/core/gba/tasks.ts";
import { createMon } from "../../src/core/pokemon/pokemon.ts";
import { stringVars } from "../../src/core/gba/stringBuffers.ts";
import { MAP_OFFSET } from "../../src/core/field/fieldmap.ts";
import { SetPlayerAvatar } from "../../src/core/field/playerAvatar.ts";
import * as EM from "../../src/games/emerald/generated/constants.ts";
import * as FR from "../../src/games/firered/generated/constants.ts";
import { decode, encode } from "../../src/core/gba/charmap.ts";

const fetchFile = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); if (url.startsWith("/") && !existsSync("public" + url)) return new Response("", { status: 404 }); return fetchFile(input, init); }) as typeof fetch;
const storage = new Map<string, string>();
(globalThis as unknown as { localStorage: Pick<Storage, "getItem" | "setItem" | "removeItem"> }).localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => { storage.set(k, v); }, removeItem: k => { storage.delete(k); } };
setDataRoot("/emerald");
rom.charmap = JSON.parse(readFileSync("public/emerald/charmap.json", "utf8"));
await rom.load();
await loadCData("em:battle_setup", "em:starter_choose", "pokemon", "fonts", "text_printer", "text", "strings");

const decomp = process.env.POKEEMERALD ? resolve(process.env.POKEEMERALD) : resolve(process.cwd(), "../refs-src/pokeemerald");
assert.ok(existsSync(resolve(decomp, "src/field_specials.c")), `pokeemerald source not found at ${decomp}`);
const source = (path: string): string => readFileSync(resolve(decomp, path), "utf8");
const text = (bytes: Uint8Array): string => decode(Array.from(bytes));

const canvas = { width: 240, height: 160, getContext: () => ({}) } as unknown as HTMLCanvasElement;
setSave(newSaveData());
enterKanto();
resetViewerSessionInitialized();
initializeRegionalSession("hoenn", () => {});
const game = new Game(canvas);
setGameSpecials(EMERALD_SPECIALS, FIRERED_SPECIALS_SHARED_WITH_EMERALD);
const sp = EMERALD_SPECIALS as unknown as Record<string, (ctx: ScriptRunner) => number | void>;
const ctx = new ScriptRunner(game.overworld);
const call = (name: string): number | void => { assert.ok(sp[name], `${name} is registered`); return sp[name]!(ctx); };
const enter = (mapId: string) => runEmeraldMapEntry(game, { mapId, x: 1, y: 1, direction: "south", dynamic: null });
await enter("MAP_PETALBURG_CITY_GYM");
/** The live bank after entering Hoenn: Emerald flag/var ids. */
const mon = (species: number, level = 5) => createMon(species, level);

// strings.c: gText_BigGuy / gText_BigGirl / gText_Son / gText_Daughter
for (const [label, literal] of [["gText_BigGuy", "Big guy"], ["gText_BigGirl", "Big girl"], ["gText_Son", "son"], ["gText_Daughter", "daughter"]] as const)
  assert.match(source("src/strings.c"), new RegExp(`${label}\\[\\] = _\\("${literal}"\\)`), `${label} literal in strings.c`);
save.playerGender = EM.MALE; call("GetPlayerBigGuyGirlString"); assert.equal(text(stringVars.var1), "Big guy");
save.playerGender = EM.FEMALE; call("GetPlayerBigGuyGirlString"); assert.equal(text(stringVars.var1), "Big girl");
save.playerGender = EM.MALE; call("GetRivalSonDaughterString"); assert.equal(text(stringVars.var1), "daughter");
save.playerGender = EM.FEMALE; call("GetRivalSonDaughterString"); assert.equal(text(stringVars.var1), "son");

// field_specials.c GetWeekCount: days / 7 capped at 9999
gLocalTime.days = 69; assert.equal(call("GetWeekCount"), 9);
gLocalTime.days = 70; assert.equal(call("GetWeekCount"), 10);
gLocalTime.days = 7 * 9999 + 6; assert.equal(call("GetWeekCount"), 9999);
gLocalTime.days = 7 * 10000; assert.equal(call("GetWeekCount"), 9999);
gLocalTime.days = 0;

// starter_choose.c sStarterMon + field_specials.c IsStarterInParty
const starters = /sStarterMon\[STARTER_MON_COUNT\] =\s*\{([^}]*)\}/.exec(source("src/starter_choose.c"))![1]!.split(",").map(s => s.trim()).filter(Boolean);
assert.deepEqual(starters, ["SPECIES_TREECKO", "SPECIES_TORCHIC", "SPECIES_MUDKIP"]);
save.party = [mon(EM.SPECIES_MUDKIP), mon(EM.SPECIES_ZIGZAGOON)];
varSet(EM.VAR_STARTER_MON, 2); assert.equal(call("IsStarterInParty"), 1);
varSet(EM.VAR_STARTER_MON, 1); assert.equal(call("IsStarterInParty"), 0);
varSet(EM.VAR_STARTER_MON, 9); // out of range: GetStarterPokemon falls back to Treecko... index 0
save.party = [mon(EM.SPECIES_TREECKO)]; assert.equal(call("IsStarterInParty"), 1);

// battle_setup.c gRematchTable + pokenav_match_call_data.c GetRematchIdxByTrainerIdx + field_specials.c IsTrainerRegistered
const firstTrainer = (await import("../../src/core/hw/assets.ts")).cdata<{ trainerIds: number[] }[]>("em:battle_setup", "gRematchTable");
const rematchIdx = 5, trainerId = firstTrainer[rematchIdx]!.trainerIds[0]!;
varSet(SV.x8004, trainerId);
assert.equal(call("IsTrainerRegistered"), 0);
flagSet(EM.TRAINER_REGISTERED_FLAGS_START + rematchIdx); assert.equal(call("IsTrainerRegistered"), 1);
varSet(SV.x8004, 0xfffe); assert.equal(call("IsTrainerRegistered"), 0, "a trainer outside the table is not registered");
// IsTrainerReadyForRematch_: trainerRematches[tableId] != 0 for any of the entry's trainer ids
game.overworld.game.battleSetup.opponentA = firstTrainer[rematchIdx]!.trainerIds[1]!;
save.trainerRematches = new Array(EM.MAX_REMATCH_ENTRIES).fill(0);
assert.equal(call("IsTrainerReadyForRematch"), 0);
save.trainerRematches[rematchIdx] = 1; assert.equal(call("IsTrainerReadyForRematch"), 1);
game.overworld.game.battleSetup.opponentA = 0; assert.equal(call("IsTrainerReadyForRematch"), 0, "unlisted opponent id 0");

// field_specials.c ResetHealLocationFromDewford: only a Dewford heal location becomes Petalburg's (heal_locations.json)
const heals = JSON.parse(source("src/data/heal_locations.json")).heal_locations as { id: string; map: string; x: number; y: number }[];
const petalburg = heals.find(h => h.id === "HEAL_LOCATION_PETALBURG_CITY")!;
const dewfordMap = rom.mapNum("MAP_DEWFORD_TOWN");
save.lastHealLocation = { mapGroup: dewfordMap >> 8, mapNum: dewfordMap & 0xff, warpId: -1, x: 1, y: 1 };
call("ResetHealLocationFromDewford");
const petalburgMap = rom.mapNum(petalburg.map);
assert.deepEqual(save.lastHealLocation, { mapGroup: petalburgMap >> 8, mapNum: petalburgMap & 0xff, warpId: -1, x: petalburg.x, y: petalburg.y });
const slateport = rom.mapNum("MAP_SLATEPORT_CITY");
const keep = { mapGroup: slateport >> 8, mapNum: slateport & 0xff, warpId: -1, x: 3, y: 4 };
save.lastHealLocation = { ...keep }; call("ResetHealLocationFromDewford"); assert.deepEqual(save.lastHealLocation, keep);

// time_events.c InitBirchState, event_data.c EnableNationalPokedex, save_location.c SetUnlockedPokedexFlags
varSet(EM.VAR_BIRCH_STATE, 5); /* PREPARED: non-zero Birch state */ call("InitBirchState"); assert.equal(varGet(EM.VAR_BIRCH_STATE), 0);
call("EnableNationalPokedex");
assert.equal(save.nationalDexMagic, 0xda); assert.equal(varGet(EM.VAR_NATIONAL_DEX), 0x302); assert.equal(flagGet(EM.FLAG_SYS_NATIONAL_DEX), true);
(save as unknown as { gcnLinkFlags?: number }).gcnLinkFlags = 0;
call("SetUnlockedPokedexFlags"); assert.equal((save as unknown as { gcnLinkFlags: number }).gcnLinkFlags, 0x803f);

// tv.c BufferMonNickname / IsMonOTIDNotPlayers
const nick = mon(EM.SPECIES_ZIGZAGOON);
save.party = [mon(EM.SPECIES_TREECKO), nick];
nick.nickname = [...encode("ABCDEFGHIJKL"), 0xff]; // longer than POKEMON_NAME_LENGTH: StringGet_Nickname truncates it
varSet(SV.x8004, 1); call("BufferMonNickname");
assert.equal(text(stringVars.var1), "ABCDEFGHIJ");
save.trainerId = 0x12345678; save.party[1]!.otId = 0x12345678;
call("IsMonOTIDNotPlayers"); assert.equal(varGet(SV.RESULT), 0);
save.party[1]!.otId = 0x12345679; call("IsMonOTIDNotPlayers"); assert.equal(varGet(SV.RESULT), 1);

// load_save.c SavePlayerParty / LoadPlayerParty
save.party = [mon(EM.SPECIES_TORCHIC, 7), mon(EM.SPECIES_ZIGZAGOON, 9), mon(EM.SPECIES_WURMPLE, 3)];
call("SavePlayerParty");
save.party.splice(1, 2); save.party[0]!.level = 40;
call("LoadPlayerParty");
assert.deepEqual(save.party.map(m => [m.species, m.level]), [[EM.SPECIES_TORCHIC, 7], [EM.SPECIES_ZIGZAGOON, 9], [EM.SPECIES_WURMPLE, 3]]);
save.party[0]!.level = 12; assert.equal(save.playerPartySave!.party[0]!.level, 7, "the saved copy is independent");

// field_specials.c LeadMonHasEffortRibbon / GiveLeadMonEffortRibbon
save.party = [mon(EM.SPECIES_TORCHIC)];
assert.equal(call("LeadMonHasEffortRibbon"), 0);
const ribbonsBefore = save.gameStats[EM.GAME_STAT_RECEIVED_RIBBONS] ?? 0;
call("GiveLeadMonEffortRibbon");
assert.equal(call("LeadMonHasEffortRibbon"), 1); assert.equal(flagGet(EM.FLAG_SYS_RIBBON_GET), true);
assert.equal(save.gameStats[EM.GAME_STAT_RECEIVED_RIBBONS], ribbonsBefore + 1);

// berry_powder.c HasEnoughBerryPowder / TakeBerryPowder (cost in gSpecialVar_0x8004)
save.berryPowder = 120; varSet(SV.x8004, 121);
assert.equal(call("HasEnoughBerryPowder"), 0); assert.equal(call("TakeBerryPowder"), 0); assert.equal(save.berryPowder, 120);
varSet(SV.x8004, 120); assert.equal(call("HasEnoughBerryPowder"), 1); assert.equal(call("TakeBerryPowder"), 1); assert.equal(save.berryPowder, 0);

// birch_pc.c ScriptGetPokedexInfo / ShowPokedexRatingMessage: counts through the Hoenn dex order
const { GetSetPokedexFlag } = await import("../../src/core/pokemon/mon_extra.ts");
const { HoennToNationalOrder } = await import("../../src/core/pokemon/pokemon.ts");
for (let hoenn = 1; hoenn <= 12; hoenn++) { GetSetPokedexFlag(HoennToNationalOrder(hoenn), EM.FLAG_SET_SEEN); if (hoenn <= 7) GetSetPokedexFlag(HoennToNationalOrder(hoenn), EM.FLAG_SET_CAUGHT); }
varSet(SV.x8004, 0);
save.nationalDexMagic = 0; varSet(EM.VAR_NATIONAL_DEX, 0); /* PREPARED: dex not enabled */ flagClear(EM.FLAG_SYS_NATIONAL_DEX);
assert.equal(call("ScriptGetPokedexInfo"), 0, "national dex not enabled");
assert.equal(varGet(SV.x8005), 12); assert.equal(varGet(SV.x8006), 7);
const shown: Uint8Array[] = [];
(game.overworld.messageBox as unknown as { show: (t: Uint8Array) => void }).show = t => { shown.push(t); };
for (const [count, label] of [[9, "LessThan10"], [10, "LessThan20"], [199, "LessThan200"], [EM.HOENN_DEX_COUNT, "DexCompleted"]] as const) {
  varSet(SV.x8004, count); call("ShowPokedexRatingMessage");
  assert.deepEqual(Array.from(shown.pop()!), Array.from(rom.text(`gBirchDexRatingText_${label}`)), `rating ${count}`);
}

// field_specials.c PCTurnOnEffect / PCTurnOffEffect on the exported Oldale Pokémon Center map
await enter("MAP_OLDALE_TOWN_POKEMON_CENTER_1F");
{
  const k = rom.constants as Record<string, number>;
  const map = game.overworld.map;
  save.pos = { x: 13, y: 5 }; // PC is the tile north of the player (facing north)
  const pcX = save.pos.x + MAP_OFFSET, pcY = save.pos.y - 1 + MAP_OFFSET;
  const avatar = { object: { facingDirection: EM.DIR_NORTH } };
  SetPlayerAvatar(avatar as never); // PREPARED: only the facing direction is read
  varSet(SV.x8004, EM.PC_LOCATION_OTHER);
  call("DoPCTurnOffEffect");
  assert.equal(map.metatileIdAt(pcX, pcY), k.METATILE_Building_PC_Off);
  call("DoPCTurnOnEffect");
  call("DoPCTurnOnEffect"); // a second call while the task runs must not create another task
  assert.equal(tasks.tasks.filter(t => t.isActive).length, 1);
  const seen: number[] = [];
  for (let frame = 0; frame < 6 * 5 + 2; frame++) { tasks.run(); seen.push(map.metatileIdAt(pcX, pcY)); }
  assert.equal(tasks.tasks.filter(t => t.isActive).length, 0, "5 flickers end the task");
  assert.equal(map.metatileIdAt(pcX, pcY), k.METATILE_Building_PC_On, "odd flicker count ends with the screen on");
  assert.ok(seen.includes(k.METATILE_Building_PC_Off), "the screen was switched off in between");
  // direction offsets of PCTurnOffEffect: west (-1,-1), east (+1,-1)
  avatar.object.facingDirection = EM.DIR_WEST;
  call("DoPCTurnOffEffect");
  assert.equal(map.metatileIdAt(pcX - 1, pcY), k.METATILE_Building_PC_Off);
}

// tv.c TurnOffTVScreen / TurnOnTVScreen: every MB_TELEVISION tile of Littleroot's Brendan house 1F
await enter("MAP_LITTLEROOT_TOWN_BRENDANS_HOUSE_1F");
{
  const k = rom.constants as Record<string, number>;
  const map = game.overworld.map;
  const tiles: [number, number][] = [];
  for (let y = MAP_OFFSET; y < map.ySize - MAP_OFFSET; y++) for (let x = MAP_OFFSET; x < map.xSize - MAP_OFFSET; x++) if (map.behaviorAt(x, y) === k.MB_TELEVISION) tiles.push([x, y]);
  assert.ok(tiles.length > 0, "the house has a television tile");
  call("TurnOnTVScreen");
  for (const [x, y] of tiles) assert.equal(map.metatileIdAt(x, y), k.METATILE_Building_TV_On);
  call("TurnOffTVScreen");
  for (const [x, y] of tiles) assert.equal(map.metatileIdAt(x, y), k.METATILE_Building_TV_Off);
}

// field_specials.c Petalburg Gym doors: room 1 has doors at x 1 and 7, y 104 (two metatiles tall)
await enter("MAP_PETALBURG_CITY_GYM");
{
  const k = rom.constants as Record<string, number>;
  const map = game.overworld.map;
  varSet(SV.x8004, 1);
  call("PetalburgGymUnlockRoomDoors");
  for (const x of [1, 7]) {
    assert.equal(map.metatileIdAt(x + MAP_OFFSET, 104 + MAP_OFFSET), k.METATILE_PetalburgGym_SlidingDoor_Frame4);
    assert.equal(map.metatileIdAt(x + MAP_OFFSET, 105 + MAP_OFFSET), k.METATILE_PetalburgGym_SlidingDoor_Frame4 + 8);
  }
  varSet(SV.x8004, 4); // room 4: one door at x 7, y 39
  // slide open: frame delays {0,1,1,1,1} → 0, then every second task run; the script is re-enabled at the end
  let enabled = 0;
  game.overworld.script.ScriptContext_Enable = () => { enabled++; };
  call("PetalburgGymSlideOpenRoomDoors");
  const frames: number[] = [];
  for (let i = 0; i < 12 && tasks.tasks.some(t => t.isActive); i++) { tasks.run(); frames.push(map.metatileIdAt(7 + MAP_OFFSET, 39 + MAP_OFFSET)); }
  assert.equal(frames[0], k.METATILE_PetalburgGym_SlidingDoor_Frame0, "first frame is drawn at once");
  assert.equal(map.metatileIdAt(7 + MAP_OFFSET, 39 + MAP_OFFSET), k.METATILE_PetalburgGym_SlidingDoor_Frame4);
  assert.equal(enabled, 1, "the script continues once");
  assert.equal(frames.length, 1 + 2 * 4, "frame 0 at once, then one frame per two runs");
}

// script_menu.c ScriptMenu_CreatePCMultichoice: result starts 0xFF; the menu task is the shared multichoice task
{
  flagSet(EM.FLAG_SYS_GAME_CLEAR);
  varSet(SV.RESULT, 0); // PREPARED: result differs from 0xFF so the special's own write is visible
  assert.equal(call("ScriptMenu_CreatePCMultichoice"), 1);
  assert.equal(varGet(SV.RESULT), 0xff);
  assert.equal(tasks.tasks.filter(t => t.isActive).length, 1);
  assert.equal(call("ScriptMenu_CreatePCMultichoice"), 0, "a second menu is refused while the task is active");
}
console.log("check:emerald-field-specials PASS (PREPARED: party, flags, vars, save fields, player position/facing; real exported maps)");
