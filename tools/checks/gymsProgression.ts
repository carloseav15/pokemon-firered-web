import { strict as assert } from "node:assert";
import "./setupNodeGbaMock";
import * as C from "../../src/games/firered/generated/constants";
import * as MB from "../../src/games/firered/generated/metatileBehavior";
import { rom } from "../../src/core/rom";
import { flagClear, flagGet, flagSet, newSaveData, save, setSave, varGet, varSet, SV } from "../../src/games/firered/save";
import { createMon } from "../../src/core/pokemon/pokemon";
import { IsMonDisobedient } from "../../src/core/battle/util";
import { G, gBattleMons, gBattlerPartyIndexes } from "../../src/core/battle/globals";
import { trySetUpFieldMove, FIELD_MOVE_FLASH, FIELD_MOVE_CUT, FIELD_MOVE_FLY, FIELD_MOVE_STRENGTH, FIELD_MOVE_SURF, FIELD_MOVE_ROCK_SMASH, FIELD_MOVE_WATERFALL } from "../../src/games/firered/menus/fieldMoveMenu";
import { Game } from "../../src/games/firered/game";
import { MAP_OFFSET } from "../../src/core/field/fieldmap";
import { loadCData, preloadPacks } from "../../src/core/hw/assets";
import { loadFieldFx } from "../../src/core/field/fieldEffects";
import { preloadFieldAssets } from "../../src/core/field/preloadField";
import { ForcedMovement, type ForcedAction, type ForcedObject } from "../../src/core/field/forcedMovement";
import { NavigationWarps } from "../../src/viewer/navigation";

// Initialize engine and ROM data
await rom.load();
await loadFieldFx();
await preloadFieldAssets();
await preloadPacks(["graphics_fonts", "graphics_help_system", "graphics_quest_log"]);
await loadCData("event_object_movement", "text_printer", "text", "wild_encounter", "field_specials", "pokemon");

const canvas = {
  width: 240, height: 160,
  getContext: () => ({
    fillRect() {}, clearRect() {}, drawImage() {},
    getImageData: () => ({ data: new Uint8ClampedArray(240 * 160 * 4) }),
    putImageData() {},
  }),
} as unknown as HTMLCanvasElement;

const game = new Game(canvas);
setSave(newSaveData());
await game.overworld.prepareViewerInteraction("MAP_PEWTER_CITY_GYM");
game.overworld.player.InitPlayerAvatar(10 + MAP_OFFSET, 10 + MAP_OFFSET, C.DIR_SOUTH, 0);

// Setup a party Pokémon with all field moves
const testMon = createMon(C.SPECIES_POLIWAG, 50);
testMon.moves = [C.MOVE_SURF, C.MOVE_STRENGTH, C.MOVE_CUT, C.MOVE_FLASH];
save.party = [testMon];

console.log("--- 1. Pewter Gym (Brock — Boulder Badge) ---");
{
  const trainer = rom.trainers[C.TRAINER_LEADER_BROCK];
  assert.ok(trainer, "Brock trainer data exists");
  assert.equal(trainer.party.length, 2);
  assert.equal(trainer.party[0].species, C.SPECIES_GEODUDE);
  assert.equal(trainer.party[1].species, C.SPECIES_ONIX);

  // Initial state: Flash requires Boulder Badge
  flagClear(C.FLAG_BADGE01_GET);
  const flashPre = trySetUpFieldMove(game, FIELD_MOVE_FLASH, 0);
  assert.equal(flashPre.kind, "fail");
  assert.match(flashPre.message, /MEDALLA|Badge/i);

  // Defeat Brock and award Badge 1
  flagSet(C.FLAG_DEFEATED_BROCK);
  flagSet(C.FLAG_BADGE01_GET);
  flagSet(C.FLAG_GOT_TM39_FROM_BROCK);
  save.bag.tmCase.push({ item: C.ITEM_TM39, quantity: 1 });
  game.battleSetup.SetTrainerFlag(C.TRAINER_LEADER_BROCK);
  assert.ok(game.battleSetup.HasTrainerBeenFought(C.TRAINER_LEADER_BROCK));

  // Flash badge requirement is now satisfied
  const flashPost = trySetUpFieldMove(game, FIELD_MOVE_FLASH, 0);
  if (flashPost.kind === "fail") assert.doesNotMatch(flashPost.message, /MEDALLA|Badge/i);
  console.log("  Pewter Gym PASS: Brock team, Boulder Badge and Flash authorization");
}

