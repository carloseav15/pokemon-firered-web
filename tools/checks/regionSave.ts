// Regional save contract (src/viewer/regionSave.ts, session.ts): Kanto and Hoenn progress
// stay isolated through save/reload in both directions, globals are shared, and v1 saves migrate.
// Scope: storage layer and session entry points with a mocked localStorage; no browser travel.
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import * as C from "../../src/games/firered/generated/constants.ts";
import * as EM from "../../src/games/emerald/generated/constants.ts";
import { flagGet, flagSet, newSaveData, save, setSave, varGet, varSet } from "../../src/games/firered/save.ts";
import { encode } from "../../src/core/gba/charmap.ts";
import { rom } from "../../src/core/rom.ts";
import { readFileSync } from "node:fs";
import {
  enterKanto, loadWorldSave, reloadWorldSave, resetWorldRegion, regionSessionFlags, setRegionSessionFlags,
  writeWorldSave, WORLD_SAVE_KEY, VIEWER_SAVE_KEY, WORLD_SAVE_VERSION, type WorldSaveData,
} from "../../src/viewer/regionSave.ts";
import { continueRegionalSession, initializeRegionalSession, resetViewerSessionInitialized, saveViewerSession, viewerCheckpoint } from "../../src/viewer/session.ts";

rom.charmap = JSON.parse(readFileSync("public/fr/charmap.json", "utf8"));
// PREPARED harness data: a Hoenn save writes its banked location in Emerald map numbering (maps.json of the
// Emerald export); Kanto map IDs are absent there and resolve through the FireRed constants.
(rom as unknown as { mapIndex: unknown }).mapIndex = JSON.parse(readFileSync("public/emerald/maps.json", "utf8"));
rom.healLocations = JSON.parse(readFileSync("public/emerald/data/heal_locations.json", "utf8"));
rom.constants = EM;
const storage = new Map<string, string>();
(globalThis as unknown as { localStorage: Pick<Storage, "getItem" | "setItem" | "removeItem"> }).localStorage = {
  getItem: k => storage.get(k) ?? null,
  setItem: (k, v) => { storage.set(k, v); },
  removeItem: k => { storage.delete(k); },
};
const stored = (key = WORLD_SAVE_KEY): WorldSaveData => JSON.parse(storage.get(key)!);
const hoennInitialFlag = EM.FLAG_HIDE_LITTLEROOT_TOWN_FAT_MAN; // stands in for index.initialFlags
const initHoennBank = () => flagSet(hoennInitialFlag); // PREPARED: initial-flag setup the caller supplies

// A Hoenn flag whose numeric ID is also a FireRed flag that Kanto leaves clear: the collision case.
const HOENN_FLAG = EM.FLAG_BADGE01_GET;
const HOENN_VAR = EM.VAR_LITTLEROOT_INTRO_STATE;
const KANTO_FLAG = C.FLAG_BADGE01_GET;
const KANTO_VAR = C.VAR_MAP_SCENE_PALLET_TOWN_OAK;
assert.ok(HOENN_FLAG !== KANTO_FLAG && HOENN_FLAG < C.FLAGS_COUNT, "the Hoenn flag ID addresses a different FireRed flag");

// PREPARED: a started Kanto game stands in for initializeViewerSession (which needs the fetched ROM data).
function prepareKantoGame(): void {
  const data: WorldSaveData = newSaveData();
  data.playerName = Array.from(encode("RED"));
  data.viewerStart = "definitive-kanto-v1";
  setSave(data);
  enterKanto();
  flagSet(KANTO_FLAG); // PREPARED Kanto progress
  varSet(KANTO_VAR, 3); // PREPARED Kanto progress
  save.money = 5000;
  // PREPARED registered Kanto respawn from its exported heal table.
  const h = JSON.parse(readFileSync("public/fr/data/heal_locations.json", "utf8")).heal_locations[0];
  const num = (C as unknown as Record<string, number>)[h.map];
  save.lastHealLocation = { mapGroup: num >> 8, mapNum: num & 255, warpId: -1, x: h.x, y: h.y };
}
const kantoNav = { mapId: "MAP_PALLET_TOWN", x: 5, y: 6, direction: "south" as const, dynamic: null };
const hoennNav = { mapId: "MAP_LITTLEROOT_TOWN", x: 8, y: 8, direction: "north" as const, dynamic: null };

// --- Kanto → Hoenn → Kanto ---
resetViewerSessionInitialized();
prepareKantoGame();
// PREPARED: Kanto save with an explicit FireRed location (syncViewerLocation needs map numbering).
(save as WorldSaveData).viewerNavigation = { ...kantoNav, region: "kanto" };
assert.equal(writeWorldSave(), true);
const kantoFlagsBefore = stored().flags.slice();
const kantoVarsBefore = stored().vars.slice();
const kantoHealBefore = structuredClone(stored().lastHealLocation);
assert.equal(stored().world!.version, WORLD_SAVE_VERSION);
assert.equal(stored(VIEWER_SAVE_KEY).world!.activeRegion, "kanto");

