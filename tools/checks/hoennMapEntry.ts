// Hoenn map entry (src/viewer/hoennMapEntry.ts runEmeraldMapEntry): entering Littleroot Town runs
// pokeemerald's LittlerootTown_OnTransition through the core script VM on the exported Emerald
// scripts.bin. Its effects land in the Hoenn bank, the live location is Hoenn's own (banked field),
// Kanto progress and location stay intact in the stored save, and the bank survives save/continue. Expected values come from data/maps/LittlerootTown/scripts.inc
// and data/scripts/rival_graphics.inc. Scope: storage + VM; no browser or rendering.
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../../src/games/firered/generated/constants.ts";
import * as EM from "../../src/games/emerald/generated/constants.ts";
import { flagGet, flagSet, newSaveData, save, setSave, varGet, varSet } from "../../src/games/firered/save.ts";
import { encode } from "../../src/core/gba/charmap.ts";
import { rom, setDataRoot } from "../../src/core/rom.ts";
import { enterKanto, writeWorldSave, WORLD_SAVE_KEY, type WorldSaveData } from "../../src/viewer/regionSave.ts";
import { continueRegionalSession, initializeRegionalSession, resetViewerSessionInitialized, saveViewerSession } from "../../src/viewer/session.ts";
import { runEmeraldMapEntry } from "../../src/viewer/hoennMapEntry.ts";
import { Game } from "../../src/games/firered/game.ts";

const storage = new Map<string, string>();
(globalThis as unknown as { localStorage: Pick<Storage, "getItem" | "setItem" | "removeItem"> }).localStorage = {
  getItem: k => storage.get(k) ?? null,
  setItem: (k, v) => { storage.set(k, v); },
  removeItem: k => { storage.delete(k); },
};
const stored = (): WorldSaveData => JSON.parse(storage.get(WORLD_SAVE_KEY)!);
const bit = (flags: number[], id: number): boolean => ((flags[id >> 3] ?? 0) & (1 << (id & 7))) !== 0;

setDataRoot("/emerald");
rom.charmap = JSON.parse(readFileSync("public/emerald/charmap.json", "utf8"));

// PREPARED: a stored Kanto trainer (male) with a Kanto flag set at the numeric ID of the flag the
// Littleroot script sets, and a FireRed location the Hoenn entry must leave untouched.
const data: WorldSaveData = newSaveData();
data.playerName = Array.from(encode("RED"));
data.playerGender = C.MALE;
data.viewerStart = "definitive-kanto-v1";
setSave(data);
enterKanto();
const kantoFlag = C.FLAG_BADGE01_GET; // a Kanto flag that is clear in this save
assert.ok(EM.FLAG_VISITED_LITTLEROOT_TOWN < C.FLAGS_COUNT && !flagGet(EM.FLAG_VISITED_LITTLEROOT_TOWN), "the Emerald flag ID addresses a clear FireRed flag");
flagSet(kantoFlag);
varSet(C.VAR_MAP_SCENE_PALLET_TOWN_OAK, 3);
save.location = { mapGroup: 3, mapNum: 0, warpId: -1, x: 5, y: 6 };
save.pos = { x: 5, y: 6 };
(save as WorldSaveData).viewerNavigation = { mapId: "MAP_PALLET_TOWN", x: 5, y: 6, direction: "south", dynamic: null, region: "kanto" } as WorldSaveData["viewerNavigation"];
assert.equal(writeWorldSave(), true);
const kantoBefore = stored();

resetViewerSessionInitialized();
initializeRegionalSession("hoenn", () => {});
assert.equal(save.flags.length, EM.NUM_FLAG_BYTES, "the Hoenn bank is live");
// PREPARED: temporary data that Emerald's ClearTempFieldEventData must clear on entry.
varSet(EM.VAR_TEMP_1, 7); // PREPARED
flagSet(EM.FLAG_SYS_USE_STRENGTH); // PREPARED
flagSet(EM.FLAG_SYS_ENC_UP_ITEM); // PREPARED; named differently in FireRed: only Emerald's ClearTempFieldEventData clears it
assert.equal(varGet(EM.VAR_LITTLEROOT_INTRO_STATE), 0);
assert.equal(flagGet(EM.FLAG_RESCUED_BIRCH), false);
console.log("PREPARED: VAR_TEMP_1=7, FLAG_SYS_USE_STRENGTH and FLAG_SYS_ENC_UP_ITEM set before entry");