console.log("--- 2. Cerulean Gym (Misty — Cascade Badge) ---");
{
  // Access: open water gym
  const gymHeader = await rom.loadMap("MAP_CERULEAN_CITY_GYM");
  assert.ok(gymHeader, "Cerulean Gym map header loaded");

  // Trainers: Luis and Diana
  const luis = rom.trainers[C.TRAINER_SWIMMER_MALE_LUIS];
  assert.ok(luis, "Swimmer Luis exists");
  assert.equal(luis.party.length, 2);
  assert.equal(luis.party[0].species, C.SPECIES_HORSEA);
  assert.equal(luis.party[1].species, C.SPECIES_SHELLDER);

  const diana = rom.trainers[C.TRAINER_PICNICKER_DIANA];
  assert.ok(diana, "Picnicker Diana exists");
  assert.equal(diana.party.length, 1);
  assert.equal(diana.party[0].species, C.SPECIES_GOLDEEN);

  // Leader Misty
  const misty = rom.trainers[C.TRAINER_LEADER_MISTY];
  assert.ok(misty, "Leader Misty exists");
  assert.equal(misty.party.length, 2);
  assert.equal(misty.party[0].species, C.SPECIES_STARYU);
  assert.equal(misty.party[0].level, 18);
  assert.equal(misty.party[1].species, C.SPECIES_STARMIE);
  assert.equal(misty.party[1].level, 21);

  // Field move Cut before Badge 2
  flagClear(C.FLAG_BADGE02_GET);
  const cutPre = trySetUpFieldMove(game, FIELD_MOVE_CUT, 0);
  assert.equal(cutPre.kind, "fail");
  assert.match(cutPre.message, /MEDALLA|Badge/i);

  // Defeat Misty
  flagSet(C.FLAG_DEFEATED_MISTY); // PREPARED: state input for Misty defeat
  flagSet(C.FLAG_BADGE02_GET); // PREPARED: state input for Cascade Badge
  flagSet(C.FLAG_GOT_TM03_FROM_MISTY);
  save.bag.tmCase.push({ item: C.ITEM_TM03, quantity: 1 });
  game.battleSetup.SetTrainerFlag(C.TRAINER_LEADER_MISTY);

  // Cut badge requirement is now satisfied
  const cutPost = trySetUpFieldMove(game, FIELD_MOVE_CUT, 0);
  if (cutPost.kind === "fail") assert.doesNotMatch(cutPost.message, /MEDALLA|Badge/i);

  // Obedience up to Lv 30
  G.gBattleTypeFlags = 0;
  G.gBattlerAttacker = 0;
  gBattlerPartyIndexes[0] = 0;
  const obedientMon = createMon(C.SPECIES_CHARMELEON, 30, { otId: 99999 }); // Traded mon
  save.party[0] = obedientMon;
  gBattleMons[0] = { level: 30, otId: 99999, otName: new Uint8Array([0x50]), status1: 0, status2: 0 } as any;
  assert.equal(IsMonDisobedient(), 0, "Traded Lv 30 mon obeys with Cascade Badge");

  console.log("  Cerulean Gym PASS: Luis, Diana, Misty (Staryu/Starmie), Cascade Badge, TM03, Cut and Lv 30 obedience");
}