resetViewerSessionInitialized();
initializeRegionalSession("hoenn", initHoennBank);
assert.equal(flagGet(KANTO_FLAG), KANTO_FLAG === hoennInitialFlag, "Hoenn bank does not see Kanto flags");
assert.equal(flagGet(hoennInitialFlag), true, "a new Hoenn bank runs its initial flags");
assert.equal(save.money, 5000, "money is global");
const arrivalHeal = structuredClone(save.lastHealLocation);
const slateport = rom.mapNum("MAP_SLATEPORT_CITY");
const sourceHeal = rom.healLocations.heal_locations.find(h => h.id === "HEAL_LOCATION_SLATEPORT_CITY")!;
assert.deepEqual(arrivalHeal, { mapGroup: slateport >> 8, mapNum: slateport & 255, warpId: -1, x: sourceHeal.x, y: sourceHeal.y }, "new traveler uses exported Slateport heal warp");
flagSet(HOENN_FLAG); // PREPARED Hoenn progress
varSet(HOENN_VAR, 2); // PREPARED Hoenn progress
save.money = 4200;
setRegionSessionFlags("hoenn", ["FLAG_AWAKENED_RAYQUAZA"]);
assert.equal(saveViewerSession(hoennNav), true, "Hoenn saves on a stored Kanto trainer");
const afterHoenn = stored();
assert.deepEqual(afterHoenn.flags, kantoFlagsBefore, "Hoenn save leaves Kanto flags unchanged");
assert.deepEqual(afterHoenn.vars, kantoVarsBefore, "Hoenn save leaves Kanto vars unchanged");
assert.deepEqual(afterHoenn.viewerNavigation, { ...kantoNav, region: "kanto" }, "Hoenn save leaves Kanto navigation unchanged");
assert.equal(afterHoenn.world!.activeRegion, "hoenn");
// Location fields are regional (REGIONAL_FIELD_KEYS): the Hoenn save banks its own and leaves Kanto's.
const littleroot = rom.mapNum("MAP_LITTLEROOT_TOWN");
assert.deepEqual(afterHoenn.world!.regions.hoenn!.field!.location, { mapGroup: littleroot >> 8, mapNum: littleroot & 0xff, warpId: -1, x: 8, y: 8 }, "Hoenn location banked");
assert.deepEqual(afterHoenn.location, newSaveData().location, "the stored top-level location stays Kanto's (unset in this PREPARED Kanto save)");
assert.deepEqual(afterHoenn.world!.regions.hoenn!.viewerNavigation, { ...hoennNav, region: "hoenn" });
assert.deepEqual(stored(VIEWER_SAVE_KEY), afterHoenn, "both browser keys hold the same world save");

// Back to Kanto: continue path reloads the canonical save.
resetViewerSessionInitialized();
assert.ok(reloadWorldSave());
enterKanto();
assert.equal(flagGet(KANTO_FLAG), true);
assert.equal(flagGet(HOENN_FLAG), false, "the Hoenn flag ID did not set the colliding FireRed flag");
assert.equal(varGet(KANTO_VAR), 3);
assert.equal(save.money, 4200, "money spent in Hoenn persists in Kanto");
assert.deepEqual(viewerCheckpoint(), { ...kantoNav, region: "kanto" });
assert.deepEqual(regionSessionFlags("hoenn"), ["FLAG_AWAKENED_RAYQUAZA"]);