const nav = { mapId: "MAP_LITTLEROOT_TOWN", x: 10, y: 10, direction: "south" as const, dynamic: null };
await rom.load();
const canvas = { width: 240, height: 160, getContext: () => ({}) } as unknown as HTMLCanvasElement;
const report = await runEmeraldMapEntry(new Game(canvas), nav);
console.log(JSON.stringify({ ...report, changedTemplates: report.changedTemplates.map(t => [t.localId, t.x, t.y, t.movementType]) }));

// LoadMapFromWarp: ClearTempFieldEventData (Emerald IDs).
assert.equal(varGet(EM.VAR_TEMP_1), 0, "temp vars cleared");
assert.equal(flagGet(EM.FLAG_SYS_USE_STRENGTH), false, "FLAG_SYS_USE_STRENGTH cleared");
assert.equal(flagGet(EM.FLAG_SYS_ENC_UP_ITEM), false, "FLAG_SYS_ENC_UP_ITEM cleared");
// LittlerootTown_OnTransition
assert.equal(report.transition, "LittlerootTown_OnTransition");
assert.equal(flagGet(EM.FLAG_VISITED_LITTLEROOT_TOWN), true, "setflag FLAG_VISITED_LITTLEROOT_TOWN");
assert.equal(varGet(EM.VAR_OBJ_GFX_ID_0), EM.OBJ_EVENT_GFX_RIVAL_MAY_NORMAL, "Common_EventScript_SetupRivalGfxId for a male player");
const twin = report.changedTemplates.find(t => t.localId === EM.LOCALID_LITTLEROOT_TWIN);
assert.ok(twin, "LittlerootTown_EventScript_SetTwinGuardingRoutePos moved the twin");
assert.deepEqual([twin.x, twin.y, twin.movementType], [7, 2, EM.MOVEMENT_TYPE_FACE_DOWN]);
assert.equal(report.load, null, "Littleroot has no ON_LOAD script");
// The live location fields are the Hoenn bank's own while Hoenn is live (regionSave REGIONAL_FIELD_KEYS).
const littleroot = rom.mapNum("MAP_LITTLEROOT_TOWN");
assert.deepEqual(save.location, { mapGroup: littleroot >> 8, mapNum: littleroot & 0xff, warpId: -1, x: 10, y: 10 });

// Save in Hoenn, then continue: the effect lives in the Hoenn bank only.
assert.equal(saveViewerSession(nav), true);
const after = stored();
assert.deepEqual(after.flags, kantoBefore.flags, "Kanto flags unchanged");
assert.deepEqual(after.vars, kantoBefore.vars, "Kanto vars unchanged");
assert.deepEqual(after.location, kantoBefore.location, "FireRed location unchanged");
assert.equal(bit(after.flags, EM.FLAG_VISITED_LITTLEROOT_TOWN), false, "the colliding FireRed flag stays clear");
assert.equal(bit(after.world!.regions.hoenn!.flags, EM.FLAG_VISITED_LITTLEROOT_TOWN), true, "the Hoenn bank stores the visit");
assert.equal(after.world!.regions.hoenn!.vars[EM.VAR_OBJ_GFX_ID_0 - EM.VARS_START], EM.OBJ_EVENT_GFX_RIVAL_MAY_NORMAL);
resetViewerSessionInitialized();
continueRegionalSession("hoenn", () => assert.fail("existing bank must not be reinitialized"));
assert.equal(flagGet(EM.FLAG_VISITED_LITTLEROOT_TOWN), true, "continue restores the Hoenn bank");

console.log("check:hoenn-map-entry PASS: LittlerootTown_OnTransition ran from Emerald scripts.bin into the Hoenn bank; Kanto progress and location unchanged");