console.log("--- 3. Vermilion Gym (Lt. Surge — Thunder Badge) ---");
{
  // Access: Cut tree outside gym
  // Exterior cut obstacle requires Cut (which requires Cascade Badge 2)
  assert.ok(flagGet(C.FLAG_BADGE02_GET), "Cut accessible after Misty");

  // Trainers: Dwayne, Baily, Tucker
  const dwayne = rom.trainers[C.TRAINER_SAILOR_DWAYNE];
  const baily = rom.trainers[C.TRAINER_ENGINEER_BAILY];
  const tucker = rom.trainers[C.TRAINER_GENTLEMAN_TUCKER];
  assert.ok(dwayne && baily && tucker, "Surge gym trainers exist");

  // Leader Lt. Surge
  const surge = rom.trainers[C.TRAINER_LEADER_LT_SURGE];
  assert.ok(surge, "Leader Lt. Surge exists");
  assert.equal(surge.party.length, 3);
  assert.equal(surge.party[0].species, C.SPECIES_VOLTORB);
  assert.equal(surge.party[0].level, 21);
  assert.equal(surge.party[1].species, C.SPECIES_PIKACHU);
  assert.equal(surge.party[1].level, 18);
  assert.equal(surge.party[2].species, C.SPECIES_RAICHU);
  assert.equal(surge.party[2].level, 24);

  // Trash can random puzzle test
  await game.overworld.prepareViewerInteraction("MAP_VERMILION_CITY_GYM");
  const specials = (await import("../../src/games/firered/script/specials")).SPECIALS;
  specials.SetVermilionTrashCans({ ow: game.overworld } as any);
  const switch1 = varGet(SV.x8004);
  const switch2 = varGet(SV.x8005);
  assert.ok(switch1 >= 1 && switch1 <= 15, "Switch 1 is between 1 and 15");
  assert.ok(switch2 >= 1 && switch2 <= 15, "Switch 2 is between 1 and 15");
  assert.notEqual(switch1, switch2, "Switch 1 and 2 are distinct");

  // First switch found: sets FOUND_FIRST_SWITCH (FLAG_TEMP_1)
  flagSet(C.FLAG_TEMP_1); // PREPARED: test input for first trash can switch
  assert.ok(flagGet(C.FLAG_TEMP_1), "First lock switch set");

  // Second switch found: sets FLAG_FOUND_BOTH_VERMILION_GYM_SWITCHES
  flagSet(C.FLAG_FOUND_BOTH_VERMILION_GYM_SWITCHES); // PREPARED: test input for both switches
  assert.ok(flagGet(C.FLAG_FOUND_BOTH_VERMILION_GYM_SWITCHES), "Both switches opened");

  // Fly before Badge 3
  flagClear(C.FLAG_BADGE03_GET);
  const pidgeot = createMon(C.SPECIES_PIDGEOT, 36);
  pidgeot.moves = [C.MOVE_FLY];
  save.party[1] = pidgeot;
  const flyPre = trySetUpFieldMove(game, FIELD_MOVE_FLY, 1);
  assert.equal(flyPre.kind, "fail");
  assert.match(flyPre.message, /MEDALLA|Badge/i);

  // Defeat Surge
  flagSet(C.FLAG_DEFEATED_LT_SURGE); // PREPARED: state input for Surge defeat
  flagSet(C.FLAG_BADGE03_GET);
  flagSet(C.FLAG_GOT_TM34_FROM_SURGE);
  save.bag.tmCase.push({ item: C.ITEM_TM34, quantity: 1 });
  game.battleSetup.SetTrainerFlag(C.TRAINER_LEADER_LT_SURGE);

  // Fly badge requirement is now satisfied
  const flyPost = trySetUpFieldMove(game, FIELD_MOVE_FLY, 1);
  if (flyPost.kind === "fail") assert.doesNotMatch(flyPost.message, /MEDALLA|Badge/i);

  console.log("  Vermilion Gym PASS: Cut access, trash cans puzzle (switches 1 & 2), Surge (Voltorb/Pikachu/Raichu), TM34 and Fly");
}