// --- Inverse: Kanto changes do not alter Hoenn progress ---
const hoennBankBefore = structuredClone(stored().world!.regions.hoenn!);
flagSet(C.FLAG_BADGE02_GET); // PREPARED later Kanto progress
varSet(KANTO_VAR, 4); // PREPARED later Kanto progress
assert.equal(writeWorldSave(), true);
assert.deepEqual(stored().world!.regions.hoenn, hoennBankBefore, "Kanto save leaves the Hoenn bank unchanged");
assert.equal(stored().world!.activeRegion, "kanto");
resetViewerSessionInitialized();
const nav = continueRegionalSession("hoenn", () => assert.fail("existing bank must not be reinitialized"));
assert.deepEqual(nav, { ...hoennNav, region: "hoenn" });
assert.equal(flagGet(HOENN_FLAG), true);
assert.equal(varGet(HOENN_VAR), 2);
assert.equal(flagGet(C.FLAG_BADGE02_GET), C.FLAG_BADGE02_GET === HOENN_FLAG || C.FLAG_BADGE02_GET === hoennInitialFlag, "Kanto flag not visible in Hoenn");
assert.equal(save.money, 4200);
assert.deepEqual(save.lastHealLocation, arrivalHeal, "Continue preserves initial Hoenn respawn");
// PREPARED legacy defect: already-created bank with FireRed dummy warp, not a new bank.
const legacy = stored();
legacy.world!.regions.hoenn!.field!.lastHealLocation = newSaveData().lastHealLocation;
storage.set(WORLD_SAVE_KEY, JSON.stringify(legacy));
resetViewerSessionInitialized();
continueRegionalSession("hoenn", () => assert.fail("repair must not reset flags"));
assert.deepEqual(save.lastHealLocation, arrivalHeal, "Continue repairs legacy dummy respawn");
assert.equal(flagGet(HOENN_FLAG), true);
// PREPARED registered source respawn: entry must preserve it rather than assign Slateport again.
const registered = stored();
const otherHeal = { ...arrivalHeal, x: 6, y: 17, mapNum: rom.mapNum("MAP_OLDALE_TOWN") & 255 };
registered.world!.regions.hoenn!.field!.lastHealLocation = otherHeal;
storage.set(WORLD_SAVE_KEY, JSON.stringify(registered));
resetViewerSessionInitialized();
continueRegionalSession("hoenn", () => assert.fail("existing bank"));
assert.deepEqual(save.lastHealLocation, otherHeal, "Continue does not overwrite registered respawn");
assert.deepEqual(stored().lastHealLocation, kantoHealBefore, "Kanto respawn is isolated");

// Hoenn without a stored Kanto trainer explores unsaved and refuses to write.
storage.clear();
resetViewerSessionInitialized();
initializeRegionalSession("hoenn", initHoennBank);
assert.equal(saveViewerSession(hoennNav), false, "no Hoenn-only world is created");
assert.equal(storage.size, 0);

// --- v1 migration and continue ---
// PREPARED: a v1 Kanto save as session.ts wrote it before the world contract.
storage.clear();
resetWorldRegion();
const v1: WorldSaveData = newSaveData();
v1.playerName = Array.from(encode("RED"));
v1.viewerStart = "definitive-kanto-v1";
v1.viewerNavigation = { ...kantoNav };
v1.flags[KANTO_FLAG >> 3] |= 1 << (KANTO_FLAG & 7);
v1.money = 1234;
storage.set(WORLD_SAVE_KEY, JSON.stringify(v1));
const migrated = loadWorldSave()!;
assert.equal(migrated.world!.version, WORLD_SAVE_VERSION);
assert.equal(migrated.world!.started.kanto, true);
assert.equal(migrated.world!.started.hoenn, false);
assert.deepEqual(migrated.viewerNavigation, { ...kantoNav, region: "kanto" });
assert.equal(migrated.world!.migration, undefined, "a clean v1 save needs no repair");
resetViewerSessionInitialized();
assert.ok(reloadWorldSave());
enterKanto();
assert.equal(flagGet(KANTO_FLAG), true);
assert.equal(save.money, 1234);
assert.deepEqual(viewerCheckpoint(), { ...kantoNav, region: "kanto" });
resetViewerSessionInitialized();
initializeRegionalSession("hoenn", initHoennBank);
assert.equal(saveViewerSession(hoennNav), true, "a migrated v1 trainer can continue into Hoenn and save");
assert.equal(stored().world!.version, WORLD_SAVE_VERSION);
assert.equal(stored().money, 1234);

// PREPARED: a v1 save overwritten by the old Hoenn path (fresh trainer, Emerald flags, Hoenn navigation).
storage.clear();
const contaminated: WorldSaveData = newSaveData();
contaminated.flags[HOENN_FLAG >> 3] |= 1 << (HOENN_FLAG & 7);
contaminated.viewerNavigation = { ...hoennNav };
storage.set(VIEWER_SAVE_KEY, JSON.stringify(contaminated));
const repaired = loadWorldSave()!;
assert.equal(repaired.viewerNavigation, undefined, "Hoenn navigation is not continued in Kanto");
assert.equal(repaired.world!.started.kanto, false, "a Hoenn-only v1 save starts a new Kanto game");
assert.deepEqual(repaired.world!.regions.hoenn!.viewerNavigation, { ...hoennNav, region: "hoenn" });
const bank = repaired.world!.regions.hoenn!;
assert.equal((bank.flags[HOENN_FLAG >> 3]! & (1 << (HOENN_FLAG & 7))) !== 0, true, "Emerald flags moved to the Hoenn bank");
assert.equal(repaired.flags.every(b => b === 0), true, "Kanto flags no longer carry Emerald IDs");
assert.match(repaired.world!.migration!.note, /Hoenn-only/);

console.log(JSON.stringify({ status: "PASS", scope: "PREPARED Kanto/Hoenn saves with mocked localStorage; regional isolation, shared money, v1 migration; browser travel and team continuity in play not covered" }));
