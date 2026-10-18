import { strict as assert } from "node:assert";
import "./setupNodeGbaMock";
import * as C from "../../src/games/firered/generated/constants";
import { rom } from "../../src/core/rom";
import { flagClear, flagGet, flagSet, newSaveData, save, setSave } from "../../src/games/firered/save";
import { createMon } from "../../src/core/pokemon/pokemon";
import { trySetUpFieldMove, FIELD_MOVE_FLASH, FIELD_MOVE_CUT, FIELD_MOVE_FLY, FIELD_MOVE_STRENGTH, FIELD_MOVE_SURF, FIELD_MOVE_ROCK_SMASH, FIELD_MOVE_WATERFALL } from "../../src/games/firered/menus/fieldMoveMenu";
import { Game } from "../../src/games/firered/game";
import { MAP_OFFSET } from "../../src/core/field/fieldmap";
import { loadCData, preloadPacks } from "../../src/core/hw/assets";
import { loadFieldFx } from "../../src/core/field/fieldEffects";
import { preloadFieldAssets } from "../../src/core/field/preloadField";
import { tasks } from "../../src/core/gba/tasks";

await rom.load();
await loadFieldFx();
await preloadFieldAssets();
await preloadPacks(["graphics_fonts", "graphics_help_system", "graphics_quest_log"]);
await loadCData("event_object_movement", "text_printer", "text", "wild_encounter", "field_specials");

setSave(newSaveData());
const mon = createMon(C.SPECIES_POLIWAG, 25);
mon.moves = [C.MOVE_SURF, C.MOVE_STRENGTH, C.MOVE_CUT, C.MOVE_FLASH];
save.party = [mon];

const canvas = {
  width: 240, height: 160,
  getContext: () => ({
    fillRect() {}, clearRect() {}, drawImage() {},
    getImageData: () => ({ data: new Uint8ClampedArray(240 * 160 * 4) }),
    putImageData() {},
  }),
} as unknown as HTMLCanvasElement;

const game = new Game(canvas);
await game.overworld.prepareViewerInteraction("MAP_PALLET_TOWN");
game.overworld.player.InitPlayerAvatar(10 + MAP_OFFSET, 10 + MAP_OFFSET, C.DIR_SOUTH, 0);

// 1. Badge checks for all field moves before badge is granted
const badges = [
  [FIELD_MOVE_FLASH, C.FLAG_BADGE01_GET],
  [FIELD_MOVE_CUT, C.FLAG_BADGE02_GET],
  [FIELD_MOVE_FLY, C.FLAG_BADGE03_GET],
  [FIELD_MOVE_STRENGTH, C.FLAG_BADGE04_GET],
  [FIELD_MOVE_SURF, C.FLAG_BADGE05_GET],
  [FIELD_MOVE_ROCK_SMASH, C.FLAG_BADGE06_GET],
  [FIELD_MOVE_WATERFALL, C.FLAG_BADGE07_GET],
] as const;

for (const [move, badge] of badges) {
  flagClear(badge);
  const res = trySetUpFieldMove(game, move, 0);
  assert.equal(res.kind, "fail");
  if (res.kind === "fail") {
    assert.match(res.message, /MEDALLA|Badge/i, `Field move ${move} without badge should show badge requirement`);
  }
}

// 2. Flash
flagSet(C.FLAG_BADGE01_GET);
// On Pallet Town (not a dark cave), Flash cannot be used
const flashFail = trySetUpFieldMove(game, FIELD_MOVE_FLASH, 0);
assert.equal(flashFail.kind, "fail");

// On a cave map requiring flash:
await game.overworld.prepareViewerInteraction("MAP_ROCK_TUNNEL_B1F");
game.overworld.player.InitPlayerAvatar(10 + MAP_OFFSET, 10 + MAP_OFFSET, C.DIR_SOUTH, 0);
flagClear(C.FLAG_SYS_FLASH_ACTIVE);
assert.equal(game.overworld.header.requiresFlash, true);
const flashSuccess = trySetUpFieldMove(game, FIELD_MOVE_FLASH, 0);
assert.equal(flashSuccess.kind, "close");
if (flashSuccess.kind === "close") {
  flashSuccess.post();
  for (let frame = 0; frame < 300 && !flagGet(C.FLAG_SYS_FLASH_ACTIVE); frame++) {
    game.frame();
  }
  assert.equal(flagGet(C.FLAG_SYS_FLASH_ACTIVE), true, "Flash should set FLAG_SYS_FLASH_ACTIVE");
}

