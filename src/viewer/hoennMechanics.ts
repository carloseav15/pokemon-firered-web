import * as MBEmerald from "../games/emerald/generated/metatileBehavior";
import * as EmeraldConstants from "../games/emerald/generated/constants";
import type { Direction } from "./render/sprites";
import type { PlayerVehicle } from "./state";

/**
 * Hoenn Mach Bike Speed Counter (bike.c: sMachBikeSpeeds):
 * - Step 1: Normal speed (1)
 * - Step 2: Fast speed (2)
 * - Step 3+: Fastest speed (4, PLAYER_SPEED_FASTEST)
 * Turning, stopping, bumping, or sliding resets speed to 0.
 */
export class HoennBikeSpeedTracker {
  private steps = 0;
  private currentDirection: Direction | null = null;

  onStep(direction: Direction, vehicle: PlayerVehicle, bikeType: "mach" | "acro"): void {
    if (vehicle !== "bike" || bikeType !== "mach") {
      this.reset();
      return;
    }
    if (this.currentDirection === direction) {
      this.steps++;
    } else {
      this.currentDirection = direction;
      this.steps = 1;
    }
  }

  reset(): void {
    this.steps = 0;
    this.currentDirection = null;
  }

  get speed(): number {
    if (this.steps <= 0) return 1;
    if (this.steps === 1) return 1;
    if (this.steps === 2) return 2;
    return 4; // PLAYER_SPEED_FASTEST
  }

  isMaxSpeed(): boolean {
    return this.speed >= 4;
  }
}

/**
 * Hoenn Acro Bike Tracker (bike.c: CheckMovementInputAcroBike):
 * - Wheelie (standing/moving) and continuous bunny hops holding B button.
 * - Navigating narrow balance rails (Route 119, Safari Zone).
 */
export class HoennAcroBikeTracker {
  private bButtonHeld = false;
  private hopCounter = 0;
  private wheelieActive = false;

  setBButton(held: boolean): void {
    this.bButtonHeld = held;
    if (!held) {
      this.wheelieActive = false;
      this.hopCounter = 0;
    }
  }

  isBHeld(): boolean {
    return this.bButtonHeld;
  }

  isWheelie(): boolean {
    return this.wheelieActive || this.bButtonHeld;
  }

  triggerHop(): { isHop: boolean; sound: number } {
    this.hopCounter++;
    this.wheelieActive = true;
    return { isHop: true, sound: EmeraldConstants.SE_BIKE_HOP };
  }

  reset(): void {
    this.bButtonHeld = false;
    this.hopCounter = 0;
    this.wheelieActive = false;
  }
}

/**
 * Rail metatile behaviors in Emerald (metatile_behavior.c):
 * - MB_VERTICAL_RAIL (213)
 * - MB_HORIZONTAL_RAIL (214)
 * - MB_ISOLATED_VERTICAL_RAIL (211)
 * - MB_ISOLATED_HORIZONTAL_RAIL (212)
 * - MB_BIKE_BRIDGE_OVER_BARRIER (127)
 */
export function isVerticalRail(behavior: number): boolean {
  return (
    MBEmerald.MetatileBehavior_IsVerticalRail(behavior) ||
    MBEmerald.MetatileBehavior_IsIsolatedVerticalRail(behavior)
  );
}

export function isHorizontalRail(behavior: number): boolean {
  return (
    MBEmerald.MetatileBehavior_IsHorizontalRail(behavior) ||
    MBEmerald.MetatileBehavior_IsIsolatedHorizontalRail(behavior)
  );
}

export function isRailMetatile(behavior: number): boolean {
  return (
    isVerticalRail(behavior) ||
    isHorizontalRail(behavior) ||
    behavior === MBEmerald.MB_BIKE_BRIDGE_OVER_BARRIER
  );
}

/**
 * Checks movement onto or across a balance rail (field_player_avatar.c & bike.c).
 * - Foot / Mach Bike: cannot enter balance rails (collision).
 * - Acro Bike: hops onto rail. While on rail, moving in the rail direction advances with hops;
 *   moving perpendicularly executes a sideways jump (sideJump) to an adjacent rail or land.
 */
