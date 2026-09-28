// Headless check for field_player_avatar.c's PlayerAvatarTransition_* /
// ForcedMovement_* reshape (src/fr/field/playerAvatar.ts).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import "./setupNodeGbaMock";
import { registerCData } from "../../src/fr/hw/assets";
import { rom } from "../../src/fr/rom";
import { ObjectEvents } from "../../src/fr/field/objectEvents";
import {
  PlayerAvatar, PLAYER_AVATAR_FLAG_ACRO_BIKE, PLAYER_AVATAR_FLAG_MACH_BIKE,
  BIKE_STATE_NORMAL, PLAYER_SPEED_STANDING,
} from "../../src/fr/field/playerAvatar";

const exported = JSON.parse(readFileSync(resolve("public/fr/cdata/event_object_movement.json"), "utf8")) as {
  defs: Record<string, { type: string; value: unknown[] }>;
};
registerCData("event_object_movement", exported.defs);
const fallbackGfx = {
  width: 16, height: 16, inanimate: false, anims: "none",
  frames: [], reflectionFrames: [], bridgeReflectionFrames: [],
  disableReflectionPaletteLoad: false, shadowSize: "SHADOW_SIZE_M", tracks: "TRACKS_NONE",
} as any;
rom.objects = {
  gfx: new Proxy({}, { get: () => fallbackGfx }) as any,
  animTables: { none: [] },
  anims: {},
};

const mockMap = { collisionAt: () => 0, borderIdAt: () => 0, behaviorAt: () => 0, elevationAt: () => 0 };
const ow = {
  map: mockMap,
  header: { regionMapSection: 0, mapType: 0, allowRunning: true },
  savedMusic: 0,
  playSpecialMapMusic: () => {},
  controlsLocked: false,
  syncObjectSprites: () => {},
} as any;
ow.objects = new ObjectEvents({ map: () => mockMap, cameraCanMove: () => true } as any);

const avatar = new PlayerAvatar(ow);
ow.player = avatar;
avatar.init(10, 10, 1 /* DIR_SOUTH */, 0);

// GetOnOffBike -> setTransitionFlags -> PlayerAvatarTransition_Bike must call
// BikeClearState(0, 0) (field_player_avatar.c), resetting Acro/Mach bike state.
avatar.acroBikeState = 99;
avatar.bikeFrameCounter = 42;
avatar.bikeSpeed = 7;
avatar.GetOnOffBike(PLAYER_AVATAR_FLAG_MACH_BIKE);
assert.equal(avatar.acroBikeState, BIKE_STATE_NORMAL, "PlayerAvatarTransition_Bike must call BikeClearState (acroBikeState)");
assert.equal(avatar.bikeFrameCounter, 0, "PlayerAvatarTransition_Bike must call BikeClearState (bikeFrameCounter)");
assert.equal(avatar.bikeSpeed, PLAYER_SPEED_STANDING, "PlayerAvatarTransition_Bike must call BikeClearState (bikeSpeed)");
assert.ok(avatar.isOnBike(), "GetOnOffBike must mount the bike");

// Getting back off the bike must not throw (PlayerAvatarTransition_Normal path).
avatar.GetOnOffBike(0);
assert.ok(!avatar.isOnBike(), "GetOnOffBike must dismount the bike");

// Re-mounting on the acro bike goes through the same PlayerAvatarTransition_Bike path.
avatar.acroBikeState = 99;
avatar.GetOnOffBike(PLAYER_AVATAR_FLAG_ACRO_BIKE);
assert.equal(avatar.acroBikeState, BIKE_STATE_NORMAL, "Acro Bike mount must also call BikeClearState");

console.log("field_player_avatar.c PlayerAvatarTransition_*/ForcedMovement_* checks passed");
