import assert from "node:assert/strict";
import {
  HoennBikeSpeedTracker,
  HoennAcroBikeTracker,
  getCrackedFloorHoleMetatile,
  getHoleFallDestination,
  checkMuddySlopeMovement,
  isRailMetatile,
  isVerticalRail,
  isHorizontalRail,
  checkRailMovement,
  isWaterCurrent,
  getWaterCurrentDirection,
  SEALED_CHAMBER_DIVE_SPOT,
  SEALED_CHAMBER_DESTINATION,
  isDiveableWater,
  isUnableToEmerge,
  getHoennDiveDestination,
  getHoennEmergeDestination,
  SootopolisGymIceTracker,
  METATILE_SootopolisGym_Ice_Broken,
  METATILE_SootopolisGym_Ice_Cracked,
  METATILE_SootopolisGym_Stairs,
  MossdeepGymTracker,
  METATILE_MossdeepGym_YellowArrow_Right,
} from "../../src/viewer/hoennMechanics";
import * as MBEmerald from "../../src/games/emerald/generated/metatileBehavior";
import * as EmeraldConstants from "../../src/games/emerald/generated/constants";
import { isWarpDoorBehavior, stepWarpBehavior } from "../../src/viewer/navigation";

// 1. HoennBikeSpeedTracker (Mach Bike)
const tracker = new HoennBikeSpeedTracker();
assert.equal(tracker.speed, 1, "Initial speed should be 1");
assert.equal(tracker.isMaxSpeed(), false, "Initial isMaxSpeed should be false");

tracker.onStep("north", "bike", "mach");
assert.equal(tracker.speed, 1, "Step 1 speed should be 1");
assert.equal(tracker.isMaxSpeed(), false);

tracker.onStep("north", "bike", "mach");
assert.equal(tracker.speed, 2, "Step 2 speed should be 2");
assert.equal(tracker.isMaxSpeed(), false);

tracker.onStep("north", "bike", "mach");
assert.equal(tracker.speed, 4, "Step 3 speed should be 4 (max)");
assert.equal(tracker.isMaxSpeed(), true);

tracker.onStep("north", "bike", "mach");
assert.equal(tracker.speed, 4, "Step 4 speed should remain 4");
assert.equal(tracker.isMaxSpeed(), true);

tracker.onStep("east", "bike", "mach");
assert.equal(tracker.speed, 1, "Turning direction resets speed to 1");
assert.equal(tracker.isMaxSpeed(), false);

tracker.onStep("east", "walk", "mach");
assert.equal(tracker.speed, 1, "Walking resets speed");

tracker.onStep("south", "bike", "acro");
assert.equal(tracker.speed, 1, "Acro bike resets speed");

tracker.reset();
assert.equal(tracker.speed, 1, "Manual reset");
assert.equal(tracker.isMaxSpeed(), false);

// 2. HoennAcroBikeTracker (Bunny hops, Wheelie, Balance Rails)
const acroTracker = new HoennAcroBikeTracker();
assert.equal(acroTracker.isBHeld(), false);
assert.equal(acroTracker.isWheelie(), false);

acroTracker.setBButton(true);
assert.equal(acroTracker.isBHeld(), true);
assert.equal(acroTracker.isWheelie(), true);

const hop = acroTracker.triggerHop();
assert.equal(hop.isHop, true);
assert.equal(hop.sound, EmeraldConstants.SE_BIKE_HOP);

acroTracker.setBButton(false);
assert.equal(acroTracker.isBHeld(), false);
assert.equal(acroTracker.isWheelie(), false);

// Balance rails behavior checks
const vRail = MBEmerald.MB_VERTICAL_RAIL; // 213
const hRail = MBEmerald.MB_HORIZONTAL_RAIL; // 214
const isoVRail = MBEmerald.MB_ISOLATED_VERTICAL_RAIL; // 211
const isoHRail = MBEmerald.MB_ISOLATED_HORIZONTAL_RAIL; // 212
const bridgeRail = MBEmerald.MB_BIKE_BRIDGE_OVER_BARRIER; // 127

