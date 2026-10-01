// Headless check for quest_log_objects.c (Quest Log scene object events serialization and surf dismount).
import "./setupNodeGbaMock.ts";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import * as C from "../../src/fr/generated/constants.ts";
import * as MB from "../../src/fr/generated/metatileBehavior.ts";
import { save } from "../../src/fr/save.ts";
import { SetQuestLogState } from "../../src/fr/questLogEvents.ts";
import { gObjectEvents, ObjectEvent } from "../../src/fr/field/objectEvents.ts";
import { FieldMap, MAP_OFFSET, SetCurrentFieldMap } from "../../src/fr/field/fieldmap.ts";
import {
  PlayerAvatar,
  SetPlayerAvatar,
  PLAYER_AVATAR_FLAG_ON_FOOT,
  PLAYER_AVATAR_FLAG_SURFING,
} from "../../src/fr/field/playerAvatar.ts";
import {
  QL_RecordObjects,
  QL_LoadObjects,
  QL_TryStopSurfing,
  type QuestLogScene,
} from "../../src/fr/questLogObjects.ts";
import type { MapObjectTemplate } from "../../src/fr/rom.ts";
import { rom } from "../../src/fr/rom.ts";

const root = process.cwd() + "/public/fr/";
(rom as any).charmap = JSON.parse(readFileSync(root + "charmap.json", "utf8"));

console.log("Checking quest_log_objects.c headless logic...");

// 1. Test QL_RecordObjects
// Prepare test state for gObjectEvents
for (let i = 0; i < C.OBJECT_EVENTS_COUNT; i++) {
  gObjectEvents[i] = new ObjectEvent();
  gObjectEvents[i].active = false;
}

// Player event in slot 0
gObjectEvents[0].active = true;
gObjectEvents[0].isPlayer = true;
gObjectEvents[0].localId = C.LOCALID_PLAYER;
gObjectEvents[0].graphicsId = C.OBJ_EVENT_GFX_RED_NORMAL;
gObjectEvents[0].currentCoords = { x: 12, y: 15 };
gObjectEvents[0].facingDirection = C.DIR_EAST;
gObjectEvents[0].currentElevation = 3;
gObjectEvents[0].previousElevation = 3;
gObjectEvents[0].movementType = C.MOVEMENT_TYPE_PLAYER;
gObjectEvents[0].trainerRange = 0;
gObjectEvents[0].previousMetatileBehavior = C.MB_NORMAL;
gObjectEvents[0].directionSequenceIndex = 2;
gObjectEvents[0].playerCopyableMovement = 5;

// NPC event in slot 1
gObjectEvents[1].active = true;
gObjectEvents[1].isPlayer = false;
gObjectEvents[1].localId = 3;
gObjectEvents[1].graphicsId = C.OBJ_EVENT_GFX_BOY;
gObjectEvents[1].currentCoords = { x: 20, y: 25 };
gObjectEvents[1].facingDirection = C.DIR_NORTH;
gObjectEvents[1].currentElevation = 3;
gObjectEvents[1].movementType = C.MOVEMENT_TYPE_WANDER_AROUND;
gObjectEvents[1].trainerRange = 4;
gObjectEvents[1].previousMetatileBehavior = C.MB_TALL_GRASS;

const scene: QuestLogScene = {
  objectEvents: [],
};

QL_RecordObjects(scene);

assert.equal(scene.objectEvents.length, C.OBJECT_EVENTS_COUNT);
assert.equal(scene.objectEvents[0].active, true);
assert.equal(scene.objectEvents[0].isPlayer, true);
assert.equal(scene.objectEvents[0].x, 12);
assert.equal(scene.objectEvents[0].y, 15);
assert.equal(scene.objectEvents[0].facingDirection, C.DIR_EAST);
assert.equal(scene.objectEvents[0].animId, 5);

assert.equal(scene.objectEvents[1].active, true);
assert.equal(scene.objectEvents[1].isPlayer, false);
assert.equal(scene.objectEvents[1].localId, 3);
assert.equal(scene.objectEvents[1].x, 20);
assert.equal(scene.objectEvents[1].y, 25);
assert.equal(scene.objectEvents[1].trainerRange_berryTreeId, 4);
assert.equal(scene.objectEvents[1].previousMetatileBehavior, C.MB_TALL_GRASS);