export function checkRailMovement(
  targetBehavior: number,
  currentOnRail: boolean,
  dir: Direction,
  vehicle: PlayerVehicle,
  bikeType: "mach" | "acro",
  isBunnyHop = false,
): { allowed: boolean; isJump: boolean; isSideJump: boolean; sound?: number } {
  const targetIsRail = isRailMetatile(targetBehavior);

  if (!currentOnRail && !targetIsRail) {
    return { allowed: true, isJump: false, isSideJump: false };
  }

  // Only Acro Bike can ride balance rails
  if (vehicle !== "bike" || bikeType !== "acro") {
    if (targetIsRail) {
      return { allowed: false, isJump: false, isSideJump: false };
    }
    return { allowed: true, isJump: false, isSideJump: false };
  }

  // Acro Bike mounting rail from ground
  if (!currentOnRail && targetIsRail) {
    return {
      allowed: true,
      isJump: true,
      isSideJump: false,
      sound: EmeraldConstants.SE_BIKE_HOP,
    };
  }

  // Already on rail moving to normal ground
  if (currentOnRail && !targetIsRail) {
    return {
      allowed: true,
      isJump: true,
      isSideJump: true,
      sound: EmeraldConstants.SE_BIKE_HOP,
    };
  }

  // Already on rail moving to another rail tile
  if (currentOnRail && targetIsRail) {
    const isTargetVertical = isVerticalRail(targetBehavior);
    const isTargetHorizontal = isHorizontalRail(targetBehavior);

    if (isTargetVertical) {
      if (dir === "north" || dir === "south") {
        return {
          allowed: true,
          isJump: isBunnyHop,
          isSideJump: false,
          sound: isBunnyHop ? EmeraldConstants.SE_BIKE_HOP : undefined,
        };
      } else {
        // Sideways hop between rails (east/west)
        return {
          allowed: true,
          isJump: true,
          isSideJump: true,
          sound: EmeraldConstants.SE_BIKE_HOP,
        };
      }
    }

    if (isTargetHorizontal) {
      if (dir === "east" || dir === "west") {
        return {
          allowed: true,
          isJump: isBunnyHop,
          isSideJump: false,
          sound: isBunnyHop ? EmeraldConstants.SE_BIKE_HOP : undefined,
        };
      } else {
        // Sideways hop between rails (north/south)
        return {
          allowed: true,
          isJump: true,
          isSideJump: true,
          sound: EmeraldConstants.SE_BIKE_HOP,
        };
      }
    }

    return {
      allowed: true,
      isJump: true,
      isSideJump: false,
      sound: EmeraldConstants.SE_BIKE_HOP,
    };
  }

  return { allowed: true, isJump: false, isSideJump: false };
}

/**
 * Water Currents (Rutas 132, 133, 134) & Sealed Chamber navigation.
 */
export function isWaterCurrent(behavior: number): boolean {
  return (
    behavior === MBEmerald.MB_EASTWARD_CURRENT ||
    behavior === MBEmerald.MB_WESTWARD_CURRENT ||
    behavior === MBEmerald.MB_NORTHWARD_CURRENT ||
    behavior === MBEmerald.MB_SOUTHWARD_CURRENT
  );
}

export function getWaterCurrentDirection(behavior: number): Direction | null {
  if (behavior === MBEmerald.MB_WESTWARD_CURRENT) return "west";
  if (behavior === MBEmerald.MB_EASTWARD_CURRENT) return "east";
  if (behavior === MBEmerald.MB_NORTHWARD_CURRENT) return "north";
  if (behavior === MBEmerald.MB_SOUTHWARD_CURRENT) return "south";
  return null;
}

export const SEALED_CHAMBER_DIVE_SPOT = { mapId: "MAP_ROUTE134", x: 60, y: 31 };
export const SEALED_CHAMBER_DESTINATION = { mapId: "MAP_SEALED_CHAMBER_OUTER_ROOM", x: 10, y: 19 };

/**
 * Metatile replacement for cracked floors (field_tasks.c: SetCrackedFloorHoleMetatile).
 * - Cave / Mirage Tower: METATILE_Cave_CrackedFloor (559) -> METATILE_Cave_CrackedFloor_Hole (520)
 * - Pacifidlog / Sky Pillar: (568) -> (569)
 */
export function getCrackedFloorHoleMetatile(metatileId: number): number {
  if (metatileId === 559) return 520;
  return 569;
}

/**
 * Hole fall warp destination mapping for Hoenn multi-floor puzzles
 * (Sky Pillar, Mirage Tower, Mt. Pyre). The player arrives at the exact same (x, y) coordinates on the floor below.
 */