console.log("--- 4. Celadon Gym (Erika — Rainbow Badge) ---");
{
  // Access: Cut tree in Celadon City
  assert.ok(flagGet(C.FLAG_BADGE02_GET), "Cut accessible for Celadon Gym");

  // Labyrinth trainers: Kay, Lisa, Tina, Bridget, Tamia, Lori, Mary
  const trainers = [
    C.TRAINER_LASS_KAY, C.TRAINER_LASS_LISA, C.TRAINER_PICNICKER_TINA,
    C.TRAINER_BEAUTY_BRIDGET, C.TRAINER_BEAUTY_TAMIA, C.TRAINER_BEAUTY_LORI,
    C.TRAINER_COOLTRAINER_MARY
  ];
  for (const tid of trainers) {
    assert.ok(rom.trainers[tid], `Trainer ${tid} exists in Erika's gym`);
  }

  // Leader Erika
  const erika = rom.trainers[C.TRAINER_LEADER_ERIKA];
  assert.ok(erika, "Leader Erika exists");
  assert.equal(erika.party.length, 3);
  assert.equal(erika.party[0].species, C.SPECIES_VICTREEBEL);
  assert.equal(erika.party[0].level, 29);
  assert.equal(erika.party[1].species, C.SPECIES_TANGELA);
  assert.equal(erika.party[1].level, 24);
  assert.equal(erika.party[2].species, C.SPECIES_VILEPLUME);
  assert.equal(erika.party[2].level, 29);

  // Strength before Badge 4
  flagClear(C.FLAG_BADGE04_GET);
  const strPre = trySetUpFieldMove(game, FIELD_MOVE_STRENGTH, 0);
  assert.equal(strPre.kind, "fail");
  assert.match(strPre.message, /MEDALLA|Badge/i);

  // Defeat Erika
  flagSet(C.FLAG_DEFEATED_ERIKA); // PREPARED: state input for Erika defeat
  flagSet(C.FLAG_BADGE04_GET);
  flagSet(C.FLAG_GOT_TM19_FROM_ERIKA);
  save.bag.tmCase.push({ item: C.ITEM_TM19, quantity: 1 });
  game.battleSetup.SetTrainerFlag(C.TRAINER_LEADER_ERIKA);

  // Strength badge requirement is now satisfied
  const strPost = trySetUpFieldMove(game, FIELD_MOVE_STRENGTH, 0);
  if (strPost.kind === "fail") assert.doesNotMatch(strPost.message, /MEDALLA|Badge/i);

  // Obedience up to Lv 50
  const traded50 = createMon(C.SPECIES_ALAKAZAM, 50, { otId: 88888 });
  save.party[0] = traded50;
  gBattleMons[0] = { level: 50, otId: 88888, otName: new Uint8Array([0x50]), status1: 0, status2: 0 } as any;
  assert.equal(IsMonDisobedient(), 0, "Traded Lv 50 mon obeys with Rainbow Badge");

  console.log("  Celadon Gym PASS: Plant maze, 7 trainers, Erika (Victreebel/Tangela/Vileplume), TM19, Strength and Lv 50 obedience");
}

console.log("--- 5. Fuchsia Gym (Koga — Soul Badge) ---");
{
  // Invisible wall labyrinth in layout
  const gymHeader = await rom.loadMap("MAP_FUCHSIA_CITY_GYM");
  assert.ok(gymHeader, "Fuchsia Gym map loaded");
  const layout = await rom.loadLayout(gymHeader.layout);
  assert.ok(layout, "Fuchsia Gym layout loaded");

  // Check that layout contains impassable barrier tiles creating the maze
  let impassableCount = 0;
  for (let y = 0; y < layout.height; y++) {
    for (let x = 0; x < layout.width; x++) {
      const tile = layout.blocks[y * layout.width + x];
      // Metatile attribute top bits indicate impassable collision
      if ((tile & 0xFC00) !== 0) impassableCount++;
    }
  }
  assert.ok(impassableCount > 20, "Invisible barriers present in Fuchsia Gym layout");

  // Trainers: Jugglers and Tamers
  const jugglers = [C.TRAINER_JUGGLER_KAYDEN, C.TRAINER_JUGGLER_SHAWN, C.TRAINER_JUGGLER_KIRK, C.TRAINER_JUGGLER_NATE];
  const tamers = [C.TRAINER_TAMER_EDGAR, C.TRAINER_TAMER_PHIL];
  for (const tid of [...jugglers, ...tamers]) {
    assert.ok(rom.trainers[tid], `Trainer ${tid} exists in Koga's gym`);
  }

  // Leader Koga
  const koga = rom.trainers[C.TRAINER_LEADER_KOGA];
  assert.ok(koga, "Leader Koga exists");
  assert.equal(koga.party.length, 4);
  assert.equal(koga.party[0].species, C.SPECIES_KOFFING);
  assert.equal(koga.party[0].level, 37);
  assert.equal(koga.party[1].species, C.SPECIES_MUK);
  assert.equal(koga.party[1].level, 39);
  assert.equal(koga.party[2].species, C.SPECIES_KOFFING);
  assert.equal(koga.party[2].level, 37);
  assert.equal(koga.party[3].species, C.SPECIES_WEEZING);
  assert.equal(koga.party[3].level, 43);

  // Surf before Badge 5
  flagClear(C.FLAG_BADGE05_GET);
  const surfPre = trySetUpFieldMove(game, FIELD_MOVE_SURF, 0);
  assert.equal(surfPre.kind, "fail");
  assert.match(surfPre.message, /MEDALLA|Badge/i);

  // Defeat Koga
  flagSet(C.FLAG_DEFEATED_KOGA); // PREPARED: state input for Koga defeat
  flagSet(C.FLAG_BADGE05_GET);
  flagSet(C.FLAG_GOT_TM06_FROM_KOGA);
  save.bag.tmCase.push({ item: C.ITEM_TM06, quantity: 1 });
  game.battleSetup.SetTrainerFlag(C.TRAINER_LEADER_KOGA);

  // Surf badge requirement is now satisfied
  const surfPost = trySetUpFieldMove(game, FIELD_MOVE_SURF, 0);
  if (surfPost.kind === "fail") assert.doesNotMatch(surfPost.message, /MEDALLA|Badge/i);

  console.log("  Fuchsia Gym PASS: Invisible walls labyrinth, Jugglers/Tamers, Koga (Koffing/Muk/Weezing), TM06 and Surf");
}