assert.ok(isVerticalRail(vRail), "Vertical rail identified");
assert.ok(isVerticalRail(isoVRail), "Isolated vertical rail identified");
assert.ok(isHorizontalRail(hRail), "Horizontal rail identified");
assert.ok(isHorizontalRail(isoHRail), "Isolated horizontal rail identified");
assert.ok(isRailMetatile(bridgeRail), "Bike bridge over barrier identified as rail");

// Foot & Mach bike cannot ride balance rails
const walkOnRail = checkRailMovement(vRail, false, "north", "walk", "mach");
assert.equal(walkOnRail.allowed, false, "Walking onto rail is blocked");

const machOnRail = checkRailMovement(vRail, false, "north", "bike", "mach");
assert.equal(machOnRail.allowed, false, "Mach bike onto rail is blocked");

// Acro bike hops onto rail with SE_BIKE_HOP
const acroHopOntoRail = checkRailMovement(vRail, false, "north", "bike", "acro");
assert.equal(acroHopOntoRail.allowed, true, "Acro bike hops onto rail");
assert.equal(acroHopOntoRail.isJump, true);
assert.equal(acroHopOntoRail.sound, EmeraldConstants.SE_BIKE_HOP);

// Acro bike moving along vertical rail
const acroAlongRail = checkRailMovement(vRail, true, "north", "bike", "acro", true);
assert.equal(acroAlongRail.allowed, true);
assert.equal(acroAlongRail.isSideJump, false);

// Acro bike sideways hop perpendicular to vertical rail
const acroSideHop = checkRailMovement(vRail, true, "east", "bike", "acro");
assert.equal(acroSideHop.allowed, true);
assert.equal(acroSideHop.isJump, true);
assert.equal(acroSideHop.isSideJump, true);
assert.equal(acroSideHop.sound, EmeraldConstants.SE_BIKE_HOP);

// 3. Water Rapids (Routes 132, 133, 134) & Sealed Chamber navigation
const westCurrent = MBEmerald.MB_WESTWARD_CURRENT; // 81
const eastCurrent = MBEmerald.MB_EASTWARD_CURRENT; // 80
const northCurrent = MBEmerald.MB_NORTHWARD_CURRENT; // 82
const southCurrent = MBEmerald.MB_SOUTHWARD_CURRENT; // 83

assert.ok(isWaterCurrent(westCurrent), "Westward current identified");
assert.ok(isWaterCurrent(eastCurrent), "Eastward current identified");
assert.ok(isWaterCurrent(northCurrent), "Northward current identified");
assert.ok(isWaterCurrent(southCurrent), "Southward current identified");
assert.equal(getWaterCurrentDirection(westCurrent), "west");
assert.equal(getWaterCurrentDirection(eastCurrent), "east");
assert.equal(getWaterCurrentDirection(northCurrent), "north");
assert.equal(getWaterCurrentDirection(southCurrent), "south");
assert.equal(getWaterCurrentDirection(0), null);

// Sealed Chamber Dive spot coordinates in Route 134
assert.deepEqual(SEALED_CHAMBER_DIVE_SPOT, { mapId: "MAP_ROUTE134", x: 60, y: 31 });
assert.deepEqual(SEALED_CHAMBER_DESTINATION, { mapId: "MAP_SEALED_CHAMBER_OUTER_ROOM", x: 10, y: 19 });

// 4. Dive / Underwater Mechanics and Destination Mapping
const deepWater = MBEmerald.MB_DEEP_WATER; // 75
const interiorDeepWater = MBEmerald.MB_INTERIOR_DEEP_WATER; // 74
const sootopolisDeepWater = MBEmerald.MB_SOOTOPOLIS_DEEP_WATER; // 76
const noSurfacing = MBEmerald.MB_NO_SURFACING;