export const HOENN_HOLE_DESTINATIONS: Record<string, string> = {
  MAP_SKY_PILLAR_2F: "MAP_SKY_PILLAR_1F",
  MAP_SKY_PILLAR_4F: "MAP_SKY_PILLAR_3F",
  MAP_MIRAGE_TOWER_2F: "MAP_MIRAGE_TOWER_1F",
  MAP_MIRAGE_TOWER_3F: "MAP_MIRAGE_TOWER_2F",
  MAP_MIRAGE_TOWER_4F: "MAP_MIRAGE_TOWER_3F",
  MAP_MT_PYRE_4F: "MAP_MT_PYRE_3F",
  MAP_MT_PYRE_5F: "MAP_MT_PYRE_4F",
  MAP_MT_PYRE_6F: "MAP_MT_PYRE_5F",
};

export function getHoleFallDestination(mapId: string, x: number, y: number): { mapId: string; x: number; y: number } | null {
  const destMap = HOENN_HOLE_DESTINATIONS[mapId];
  if (!destMap) return null;
  return { mapId: destMap, x, y };
}

/**
 * Muddy Slope check (field_player_avatar.c: ForcedMovement_MuddySlope).
 * When moving North on a muddy slope at speed 4 (Mach Bike top speed), the player climbs up.
 * Otherwise, the player slides down Southward at fast speed.
 */
export function checkMuddySlopeMovement(
  behavior: number,
  intendedDirection: Direction,
  isMaxSpeedBike: boolean,
): { isMuddySlope: boolean; canClimb: boolean; slideDirection: Direction } {
  const isMuddySlope = MBEmerald.MetatileBehavior_IsMuddySlope(behavior);
  if (!isMuddySlope) {
    return { isMuddySlope: false, canClimb: true, slideDirection: "south" };
  }
  const canClimb = intendedDirection === "north" && isMaxSpeedBike;
  return { isMuddySlope: true, canClimb, slideDirection: "south" };
}

/**
 * Dive / Underwater mechanics (field_control_avatar.c: TryDoDiveWarp & overworld.c: SetDiveWarp).
 * Supports deep water in Routes 124, 126, 127, 128, 129, 134, Sootopolis City, Seafloor Cavern,
 * Sealed Chamber and Marine Cave.
 */
export function isDiveableWater(behavior: number): boolean {
  return MBEmerald.MetatileBehavior_IsDiveable(behavior);
}

export function isUnableToEmerge(behavior: number): boolean {
  return MBEmerald.MetatileBehavior_IsUnableToEmerge(behavior);
}

export const HOENN_DIVE_WARPS: Record<string, { mapId: string; x?: number; y?: number }> = {
  MAP_ROUTE124: { mapId: "MAP_UNDERWATER_ROUTE124" },
  MAP_ROUTE126: { mapId: "MAP_UNDERWATER_ROUTE126" },
  MAP_ROUTE127: { mapId: "MAP_UNDERWATER_ROUTE127" },
  MAP_ROUTE128: { mapId: "MAP_UNDERWATER_ROUTE128" },
  MAP_ROUTE129: { mapId: "MAP_UNDERWATER_ROUTE129" },
  MAP_ROUTE105: { mapId: "MAP_UNDERWATER_ROUTE105" },
  MAP_ROUTE125: { mapId: "MAP_UNDERWATER_ROUTE125" },
  MAP_ROUTE134: { mapId: "MAP_UNDERWATER_ROUTE134", x: 8, y: 6 },
  MAP_SOOTOPOLIS_CITY: { mapId: "MAP_UNDERWATER_SOOTOPOLIS_CITY", x: 9, y: 6 },
  MAP_SEAFLOOR_CAVERN_ENTRANCE: { mapId: "MAP_UNDERWATER_SEAFLOOR_CAVERN", x: 6, y: 5 },
  MAP_SEALED_CHAMBER_OUTER_ROOM: { mapId: "MAP_UNDERWATER_SEALED_CHAMBER", x: 12, y: 44 },
  MAP_ABANDONED_SHIP_CORRIDORS_B1F: { mapId: "MAP_ABANDONED_SHIP_UNDERWATER1", x: 5, y: 4 },
  MAP_ABANDONED_SHIP_ROOMS_B1F: { mapId: "MAP_ABANDONED_SHIP_UNDERWATER2", x: 17, y: 4 },
  MAP_MARINE_CAVE_ENTRANCE: { mapId: "MAP_UNDERWATER_MARINE_CAVE", x: 9, y: 6 },
};