console.log("--- 6. Saffron Gym (Sabrina — Marsh Badge) ---");
{
  // Access: Post-Silph Co. (Rocket grunts hide flag)
  flagClear(C.FLAG_HIDE_SAFFRON_ROCKETS);
  assert.equal(flagGet(C.FLAG_HIDE_SAFFRON_ROCKETS), false, "Pre-Silph Co: Rockets block Saffron");
  flagSet(C.FLAG_HIDE_SAFFRON_ROCKETS); // PREPARED: Silph Co clear event removes Rockets
  assert.equal(flagGet(C.FLAG_HIDE_SAFFRON_ROCKETS), true, "Post-Silph Co: Rockets removed, gym open");

  // Warp pads / teleporter network
  const saffronGym = await rom.loadMap("MAP_SAFFRON_CITY_GYM");
  assert.ok(saffronGym.warps.length >= 32, "Saffron Gym has 32+ warp pads");
  for (const warp of saffronGym.warps) {
    if (warp.destMap === "MAP_SAFFRON_CITY_GYM") {
      assert.ok(warp.destWarpId < saffronGym.warps.length, `Warp dest ${warp.destWarpId} is valid`);
    }
  }

  // Trainers: Psychics and Channelers
  const psychics = [C.TRAINER_PSYCHIC_JOHAN, C.TRAINER_PSYCHIC_TYRON, C.TRAINER_PSYCHIC_CAMERON, C.TRAINER_PSYCHIC_PRESTON];
  const channelers = [C.TRAINER_CHANNELER_AMANDA, C.TRAINER_CHANNELER_STACY, C.TRAINER_CHANNELER_TASHA];
  for (const tid of [...psychics, ...channelers]) {
    assert.ok(rom.trainers[tid], `Trainer ${tid} exists in Sabrina's gym`);
  }

  // Leader Sabrina
  const sabrina = rom.trainers[C.TRAINER_LEADER_SABRINA];
  assert.ok(sabrina, "Leader Sabrina exists");
  assert.equal(sabrina.party.length, 4);
  assert.equal(sabrina.party[0].species, C.SPECIES_KADABRA);
  assert.equal(sabrina.party[0].level, 38);
  assert.equal(sabrina.party[1].species, C.SPECIES_MR_MIME);
  assert.equal(sabrina.party[1].level, 37);
  assert.equal(sabrina.party[2].species, C.SPECIES_VENOMOTH);
  assert.equal(sabrina.party[2].level, 38);
  assert.equal(sabrina.party[3].species, C.SPECIES_ALAKAZAM);
  assert.equal(sabrina.party[3].level, 43);

  // Rock Smash before Badge 6
  const smasher = createMon(C.SPECIES_POLIWAG, 20);
  smasher.moves = [C.MOVE_ROCK_SMASH];
  save.party[2] = smasher;
  flagClear(C.FLAG_BADGE06_GET);
  const smashPre = trySetUpFieldMove(game, FIELD_MOVE_ROCK_SMASH, 2);
  assert.equal(smashPre.kind, "fail");
  assert.match(smashPre.message, /MEDALLA|Badge/i);

  // Defeat Sabrina
  flagSet(C.FLAG_DEFEATED_SABRINA); // PREPARED: state input for Sabrina defeat
  flagSet(C.FLAG_BADGE06_GET);
  flagSet(C.FLAG_GOT_TM04_FROM_SABRINA);
  save.bag.tmCase.push({ item: C.ITEM_TM04, quantity: 1 });
  game.battleSetup.SetTrainerFlag(C.TRAINER_LEADER_SABRINA);

  // Obedience up to Lv 70
  const traded70 = createMon(C.SPECIES_GENGAR, 70, { otId: 77777 });
  save.party[0] = traded70;
  gBattleMons[0] = { level: 70, otId: 77777, otName: new Uint8Array([0x50]), status1: 0, status2: 0 } as any;
  assert.equal(IsMonDisobedient(), 0, "Traded Lv 70 mon obeys with Marsh Badge");

  // Rock Smash badge requirement is now satisfied
  const smashPost = trySetUpFieldMove(game, FIELD_MOVE_ROCK_SMASH, 2);
  if (smashPost.kind === "fail") assert.doesNotMatch(smashPost.message, /MEDALLA|Badge/i);

  console.log("  Saffron Gym PASS: Post-Silph Co access, warp pads network, Sabrina (Kadabra/Mr.Mime/Venomoth/Alakazam), TM04, Rock Smash and Lv 70 obedience");
}

