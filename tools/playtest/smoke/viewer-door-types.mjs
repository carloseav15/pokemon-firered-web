// Runs the door observer (viewer-door-navigation.job.mjs) on one real exterior warp per 1x1 door graphic.
// Door types are chosen from sDoorGraphics (field_door.c) against real warps: 1x1 doors from Kanto exteriors,
// 1x2 doors from interior MB_WARP_DOOR warps (viewer-door-large.job.mjs).
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const doors = [
  ["METATILE_General_Door", "MAP_CELADON_CITY", 3], ["METATILE_General_SlidingSingleDoor", "MAP_CELADON_CITY", 4],
  ["METATILE_General_SlidingDoubleDoor", "MAP_CELADON_CITY", 0], ["METATILE_CeladonCity_DeptStoreDoor", "MAP_CELADON_CITY", 1],
  ["METATILE_CeruleanCity_Door", "MAP_CERULEAN_CITY", 0], ["METATILE_ViridianCity_Door", "MAP_VIRIDIAN_CITY", 1],
  ["METATILE_VermilionCity_Door", "MAP_VERMILION_CITY", 3], ["METATILE_LavenderTown_Door", "MAP_LAVENDER_TOWN", 2],
  ["METATILE_PalletTown_OaksLabDoor", "MAP_PALLET_TOWN", 2], ["METATILE_CinnabarIsland_LabDoor", "MAP_CINNABAR_ISLAND", 2],
  ["METATILE_FuchsiaCity_Door", "MAP_FUCHSIA_CITY", 1], ["METATILE_PewterCity_Door", "MAP_PEWTER_CITY", 1],
  ["METATILE_FuchsiaCity_SafariZoneDoor", "MAP_FUCHSIA_CITY", 0],
  // Sevii exteriors are outside the Kanto atlas and open as context maps (local coordinates).
  ["METATILE_SeviiIslands123_PokeCenterDoor", "MAP_ONE_ISLAND", 0], ["METATILE_SeviiIslands123_Door", "MAP_ONE_ISLAND", 1],
  ["METATILE_SeviiIslands123_GameCornerDoor", "MAP_TWO_ISLAND", 0], ["METATILE_SeviiIslands45_DayCareDoor", "MAP_FOUR_ISLAND", 1],
  ["METATILE_SeviiIslands45_Door", "MAP_FOUR_ISLAND", 2], ["METATILE_SeviiIslands67_Door", "MAP_SIX_ISLAND", 2],
  // Saffron City (context map reached through its gate houses).
  ["METATILE_SaffronCity_SilphCoDoor", "MAP_SAFFRON_CITY", 0], ["METATILE_SaffronCity_Door", "MAP_SAFFRON_CITY", 1],
];
const large = [
  ["METATILE_DepartmentStore_ElevatorDoor", "MAP_CELADON_CITY_DEPARTMENT_STORE_2F", 0], ["METATILE_SilphCo_HideoutElevatorDoor", "MAP_ROCKET_HIDEOUT_B1F", 4],
  ["METATILE_SilphCo_ElevatorDoor", "MAP_SILPH_CO_1F", 4], ["METATILE_SSAnne_Door", "MAP_SSANNE_1F_ROOM1", 0],
  ["METATILE_TrainerTower_LobbyElevatorDoor", "MAP_TRAINER_TOWER_LOBBY", 2], ["METATILE_TrainerTower_RoofElevatorDoor", "MAP_TRAINER_TOWER_ROOF", 0],
  ["METATILE_PokemonCenter_CableClubDoor", "MAP_CELADON_CITY_POKEMON_CENTER_2F", 1],
];
const smallJob = resolve("tools/playtest/smoke/viewer-door-navigation.job.mjs");
const largeJob = resolve("tools/playtest/smoke/viewer-door-large.job.mjs");
let failed = false;
for (const [name, map, warp, job = smallJob] of [...doors, ...large.map(d => [...d, largeJob])]) {
  const env = { ...process.env, PW_BASE: process.env.PW_BASE ?? "http://localhost:5173/", PW_DOOR_MAP: map, PW_DOOR_WARP: String(warp) };
  const r = spawnSync("node", ["tools/playtest/pw.mjs", job, resolve(process.env.TMPDIR ?? "/tmp", `pw-door-${name}`)], { env, encoding: "utf8", timeout: 240000 });
  const text = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  const line = text.slice(text.lastIndexOf('{"ok"'));
  let payload; try { payload = JSON.parse(line); } catch { payload = { ok: false, error: text.slice(-300) }; }
  if (!payload.ok) failed = true;
  console.log(`${payload.ok ? "OK   " : "FALLO"} ${name} (${map}#${warp})${payload.ok ? "" : " — " + String(payload.error).replace(/\s+/g, " ").slice(0, 300)}`);
}
if (failed) process.exitCode = 1;