export const HOENN_EMERGE_WARPS: Record<string, { mapId: string; x?: number; y?: number }> = {
  MAP_UNDERWATER_ROUTE124: { mapId: "MAP_ROUTE124" },
  MAP_UNDERWATER_ROUTE126: { mapId: "MAP_ROUTE126" },
  MAP_UNDERWATER_ROUTE127: { mapId: "MAP_ROUTE127" },
  MAP_UNDERWATER_ROUTE128: { mapId: "MAP_ROUTE128" },
  MAP_UNDERWATER_ROUTE129: { mapId: "MAP_ROUTE129" },
  MAP_UNDERWATER_ROUTE105: { mapId: "MAP_ROUTE105" },
  MAP_UNDERWATER_ROUTE125: { mapId: "MAP_ROUTE125" },
  MAP_UNDERWATER_ROUTE134: { mapId: "MAP_ROUTE134", x: 60, y: 31 },
  MAP_UNDERWATER_SOOTOPOLIS_CITY: { mapId: "MAP_SOOTOPOLIS_CITY", x: 29, y: 53 },
  MAP_UNDERWATER_SEAFLOOR_CAVERN: { mapId: "MAP_SEAFLOOR_CAVERN_ENTRANCE", x: 10, y: 17 },
  MAP_UNDERWATER_SEALED_CHAMBER: { mapId: "MAP_SEALED_CHAMBER_OUTER_ROOM", x: 10, y: 19 },
  MAP_UNDERWATER_MARINE_CAVE: { mapId: "MAP_MARINE_CAVE_ENTRANCE", x: 10, y: 17 },
  MAP_ABANDONED_SHIP_UNDERWATER1: { mapId: "MAP_ABANDONED_SHIP_CORRIDORS_B1F", x: 0, y: 10 },
  MAP_ABANDONED_SHIP_UNDERWATER2: { mapId: "MAP_ABANDONED_SHIP_ROOMS_B1F", x: 13, y: 7 },
};

export function getHoennDiveDestination(mapId: string, x: number, y: number): { mapId: string; x: number; y: number } | null {
  const dest = HOENN_DIVE_WARPS[mapId];
  if (!dest) return null;
  return {
    mapId: dest.mapId,
    x: dest.x !== undefined ? dest.x : x,
    y: dest.y !== undefined ? dest.y : y,
  };
}

export function getHoennEmergeDestination(mapId: string, x: number, y: number): { mapId: string; x: number; y: number } | null {
  const dest = HOENN_EMERGE_WARPS[mapId];
  if (!dest) return null;
  return {
    mapId: dest.mapId,
    x: dest.x !== undefined ? dest.x : x,
    y: dest.y !== undefined ? dest.y : y,
  };
}

/**
 * Sootopolis Gym (Arrecípolis) Ice Puzzle:
 * - Walking on thin ice cracks it (METATILE_SootopolisGym_Ice_Cracked = 526, SE_ICE_CRACK).
 * - Stepping on a cracked tile twice breaks it (METATILE_SootopolisGym_Ice_Broken = 518, SE_ICE_BREAK),
 *   causing the player to fall to B1F (SE_FALL).
 * - Stepping on each tile in a section exactly once unlocks the stairs to the next platform (SE_ICE_STAIRS):
 *   Stage 1: 8 steps -> Stairs at (8, 15) and (8, 16)
 *   Stage 2: 28 steps -> Stairs at (8, 10) and (8, 11)
 *   Stage 3: 67 steps -> Stairs at (8, 4) and (8, 5) leading to Juan/Wallace.
 */
export const METATILE_SootopolisGym_Ice_Broken = 518; // 0x206
export const METATILE_SootopolisGym_Ice_Cracked = 526; // 0x20E
export const METATILE_SootopolisGym_Stairs = 519; // 0x207

export interface SootopolisStairsUnlock {
  stage: number;
  tiles: Array<{ x: number; y: number }>;
}

export class SootopolisGymIceTracker {
  private visitedTiles = new Set<string>();
  private stepCount = 0;

  onStep(x: number, y: number, behavior: number): {
    action: "none" | "crack" | "fall";
    unlockedStairs?: SootopolisStairsUnlock;
    sound?: number;
  } {
    const key = `${x},${y}`;
    const isThin = MBEmerald.MetatileBehavior_IsThinIce(behavior);
    const isCracked = MBEmerald.MetatileBehavior_IsCrackedIce(behavior) || this.visitedTiles.has(key);

    if (isCracked) {
      this.reset();
      return {
        action: "fall",
        sound: EmeraldConstants.SE_ICE_BREAK,
      };
    }

    if (isThin) {
      this.visitedTiles.add(key);
      this.stepCount++;

      let unlockedStairs: SootopolisStairsUnlock | undefined;
      if (this.stepCount === 8) {
        unlockedStairs = {
          stage: 1,
          tiles: [
            { x: 8, y: 15 },
            { x: 8, y: 16 },
          ],
        };
      } else if (this.stepCount === 28) {
        unlockedStairs = {
          stage: 2,
          tiles: [
            { x: 8, y: 10 },
            { x: 8, y: 11 },
          ],
        };
      } else if (this.stepCount === 67) {
        unlockedStairs = {
          stage: 3,
          tiles: [
            { x: 8, y: 4 },
            { x: 8, y: 5 },
          ],
        };
      }

      return {
        action: "crack",
        unlockedStairs,
        sound: unlockedStairs ? EmeraldConstants.SE_ICE_STAIRS : EmeraldConstants.SE_ICE_CRACK,
      };
    }

    return { action: "none" };
  }