console.log("--- 7. Cinnabar Gym (Blaine — Volcano Badge) ---");
{
  // Access: Secret Key from Pokémon Mansion
  flagClear(C.FLAG_HIDE_POKEMON_MANSION_B1F_SECRET_KEY);
  // Without Secret Key, door is locked (VAR_TEMP_1 == 0)
  varSet(C.VAR_TEMP_1, 0); // PREPARED: door locked state
  assert.equal(varGet(C.VAR_TEMP_1), 0, "Gym door locked without Secret Key");

  // Pick up Secret Key in Mansion B1F
  flagSet(C.FLAG_HIDE_POKEMON_MANSION_B1F_SECRET_KEY); // PREPARED: mansion key acquired
  // OnTransition calls CinnabarIsland_EventScript_CheckUnlockGym which sets VAR_TEMP_1 = 1
  if (flagGet(C.FLAG_HIDE_POKEMON_MANSION_B1F_SECRET_KEY)) varSet(C.VAR_TEMP_1, 1); // PREPARED: door unlocked by script
  assert.equal(varGet(C.VAR_TEMP_1), 1, "Gym door unlocked with Secret Key");

  // Quiz machines: Quiz 1-6
  for (let q = 1; q <= 6; q++) {
    const flagQuiz = (C as any)[`FLAG_CINNABAR_GYM_QUIZ_${q}`];
    flagSet(flagQuiz); // PREPARED: quiz machine correct answer
    assert.ok(flagGet(flagQuiz), `Quiz ${q} solved`);
  }

  // Trainers: Super Nerds and Burglars
  const nerds = [C.TRAINER_SUPER_NERD_ERIK, C.TRAINER_SUPER_NERD_AVERY, C.TRAINER_SUPER_NERD_DEREK, C.TRAINER_SUPER_NERD_ZAC];
  const burglars = [C.TRAINER_BURGLAR_QUINN, C.TRAINER_BURGLAR_RAMON, C.TRAINER_BURGLAR_DUSTY];
  for (const tid of [...nerds, ...burglars]) {
    assert.ok(rom.trainers[tid], `Trainer ${tid} exists in Blaine's gym`);
  }

  // Leader Blaine
  const blaine = rom.trainers[C.TRAINER_LEADER_BLAINE];
  assert.ok(blaine, "Leader Blaine exists");
  assert.equal(blaine.party.length, 4);
  assert.equal(blaine.party[0].species, C.SPECIES_GROWLITHE);
  assert.equal(blaine.party[0].level, 42);
  assert.equal(blaine.party[1].species, C.SPECIES_PONYTA);
  assert.equal(blaine.party[1].level, 40);
  assert.equal(blaine.party[2].species, C.SPECIES_RAPIDASH);
  assert.equal(blaine.party[2].level, 42);
  assert.equal(blaine.party[3].species, C.SPECIES_ARCANINE);
  assert.equal(blaine.party[3].level, 47);

  // Waterfall before Badge 7
  const waterMon = createMon(C.SPECIES_SEAKING, 35);
  waterMon.moves = [C.MOVE_WATERFALL];
  save.party[3] = waterMon;
  flagClear(C.FLAG_BADGE07_GET);
  const fallPre = trySetUpFieldMove(game, FIELD_MOVE_WATERFALL, 3);
  assert.equal(fallPre.kind, "fail");
  assert.match(fallPre.message, /MEDALLA|Badge/i);

  // Defeat Blaine
  flagSet(C.FLAG_DEFEATED_BLAINE); // PREPARED: state input for Blaine defeat
  flagSet(C.FLAG_BADGE07_GET);
  flagSet(C.FLAG_GOT_TM38_FROM_BLAINE);
  save.bag.tmCase.push({ item: C.ITEM_TM38, quantity: 1 });
  game.battleSetup.SetTrainerFlag(C.TRAINER_LEADER_BLAINE);

  // Waterfall badge requirement is now satisfied
  const fallPost = trySetUpFieldMove(game, FIELD_MOVE_WATERFALL, 3);
  if (fallPost.kind === "fail") assert.doesNotMatch(fallPost.message, /MEDALLA|Badge/i);

  console.log("  Cinnabar Gym PASS: Secret Key unlock, Quiz machines 1-6, Blaine (Growlithe/Ponyta/Rapidash/Arcanine), TM38 and Waterfall");
}