assert.ok(isDiveableWater(deepWater), "Deep water is diveable");
assert.ok(isDiveableWater(interiorDeepWater), "Interior deep water is diveable");
assert.ok(isDiveableWater(sootopolisDeepWater), "Sootopolis deep water is diveable");
assert.ok(isUnableToEmerge(noSurfacing), "No surfacing tile prevents emerging");

// Ocean Routes dive destinations
assert.deepEqual(getHoennDiveDestination("MAP_ROUTE124", 25, 40), { mapId: "MAP_UNDERWATER_ROUTE124", x: 25, y: 40 });
assert.deepEqual(getHoennDiveDestination("MAP_ROUTE126", 12, 18), { mapId: "MAP_UNDERWATER_ROUTE126", x: 12, y: 18 });
assert.deepEqual(getHoennDiveDestination("MAP_ROUTE127", 30, 20), { mapId: "MAP_UNDERWATER_ROUTE127", x: 30, y: 20 });
assert.deepEqual(getHoennDiveDestination("MAP_ROUTE128", 15, 35), { mapId: "MAP_UNDERWATER_ROUTE128", x: 15, y: 35 });
assert.deepEqual(getHoennDiveDestination("MAP_ROUTE134", 60, 31), { mapId: "MAP_UNDERWATER_ROUTE134", x: 8, y: 6 });
assert.deepEqual(getHoennDiveDestination("MAP_SOOTOPOLIS_CITY", 29, 53), { mapId: "MAP_UNDERWATER_SOOTOPOLIS_CITY", x: 9, y: 6 });
assert.deepEqual(getHoennDiveDestination("MAP_SEAFLOOR_CAVERN_ENTRANCE", 10, 17), { mapId: "MAP_UNDERWATER_SEAFLOOR_CAVERN", x: 6, y: 5 });

// Emerge destinations
assert.deepEqual(getHoennEmergeDestination("MAP_UNDERWATER_ROUTE124", 25, 40), { mapId: "MAP_ROUTE124", x: 25, y: 40 });
assert.deepEqual(getHoennEmergeDestination("MAP_UNDERWATER_ROUTE126", 12, 18), { mapId: "MAP_ROUTE126", x: 12, y: 18 });
assert.deepEqual(getHoennEmergeDestination("MAP_UNDERWATER_ROUTE134", 8, 6), { mapId: "MAP_ROUTE134", x: 60, y: 31 });
assert.deepEqual(getHoennEmergeDestination("MAP_UNDERWATER_SOOTOPOLIS_CITY", 9, 6), { mapId: "MAP_SOOTOPOLIS_CITY", x: 29, y: 53 });
assert.deepEqual(getHoennEmergeDestination("MAP_UNDERWATER_SEAFLOOR_CAVERN", 6, 5), { mapId: "MAP_SEAFLOOR_CAVERN_ENTRANCE", x: 10, y: 17 });
assert.deepEqual(getHoennEmergeDestination("MAP_UNDERWATER_SEALED_CHAMBER", 12, 44), { mapId: "MAP_SEALED_CHAMBER_OUTER_ROOM", x: 10, y: 19 });

// 5. Sootopolis Gym (Arrecípolis) Ice Puzzle
const sootopolisIce = new SootopolisGymIceTracker();
const thinIce = MBEmerald.MB_THIN_ICE; // 70
const crackedIce = MBEmerald.MB_CRACKED_ICE; // 71

// First step on thin ice cracks it
const step1 = sootopolisIce.onStep(3, 18, thinIce);
assert.equal(step1.action, "crack");
assert.equal(step1.sound, EmeraldConstants.SE_ICE_CRACK);
assert.equal(sootopolisIce.currentStepCount, 1);

