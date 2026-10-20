import assert from "node:assert/strict";
import {
  HoennBikeSpeedTracker,
  getCrackedFloorHoleMetatile,
  getHoleFallDestination,
  checkMuddySlopeMovement,
  HOENN_HOLE_DESTINATIONS,
} from "../../src/viewer/hoennMechanics";
import * as MBEmerald from "../../src/games/emerald/generated/metatileBehavior";
import { isWarpDoorBehavior, stepWarpBehavior } from "../../src/viewer/navigation";

// 1. HoennBikeSpeedTracker
const tracker = new HoennBikeSpeedTracker();
assert.equal(tracker.speed, 1, "Initial speed should be 1");
assert.equal(tracker.isMaxSpeed(), false, "Initial isMaxSpeed should be false");

// Step 1: normal speed
tracker.onStep("north", "bike", "mach");
assert.equal(tracker.speed, 1, "Step 1 speed should be 1");
assert.equal(tracker.isMaxSpeed(), false);

// Step 2: fast speed
tracker.onStep("north", "bike", "mach");
assert.equal(tracker.speed, 2, "Step 2 speed should be 2");
assert.equal(tracker.isMaxSpeed(), false);

// Step 3+: fastest speed (4)
tracker.onStep("north", "bike", "mach");
assert.equal(tracker.speed, 4, "Step 3 speed should be 4 (max)");
assert.equal(tracker.isMaxSpeed(), true);

tracker.onStep("north", "bike", "mach");
assert.equal(tracker.speed, 4, "Step 4 speed should remain 4");
assert.equal(tracker.isMaxSpeed(), true);

// Turning resets speed to step 1
tracker.onStep("east", "bike", "mach");
assert.equal(tracker.speed, 1, "Turning direction resets speed to 1");
assert.equal(tracker.isMaxSpeed(), false);

// Discarding Mach Bike resets speed to 0
tracker.onStep("east", "walk", "mach");
assert.equal(tracker.speed, 1, "Walking resets speed");

tracker.onStep("south", "bike", "acro");
assert.equal(tracker.speed, 1, "Acro bike resets speed");

tracker.reset();
assert.equal(tracker.speed, 1, "Manual reset");
assert.equal(tracker.isMaxSpeed(), false);

// 2. getCrackedFloorHoleMetatile
assert.equal(getCrackedFloorHoleMetatile(559), 520, "Cave/Mirage Tower cracked floor (559) turns into hole (520)");
assert.equal(getCrackedFloorHoleMetatile(568), 569, "Pacifidlog/Sky Pillar cracked floor (568) turns into hole (569)");

// 3. getHoleFallDestination
assert.deepEqual(getHoleFallDestination("MAP_SKY_PILLAR_2F", 10, 15), { mapId: "MAP_SKY_PILLAR_1F", x: 10, y: 15 });
assert.deepEqual(getHoleFallDestination("MAP_SKY_PILLAR_4F", 5, 8), { mapId: "MAP_SKY_PILLAR_3F", x: 5, y: 8 });
assert.deepEqual(getHoleFallDestination("MAP_MIRAGE_TOWER_4F", 12, 14), { mapId: "MAP_MIRAGE_TOWER_3F", x: 12, y: 14 });
assert.deepEqual(getHoleFallDestination("MAP_MIRAGE_TOWER_2F", 7, 7), { mapId: "MAP_MIRAGE_TOWER_1F", x: 7, y: 7 });
assert.equal(getHoleFallDestination("MAP_LITTLEROOT_TOWN", 0, 0), null);

// 4. checkMuddySlopeMovement
const muddyBehavior = MBEmerald.MB_MUDDY_SLOPE; // 208 in Emerald
assert.ok(MBEmerald.MetatileBehavior_IsMuddySlope(muddyBehavior), "Behavior MB_MUDDY_SLOPE must be muddy slope");

// Climbing north with max speed Mach Bike succeeds
const canClimb = checkMuddySlopeMovement(muddyBehavior, "north", true);
assert.equal(canClimb.isMuddySlope, true);
assert.equal(canClimb.canClimb, true);

// Climbing north without max speed fails and slides south
const cannotClimb = checkMuddySlopeMovement(muddyBehavior, "north", false);
assert.equal(cannotClimb.isMuddySlope, true);
assert.equal(cannotClimb.canClimb, false);
assert.equal(cannotClimb.slideDirection, "south");

// Moving east/west/south on muddy slope slides south
const slideEast = checkMuddySlopeMovement(muddyBehavior, "east", true);
assert.equal(slideEast.canClimb, false);
assert.equal(slideEast.slideDirection, "south");

// Normal tile
const normalTile = checkMuddySlopeMovement(0, "north", false);
assert.equal(normalTile.isMuddySlope, false);
assert.equal(normalTile.canClimb, true);

// 5. Warp door & step warp behaviors
const doorBehavior = 105; // MB_ANIMATED_DOOR in Emerald
const gymDoor = 141; // MB_PETALBURG_GYM_DOOR
assert.ok(isWarpDoorBehavior(doorBehavior), "Emerald animated door is recognized");
assert.ok(isWarpDoorBehavior(gymDoor), "Emerald Petalburg gym door is recognized");
assert.ok(stepWarpBehavior(MBEmerald.MB_CRACKED_FLOOR_HOLE), "Emerald cracked floor hole is recognized as step warp");
assert.ok(stepWarpBehavior(MBEmerald.MB_MT_PYRE_HOLE), "Emerald Mt Pyre hole is recognized as step warp");

console.log("PASS: hoennMechanics test (Mach Bike, Mud Slopes, Cracked Floors, Hole Warps, Doors).");