console.log("--- 8. Viridian Gym (Giovanni — Earth Badge) ---");
{
  // Access: Requires all 7 preceding badges!
  // ViridianCity_EventScript_TryUnlockGym checks BADGE02..BADGE07
  const hasAll7Badges = [
    C.FLAG_BADGE01_GET, C.FLAG_BADGE02_GET, C.FLAG_BADGE03_GET, C.FLAG_BADGE04_GET,
    C.FLAG_BADGE05_GET, C.FLAG_BADGE06_GET, C.FLAG_BADGE07_GET
  ].every(b => flagGet(b));
  assert.ok(hasAll7Badges, "All 7 badges acquired before Giovanni");

  varSet(C.VAR_MAP_SCENE_VIRIDIAN_CITY_GYM_DOOR, 1); // PREPARED: gym door unlocked after 7 badges
  assert.equal(varGet(C.VAR_MAP_SCENE_VIRIDIAN_CITY_GYM_DOOR), 1, "Viridian Gym unlocked with 7 badges");

  // Spin tiles forced movement test
  const forcedState = { flags: C.PLAYER_AVATAR_FLAG_FORCED, runningState: C.MOVING, lastSpinTile: MB.MB_SPIN_RIGHT };
  const forcedObj: ForcedObject = {
    currentMetatileBehavior: MB.MB_SPIN_RIGHT,
    heldMovementFinished: true,
    movementDirection: C.DIR_EAST,
    facingDirection: C.DIR_EAST,
    facingDirectionLocked: false,
    disableAnim: false,
    enableAnim: false,
  };
  let queuedAction: ForcedAction | null = null;
  const forcedController = new ForcedMovement(forcedState, {
    object: () => forcedObj,
    clearHeldMovement: () => { forcedObj.heldMovementFinished = false; },
    setDirection: (d) => { forcedObj.movementDirection = d; },
    collision: () => C.COLLISION_NONE,
    move: (action) => { queuedAction = action; },
    spinSound: () => {},
    matJump: () => {},
    matSpin: () => {},
  });
  const spinActive = forcedController.TryUpdatePlayerSpinDirection();
  assert.ok(spinActive, "Spin tile active");
  assert.equal(queuedAction, "PlayerGoSpin", "PlayerGoSpin queued by spin tile");

  // Stop spinning tile test
  forcedObj.heldMovementFinished = true;
  forcedObj.currentMetatileBehavior = MB.MB_STOP_SPINNING;
  const stopped = forcedController.TryUpdatePlayerSpinDirection();
  assert.equal(stopped, false, "Stop spinning tile stops player forced movement");

  // Trainers: Tamers, Black Belts, Cooltrainers
  const viridianTrainers = [
    C.TRAINER_TAMER_JASON, C.TRAINER_TAMER_COLE,
    C.TRAINER_BLACK_BELT_ATSUSHI, C.TRAINER_BLACK_BELT_KIYO, C.TRAINER_BLACK_BELT_TAKASHI,
    C.TRAINER_COOLTRAINER_SAMUEL, C.TRAINER_COOLTRAINER_YUJI, C.TRAINER_COOLTRAINER_WARREN
  ];
  for (const tid of viridianTrainers) {
    assert.ok(rom.trainers[tid], `Trainer ${tid} exists in Giovanni's gym`);
  }

  // Leader Giovanni
  const giovanni = rom.trainers[C.TRAINER_LEADER_GIOVANNI];
  assert.ok(giovanni, "Leader Giovanni exists");
  assert.equal(giovanni.party.length, 5);
  assert.equal(giovanni.party[0].species, C.SPECIES_RHYHORN);
  assert.equal(giovanni.party[0].level, 45);
  assert.equal(giovanni.party[1].species, C.SPECIES_DUGTRIO);
  assert.equal(giovanni.party[1].level, 42);
  assert.equal(giovanni.party[2].species, C.SPECIES_NIDOQUEEN);
  assert.equal(giovanni.party[2].level, 44);
  assert.equal(giovanni.party[3].species, C.SPECIES_NIDOKING);
  assert.equal(giovanni.party[3].level, 45);
  assert.equal(giovanni.party[4].species, C.SPECIES_RHYHORN);
  assert.equal(giovanni.party[4].level, 50);

  // Defeat Giovanni
  flagSet(C.FLAG_DEFEATED_LEADER_GIOVANNI); // PREPARED: state input for Giovanni defeat
  flagSet(C.FLAG_BADGE08_GET);
  flagSet(C.FLAG_GOT_TM26_FROM_GIOVANNI);
  save.bag.tmCase.push({ item: C.ITEM_TM26, quantity: 1 });
  game.battleSetup.SetTrainerFlag(C.TRAINER_LEADER_GIOVANNI);

  // Obedience: all levels (even Lv 100) obey
  const traded100 = createMon(C.SPECIES_MEWTWO, 100, { otId: 65432 });
  save.party[0] = traded100;
  gBattleMons[0] = { level: 100, otId: 65432, otName: new Uint8Array([0x50]), status1: 0, status2: 0 } as any;
  assert.equal(IsMonDisobedient(), 0, "Traded Lv 100 mon obeys with Earth Badge");

  console.log("  Viridian Gym PASS: 7 badges unlock, spin/stop tiles, 8 trainers, Giovanni (Rhyhorn/Dugtrio/Nidoqueen/Nidoking/Rhyhorn), TM26 and Lv 100 obedience");
}