// 3. Cut
flagSet(C.FLAG_BADGE02_GET);
await game.overworld.prepareViewerInteraction("MAP_PALLET_TOWN");
game.overworld.player.InitPlayerAvatar(10 + MAP_OFFSET, 10 + MAP_OFFSET, C.DIR_SOUTH, 0);
// No cut tree in front -> fails
const cutFail = trySetUpFieldMove(game, FIELD_MOVE_CUT, 0);
assert.equal(cutFail.kind, "fail");

// Spawn a cut tree in front of player
const player = game.overworld.player.object;
player.currentCoords.x = 10 + MAP_OFFSET;
player.currentCoords.y = 10 + MAP_OFFSET;
player.facingDirection = C.DIR_SOUTH;
const cutTree = game.overworld.objects.spawnFromTemplate({
  localId: 5, graphicsId: C.OBJ_EVENT_GFX_CUT_TREE,
  x: 10, y: 11, elevation: 3, movementType: C.MOVEMENT_TYPE_LOOK_AROUND,
  movementRangeX: 0, movementRangeY: 0, trainerType: 0, trainerRange: 0,
  scriptName: "", flag: 0
})!;

const cutSuccess = trySetUpFieldMove(game, FIELD_MOVE_CUT, 0);
assert.equal(cutSuccess.kind, "close");

// 4. Strength
flagSet(C.FLAG_BADGE04_GET);
// Remove cut tree, test strength without boulder in front -> fails
cutTree.graphicsId = C.OBJ_EVENT_GFX_BOY;
const strengthFail = trySetUpFieldMove(game, FIELD_MOVE_STRENGTH, 0);
assert.equal(strengthFail.kind, "fail");

// Set front object to pushable boulder
cutTree.graphicsId = C.OBJ_EVENT_GFX_PUSHABLE_BOULDER;
const strengthSuccess = trySetUpFieldMove(game, FIELD_MOVE_STRENGTH, 0);
assert.equal(strengthSuccess.kind, "close");
if (strengthSuccess.kind === "close") {
  strengthSuccess.post();
  // Runs EventScript_FldEffStrength -> setflag FLAG_SYS_USE_STRENGTH
  for (let frame = 0; frame < 200 && !flagGet(C.FLAG_SYS_USE_STRENGTH); frame++) {
    game.frame();
  }
  assert.equal(flagGet(C.FLAG_SYS_USE_STRENGTH), true, "Strength should set FLAG_SYS_USE_STRENGTH");
}

// 5. Surf
flagSet(C.FLAG_BADGE05_GET);
// Facing grass/land in Pallet Town -> cannot surf
player.currentCoords.x = 10 + MAP_OFFSET;
player.currentCoords.y = 10 + MAP_OFFSET;
player.facingDirection = C.DIR_NORTH;
const surfLandFail = trySetUpFieldMove(game, FIELD_MOVE_SURF, 0);
assert.equal(surfLandFail.kind, "fail");
if (surfLandFail.kind === "fail") {
  assert.match(surfLandFail.message, /Surf/i);
}

// Find water shore in Pallet Town facing south
let shoreFound = false;
for (let y = 0; y < 20; y++) {
  for (let x = 0; x < 24; x++) {
    player.currentCoords.x = x + MAP_OFFSET;
    player.currentCoords.y = y + MAP_OFFSET;
    player.currentElevation = 3;
    player.previousElevation = 3;
    player.facingDirection = C.DIR_SOUTH;
    if (game.overworld.player.IsPlayerFacingSurfableFishableWater()) {
      shoreFound = true;
      break;
    }
  }
  if (shoreFound) break;
}
assert.equal(shoreFound, true, "Should find a surfable water tile in Pallet Town");

const surfSuccess = trySetUpFieldMove(game, FIELD_MOVE_SURF, 0);
assert.equal(surfSuccess.kind, "close");
if (surfSuccess.kind === "close") {
  surfSuccess.post();
  // Runs FLDEFF_USE_SURF tasks
  for (let frame = 0; frame < 60; frame++) {
    game.frame();
  }
  assert.equal((game.overworld.player.flags & C.PLAYER_AVATAR_FLAG_SURFING) !== 0, true, "Player should be surfing");
}

console.log("Field moves party checks PASS (Flash, Cut, Strength, Surf badge gates, field checks and activations)");