// Stepping on 7 more unique thin ice tiles unlocks Stage 1 stairs (8 steps total)
for (let i = 2; i <= 7; i++) {
  const st = sootopolisIce.onStep(3 + i, 18, thinIce);
  assert.equal(st.action, "crack");
}
const step8 = sootopolisIce.onStep(11, 18, thinIce);
assert.equal(step8.action, "crack");
assert.equal(step8.sound, EmeraldConstants.SE_ICE_STAIRS);
assert.ok(step8.unlockedStairs, "Stage 1 stairs unlocked");
assert.equal(step8.unlockedStairs?.stage, 1);
assert.deepEqual(step8.unlockedStairs?.tiles, [{ x: 8, y: 15 }, { x: 8, y: 16 }]);

// Stepping on a previously cracked ice tile breaks it and drops player to B1F
const stepFail = sootopolisIce.onStep(3, 18, crackedIce);
assert.equal(stepFail.action, "fall");
assert.equal(stepFail.sound, EmeraldConstants.SE_ICE_BREAK);
assert.equal(sootopolisIce.currentStepCount, 0, "Falling resets step counter");

// Metatile IDs
assert.equal(METATILE_SootopolisGym_Ice_Broken, 518);
assert.equal(METATILE_SootopolisGym_Ice_Cracked, 526);
assert.equal(METATILE_SootopolisGym_Stairs, 519);

// 6. Mossdeep Gym (Algaria) Rotating Tile Puzzle & Teleporters
const mossdeepGym = new MossdeepGymTracker();

// Teleporters (warps)
const warp1 = mossdeepGym.onStep(3, 28);
assert.equal(warp1.isWarp, true);
assert.deepEqual(warp1.warpDestination, { x: 1, y: 23 });

const warpReturn = mossdeepGym.onStep(21, 6);
assert.equal(warpReturn.isWarp, true);
assert.deepEqual(warpReturn.warpDestination, { x: 6, y: 35 });

// Switches rotate directional arrows counter-clockwise
// Yellow switch at (2, 21)
const yellowSw = mossdeepGym.onStep(2, 21);
assert.equal(yellowSw.isSwitch, true);
assert.equal(yellowSw.switchTrigger?.color, "yellow");
assert.equal(yellowSw.switchTrigger?.puzzleNumber, 0);
assert.equal(yellowSw.newRotation, 3, "Rotates 0 (right) -> 3 (up)");
assert.equal(yellowSw.sound, EmeraldConstants.SE_SWITCH);

// Second press rotates up (3) -> left (2)
const yellowSw2 = mossdeepGym.onStep(3, 30);
assert.equal(yellowSw2.isSwitch, true);
assert.equal(yellowSw2.newRotation, 2);

// Base metatile calculation
const arrowMt = mossdeepGym.getRotatedArrowMetatile(METATILE_MossdeepGym_YellowArrow_Right, 0);
assert.equal(arrowMt, 592 + 2, "Arrow metatile rotated to Left");

// 7. Cracked Floors & Hole Destinations
assert.equal(getCrackedFloorHoleMetatile(559), 520);
assert.equal(getCrackedFloorHoleMetatile(568), 569);
assert.deepEqual(getHoleFallDestination("MAP_SKY_PILLAR_2F", 10, 15), { mapId: "MAP_SKY_PILLAR_1F", x: 10, y: 15 });
assert.deepEqual(getHoleFallDestination("MAP_MIRAGE_TOWER_4F", 12, 14), { mapId: "MAP_MIRAGE_TOWER_3F", x: 12, y: 14 });

// 8. Muddy Slopes
const muddySlopeCheck = checkMuddySlopeMovement(MBEmerald.MB_MUDDY_SLOPE, "north", true);
assert.equal(muddySlopeCheck.canClimb, true);
const muddyFailCheck = checkMuddySlopeMovement(MBEmerald.MB_MUDDY_SLOPE, "north", false);
assert.equal(muddyFailCheck.canClimb, false);

console.log("PASS: hoennMechanics test (Mach & Acro Bike, Balance Rails, Water Rapids, Sealed Chamber, Dive/Emerge, Sootopolis & Mossdeep Gyms).");