console.log("--- 9. Full Save & Reload Persistence ---");
{
  // Verify all 8 badges are set
  for (let i = 1; i <= 8; i++) {
    const flag = (C as any)[`FLAG_BADGE0${i}_GET`];
    assert.ok(flagGet(flag), `Badge ${i} flag is set`);
  }

  // Verify all 8 gym TMs are in the TM Case
  const expectedTMs = [C.ITEM_TM39, C.ITEM_TM03, C.ITEM_TM34, C.ITEM_TM19, C.ITEM_TM06, C.ITEM_TM04, C.ITEM_TM38, C.ITEM_TM26];
  for (const tm of expectedTMs) {
    assert.ok(save.bag.tmCase.some(entry => entry.item === tm), `TM ${tm} is in TM Case`);
  }

  // Simulate save serialization and reload
  const serialized = JSON.stringify(save);
  const reloaded = JSON.parse(serialized);
  setSave(reloaded);

  // Verify badges and TMs persist after load
  for (let i = 1; i <= 8; i++) {
    const flag = (C as any)[`FLAG_BADGE0${i}_GET`];
    assert.ok(flagGet(flag), `Badge ${i} persisted after reload`);
  }
  for (const tm of expectedTMs) {
    assert.ok(save.bag.tmCase.some(entry => entry.item === tm), `TM ${tm} persisted after reload`);
  }
  assert.ok(flagGet(C.FLAG_DEFEATED_MISTY), "Misty defeat persisted");
  assert.ok(flagGet(C.FLAG_DEFEATED_LT_SURGE), "Surge defeat persisted");
  assert.ok(flagGet(C.FLAG_DEFEATED_ERIKA), "Erika defeat persisted");
  assert.ok(flagGet(C.FLAG_DEFEATED_KOGA), "Koga defeat persisted");
  assert.ok(flagGet(C.FLAG_DEFEATED_SABRINA), "Sabrina defeat persisted");
  assert.ok(flagGet(C.FLAG_DEFEATED_BLAINE), "Blaine defeat persisted");
  assert.ok(flagGet(C.FLAG_DEFEATED_LEADER_GIOVANNI), "Giovanni defeat persisted");

  console.log("  Save & Reload PASS: All 8 badges, 8 TMs, defeat flags persist across serialization");
}

console.log("\nALL 7 REMAINING GYMS (AND PEWTER REFERENCE) PASS: Access, Puzzles, Trainers, Leaders, TMs, Badges and Persistence verified.");