// Inactive slot
assert.equal(scene.objectEvents[2].active, false);

// 2. Test QL_LoadObjects
// Mock field map for metatile behavior queries
const mockMap = {
  behaviorAt(x: number, y: number): number {
    if (x === 12 && y === 15) return C.MB_NORMAL;
    if (x === 11 && y === 15) return C.MB_TALL_GRASS; // step from West
    if (x === 20 && y === 25) return C.MB_PUDDLE;
    return C.MB_NORMAL;
  },
} as unknown as FieldMap;

SetCurrentFieldMap(mockMap);

const templates: MapObjectTemplate[] = [
  {
    localId: 3,
    graphicsId: C.OBJ_EVENT_GFX_BOY,
    graphicsName: "OBJ_EVENT_GFX_BOY",
    x: 15,
    y: 18,
    elevation: 3,
    movementType: C.MOVEMENT_TYPE_WANDER_AROUND,
    rangeX: 2,
    rangeY: 3,
    trainerType: 0,
    trainerRange: 4,
    script: 0,
    scriptName: null,
    flag: 0,
  },
];

// Modify scene[0] to simulate that player moved from (11, 15) where behavior was MB_TALL_GRASS
scene.objectEvents[0].previousMetatileBehavior = C.MB_TALL_GRASS;

QL_LoadObjects(scene, templates);

// Verify player reconstructed coords
assert.equal(gObjectEvents[0].currentCoords.x, 12);
assert.equal(gObjectEvents[0].currentCoords.y, 15);
assert.equal(gObjectEvents[0].previousCoords.x, 11, "previousCoords reconstructed from previousMetatileBehavior at (x - 1)");
assert.equal(gObjectEvents[0].previousCoords.y, 15);
assert.equal(gObjectEvents[0].currentMetatileBehavior, C.MB_NORMAL);

// Verify NPC loaded and matched template
assert.equal(gObjectEvents[1].localId, 3);
assert.equal(gObjectEvents[1].initialCoords.x, 15 + MAP_OFFSET);
assert.equal(gObjectEvents[1].initialCoords.y, 18 + MAP_OFFSET);
assert.equal(gObjectEvents[1].rangeX, 2);
assert.equal(gObjectEvents[1].rangeY, 3);
assert.equal(gObjectEvents[1].trainerRange, 4);

// Verify save.objectEvents updated
assert.ok(Array.isArray(save.objectEvents));
assert.equal((save.objectEvents as any[]).length, C.OBJECT_EVENTS_COUNT);

// 3. Test QL_TryStopSurfing
// Mock avatar
const mockAvatar = {
  flags: PLAYER_AVATAR_FLAG_SURFING,
  object: gObjectEvents[0],
  setTransitionFlags(transition: number) {
    if (transition & PLAYER_AVATAR_FLAG_ON_FOOT) {
      this.flags = (this.flags & ~PLAYER_AVATAR_FLAG_SURFING) | PLAYER_AVATAR_FLAG_ON_FOOT;
    }
  },
  // DoPlayerAvatarTransition (field_player_avatar.c), the entry SetPlayerAvatarTransitionFlags uses.
  DoPlayerAvatarTransition(flags: number) {
    this.setTransitionFlags(flags);
  },
} as unknown as PlayerAvatar;

SetPlayerAvatar(mockAvatar);

// During normal gameplay (not playback): does nothing
SetQuestLogState(0);
QL_TryStopSurfing();
assert.equal(mockAvatar.flags, PLAYER_AVATAR_FLAG_SURFING);

// During QL playback on non-surfable tile (12, 15 has MB_NORMAL): dismounts surf
SetQuestLogState(C.QL_STATE_PLAYBACK);
let spriteDestroyed = false;
gObjectEvents[0].fieldEffectSprite = {
  destroyed: false,
} as any;

QL_TryStopSurfing();
assert.equal(mockAvatar.flags, PLAYER_AVATAR_FLAG_ON_FOOT, "Avatar dismounted to on-foot");
assert.equal(gObjectEvents[0].fieldEffectSprite, undefined, "Surf sprite cleaned up");

console.log("quest_log_objects.c headless check passed successfully.");
