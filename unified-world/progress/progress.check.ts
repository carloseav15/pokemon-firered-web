// Deterministic check of the progress model against the real exported flag IDs of the three decomps.
// Run: see unified-world/README.md. Requires unified-world/out/flag_ids.json (extract_flag_spaces.py).
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { ProgressStore, ABILITY_FLAGS, ABILITIES, REGIONS, REGION_SOURCE, BADGES_PER_REGION, type FlagIds, type Region } from "./progress";

const raw = JSON.parse(readFileSync("unified-world/out/flag_ids.json", "utf8"));
const ids = Object.fromEntries(REGIONS.map(r => [r, raw[REGION_SOURCE[r]]])) as FlagIds;
const id = (r: Region, name: string): number => {
  const v = ids[r].flags[name];
  assert.ok(v !== undefined, `${r} lacks ${name}`);
  return v;
};

// 0. Every name the model depends on exists in its region's real data (a typo would silently read as "unset").
let names = 0;
for (const r of REGIONS) {
  for (let n = 1; n <= BADGES_PER_REGION; n++) { id(r, `FLAG_BADGE0${n}_GET`); names++; }
  for (const name of Object.values(ABILITY_FLAGS[r])) { id(r, name!); names++; }
}

// 1. Isolation on a real, live collision: FireRed FLAG_HIDE_MOLTRES and Emerald FLAG_RESCUED_BIRCH share an ID.
assert.equal(id("kanto", "FLAG_HIDE_MOLTRES"), id("hoenn", "FLAG_RESCUED_BIRCH"), "expected a real ID collision");
{
  const p = new ProgressStore(ids);
  p.scope("kanto").flagSet(id("kanto", "FLAG_HIDE_MOLTRES"));
  assert.equal(p.scope("hoenn").flagGet(id("hoenn", "FLAG_RESCUED_BIRCH")), false, "namespaces leaked");
  assert.equal(p.scope("kanto").flagGet(id("kanto", "FLAG_HIDE_MOLTRES")), true);
}

// 2. Medals are derived per region and summed.
{
  const p = new ProgressStore(ids);
  for (const n of [1, 2, 3]) p.scope("kanto").flagSet(id("kanto", `FLAG_BADGE0${n}_GET`));
  p.scope("hoenn").flagSet(id("hoenn", "FLAG_BADGE01_GET"));
  assert.deepEqual([p.medals("kanto"), p.medals("johto"), p.medals("hoenn"), p.totalMedals()], [3, 0, 1, 4]);
  // Unflagged region ID with the same number must not count: set Emerald's badge-1 ID inside kanto.
  const q = new ProgressStore(ids);
  q.scope("kanto").flagSet(id("hoenn", "FLAG_BADGE01_GET"));
  assert.equal(q.medals("kanto"), id("hoenn", "FLAG_BADGE01_GET") === id("kanto", "FLAG_BADGE01_GET") ? 1 : 0);
}

// 3. Abilities come from any region's own event, without writing flags into the others.
{
  const p = new ProgressStore(ids);
  assert.deepEqual(p.abilities(), []);
  p.scope("hoenn").flagSet(id("hoenn", ABILITY_FLAGS.hoenn.surf!));
  assert.equal(p.hasAbility("surf"), true);
  assert.equal(p.scope("kanto").flagGet(id("kanto", ABILITY_FLAGS.kanto.surf!)), false, "ability leaked into kanto flags");
  p.scope("kanto").flagSet(id("kanto", ABILITY_FLAGS.kanto.cut!));
  assert.deepEqual(p.abilities(), ["cut", "fly", "surf", "strength", "flash", "rock_smash", "waterfall", "dive"]
    .filter(a => a === "cut" || a === "surf"));
  assert.equal(ABILITIES.length, 8);
}

// 4. Temporary flags/vars clear on map load; persistent ones do not; special ranges are never saved.
{
  const p = new ProgressStore(ids);
  const s = p.scope("kanto");
  const tempFlag = id("kanto", "FLAG_TEMP_1");
  const keepFlag = id("kanto", "FLAG_BADGE01_GET");
  s.flagSet(tempFlag); s.flagSet(keepFlag);
  s.varSet(ids.kanto.vars["VAR_TEMP_0"]!, 7);
  s.varSet(ids.kanto.vars["VAR_MAP_SCENE_VIRIDIAN_CITY_OLD_MAN"]!, 2);
  s.flagSet(0x4000 + 5); s.varSet(0x8000, 9); // runtime-only
  s.clearTemp();
  assert.equal(s.flagGet(tempFlag), false);
  assert.equal(s.varGet(ids.kanto.vars["VAR_TEMP_0"]!), 0);
  assert.equal(s.flagGet(keepFlag), true);
  assert.equal(s.varGet(ids.kanto.vars["VAR_MAP_SCENE_VIRIDIAN_CITY_OLD_MAN"]!), 2);
  const out = p.serialize();
  assert.ok(!out.regions.kanto.flags.includes(0x4005), "special flag was persisted");
  assert.equal(out.regions.kanto.vars[String(0x8000)], undefined, "scratch var was persisted");
}

// 5. Phase-1 criterion: medal in Kanto -> visit Johto -> medal there -> back, then save/load round trip.
{
  const p = new ProgressStore(ids, "kanto");
  p.scope("kanto").flagSet(id("kanto", "FLAG_BADGE01_GET"));
  p.visit("kanto", "MAP_PEWTER_CITY_GYM"); p.visit("johto", "MAP_VIOLET_CITY");
  p.addFlyPoint("johto", "MAP_VIOLET_CITY"); p.unlockLink("kanto-johto-route26");
  p.scope("johto").flagSet(id("johto", "FLAG_BADGE01_GET"));
  p.scope("johto").varSet(ids.johto.vars["VAR_TEMP_1"]!, 3); // temp var: must be saved as-is until cleared
  const save = JSON.parse(JSON.stringify(p.serialize()));
  const q = ProgressStore.restore(save, ids);
  assert.deepEqual(q.serialize(), p.serialize());
  assert.equal(q.totalMedals(), 2);
  assert.equal(q.hasVisited("johto", "MAP_VIOLET_CITY"), true);
  assert.equal(q.hasVisited("kanto", "MAP_VIOLET_CITY"), false, "visited maps are per region");
  assert.deepEqual(q.flyPoints(), [{ region: "johto", mapId: "MAP_VIOLET_CITY" }]);
  assert.equal(q.hasLink("kanto-johto-route26"), true);
  assert.equal(JSON.stringify(save), JSON.stringify(q.serialize()), "serialization is not deterministic");
  assert.throws(() => ProgressStore.restore({ ...save, version: 2 }, ids), /unsupported/);
}

// 6. A misspelled flag name fails loudly.
assert.throws(() => new ProgressStore(ids).flagId("kanto", "FLAG_NOT_REAL"), /no FLAG_NOT_REAL/);

console.log(`progress model PASS (${names} real flag names checked, 3 regions)`);