  get currentStepCount(): number {
    return this.stepCount;
  }

  reset(): void {
    this.visitedTiles.clear();
    this.stepCount = 0;
  }
}

/**
 * Mossdeep Gym (Algaria) Rotating Tile Puzzle & Warp Teleporters:
 * - Color switches rotate directional arrow metatiles counter-clockwise (rotating_tile_puzzle.c).
 * - Warp pads transport player between gym platform chambers.
 */
export const METATILE_MossdeepGym_YellowArrow_Right = 592; // 0x250

export interface MossdeepSwitchTrigger {
  puzzleNumber: number;
  color: "yellow" | "blue" | "green" | "purple" | "red";
}

export const MOSSDEEP_FLOOR_SWITCHES: Record<string, MossdeepSwitchTrigger> = {
  "2,21": { puzzleNumber: 0, color: "yellow" },
  "3,30": { puzzleNumber: 0, color: "yellow" },
  "8,10": { puzzleNumber: 1, color: "blue" },
  "6,7": { puzzleNumber: 1, color: "blue" },
  "15,34": { puzzleNumber: 2, color: "green" },
  "23,24": { puzzleNumber: 3, color: "purple" },
  "23,21": { puzzleNumber: 3, color: "purple" },
  "8,6": { puzzleNumber: 4, color: "red" },
};

export const MOSSDEEP_GYM_WARPS: Record<string, { x: number; y: number }> = {
  "3,28": { x: 1, y: 23 },
  "1,23": { x: 3, y: 28 },
  "7,18": { x: 8, y: 12 },
  "8,12": { x: 7, y: 18 },
  "9,18": { x: 23, y: 20 },
  "23,20": { x: 9, y: 18 },
  "1,33": { x: 20, y: 24 },
  "20,24": { x: 1, y: 33 },
  "11,3": { x: 11, y: 35 },
  "11,35": { x: 11, y: 3 },
  "13,32": { x: 21, y: 10 },
  "21,10": { x: 13, y: 32 },
  "21,6": { x: 6, y: 35 }, // Return to entrance
};

export class MossdeepGymTracker {
  // Arrow rotation states for the 5 colors (0: yellow, 1: blue, 2: green, 3: purple, 4: red)
  // 0 = Right, 1 = Down, 2 = Left, 3 = Up. Each switch rotates counter-clockwise:
  // Right (0) -> Up (3) -> Left (2) -> Down (1) -> Right (0)
  private puzzleRotations: number[] = [0, 0, 0, 0, 0];

  onStep(x: number, y: number): {
    isSwitch: boolean;
    isWarp: boolean;
    switchTrigger?: MossdeepSwitchTrigger;
    warpDestination?: { x: number; y: number };
    newRotation?: number;
    sound?: number;
  } {
    const key = `${x},${y}`;
    const warp = MOSSDEEP_GYM_WARPS[key];
    if (warp) {
      return {
        isSwitch: false,
        isWarp: true,
        warpDestination: warp,
        sound: EmeraldConstants.SE_WARP_IN,
      };
    }

    const sw = MOSSDEEP_FLOOR_SWITCHES[key];
    if (sw) {
      // Counter-clockwise rotation: 0 -> 3 -> 2 -> 1 -> 0
      const current = this.puzzleRotations[sw.puzzleNumber]!;
      const next = (current + 3) % 4;
      this.puzzleRotations[sw.puzzleNumber] = next;
      return {
        isSwitch: true,
        isWarp: false,
        switchTrigger: sw,
        newRotation: next,
        sound: EmeraldConstants.SE_SWITCH,
      };
    }

    return { isSwitch: false, isWarp: false };
  }

  getRotatedArrowMetatile(baseMetatile: number, puzzleNumber: number): number {
    const rowOffset = puzzleNumber * 8;
    const rot = this.puzzleRotations[puzzleNumber] || 0;
    return METATILE_MossdeepGym_YellowArrow_Right + rowOffset + rot;
  }
}
