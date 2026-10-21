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

/**
 * Ash Grass mechanics in Route 113 & Lavaridge (field_tasks.c: AshGrassPerStepCallback).
 * Walking over ash-covered grass cleans it, leaving normal green grass, producing
 * a puff of ash, and accumulating soot for the Soot Sack.
 */
export const METATILE_Fallarbor_AshGrass = 522; // 0x20A
export const METATILE_Fallarbor_NormalGrass = 530; // 0x212
export const METATILE_Lavaridge_AshGrass = 519; // 0x207
export const METATILE_Lavaridge_NormalGrass = 518; // 0x206

export function getCleanGrassMetatile(metatileId: number): number {
  if (metatileId === METATILE_Lavaridge_AshGrass) {
    return METATILE_Lavaridge_NormalGrass;
  }
  return METATILE_Fallarbor_NormalGrass;
}

export class HoennAshTracker {
  private sootSteps = 0;

  onStep(behavior: number, metatileId: number): { isAsh: boolean; cleanMetatile: number; sootCount: number; sound?: number } {
    if (MBEmerald.MetatileBehavior_IsAshGrass(behavior) || metatileId === METATILE_Fallarbor_AshGrass || metatileId === METATILE_Lavaridge_AshGrass) {
      this.sootSteps++;
      return {
        isAsh: true,
        cleanMetatile: getCleanGrassMetatile(metatileId),
        sootCount: this.sootSteps,
        sound: EmeraldConstants.SE_FU_ZAKU,
      };
    }
    return { isAsh: false, cleanMetatile: metatileId, sootCount: this.sootSteps };
  }

  get totalSoot(): number {
    return this.sootSteps;
  }

  reset(): void {
    this.sootSteps = 0;
  }
}

/**
 * Shoal Cave Tides (time_events.c: UpdateShoalTideFlag).
 * - High tide: 09:00 - 14:59, 21:00 - 02:59 (water flooded, surf navigation, shoal shells)
 * - Low tide:  03:00 - 08:59, 15:00 - 20:59 (water receded, shoal salt piles, ice room unlocked)
 */
export type ShoalTide = "high" | "low";

export function getShoalTide(hours?: number): ShoalTide {
  const h = hours !== undefined ? hours : new Date().getHours();
  if ((h >= 9 && h < 15) || (h >= 21 || h < 3)) {
    return "high";
  }
  return "low";
}

export const SHOAL_CAVE_TIDE_MAPS: Record<string, { high: string; low: string }> = {
  MAP_SHOAL_CAVE_LOW_TIDE_ENTRANCE_ROOM: {
    high: "MAP_SHOAL_CAVE_HIGH_TIDE_ENTRANCE_ROOM",
    low: "MAP_SHOAL_CAVE_LOW_TIDE_ENTRANCE_ROOM",
  },
  MAP_SHOAL_CAVE_HIGH_TIDE_ENTRANCE_ROOM: {
    high: "MAP_SHOAL_CAVE_HIGH_TIDE_ENTRANCE_ROOM",
    low: "MAP_SHOAL_CAVE_LOW_TIDE_ENTRANCE_ROOM",
  },
  MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM: {
    high: "MAP_SHOAL_CAVE_HIGH_TIDE_INNER_ROOM",
    low: "MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM",
  },
  MAP_SHOAL_CAVE_HIGH_TIDE_INNER_ROOM: {
    high: "MAP_SHOAL_CAVE_HIGH_TIDE_INNER_ROOM",
    low: "MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM",
  },
};

export function getShoalCaveTideDestination(currentMap: string, targetTide: ShoalTide): string | null {
  const entry = SHOAL_CAVE_TIDE_MAPS[currentMap];
  if (!entry) return null;
  return targetTide === "high" ? entry.high : entry.low;
}

/**
 * Mt. Chimney Cable Car Station (cable_car.c).
 * Connects Route 112 (base) with Mt. Chimney summit (volcano crater).
 */
export const CABLE_CAR_STATIONS = {
  BASE: "MAP_ROUTE112_CABLE_CAR_STATION",
  TOP: "MAP_MT_CHIMNEY_CABLE_CAR_STATION",
};

export function isCableCarStation(mapId: string): boolean {
  return mapId === CABLE_CAR_STATIONS.BASE || mapId === CABLE_CAR_STATIONS.TOP;
}

export function getCableCarDestination(currentMap: string): { destMap: string; x: number; y: number; goingUp: boolean } | null {
  if (currentMap === CABLE_CAR_STATIONS.BASE) {
    return {
      destMap: CABLE_CAR_STATIONS.TOP,
      x: 6,
      y: 7,
      goingUp: true,
    };
  }
  if (currentMap === CABLE_CAR_STATIONS.TOP) {
    return {
      destMap: CABLE_CAR_STATIONS.BASE,
      x: 6,
      y: 7,
      goingUp: false,
    };
  }
  return null;
}

/**
 * Fortree City Gym (Ciudad Arborada - Winona / Alana):
 * Rotating Gates Puzzle (rotating_gate.c).
 * Gates shaped like 'L' and 'T' pivot 90° or 180° when pushed against their arms,
 * altering the passageways across the treehouse gym.
 */
export const GATE_SHAPE_L1 = 0;
export const GATE_SHAPE_L2 = 1;
export const GATE_SHAPE_L3 = 2;
export const GATE_SHAPE_L4 = 3;
export const GATE_SHAPE_T1 = 4;
export const GATE_SHAPE_T2 = 5;
export const GATE_SHAPE_T3 = 6;
export const GATE_SHAPE_T4 = 7;

export const GATE_ORIENTATION_0 = 0;
export const GATE_ORIENTATION_90 = 1;
export const GATE_ORIENTATION_180 = 2;
export const GATE_ORIENTATION_270 = 3;
export const GATE_ORIENTATION_MAX = 4;

export const GATE_ARM_NORTH = 0;
export const GATE_ARM_EAST = 1;
export const GATE_ARM_SOUTH = 2;
export const GATE_ARM_WEST = 3;

export const ROTATE_NONE = 0;
export const ROTATE_ANTICLOCKWISE = 1;
export const ROTATE_CLOCKWISE = 2;

function GATE_ROT(rotationDirection: number, arm: number, longArm: number): number {
  return ((rotationDirection & 15) << 4) | ((arm & 7) << 1) | (longArm & 1);
}
function GATE_ROT_CW(arm: number, longArm: number): number {
  return GATE_ROT(ROTATE_CLOCKWISE, arm, longArm);
}
function GATE_ROT_ACW(arm: number, longArm: number): number {
  return GATE_ROT(ROTATE_ANTICLOCKWISE, arm, longArm);
}
export const GATE_ROT_NONE = 255;

export const ROTATING_GATE_ROTATION_INFO_NORTH = [
  GATE_ROT_NONE,                 GATE_ROT_NONE,                 GATE_ROT_NONE,                  GATE_ROT_NONE,
  GATE_ROT_CW(GATE_ARM_WEST, 1), GATE_ROT_CW(GATE_ARM_WEST, 0), GATE_ROT_ACW(GATE_ARM_EAST, 0), GATE_ROT_ACW(GATE_ARM_EAST, 1),
  GATE_ROT_NONE,                 GATE_ROT_NONE,                 GATE_ROT_NONE,                  GATE_ROT_NONE,
  GATE_ROT_NONE,                 GATE_ROT_NONE,                 GATE_ROT_NONE,                  GATE_ROT_NONE,
];

export const ROTATING_GATE_ROTATION_INFO_SOUTH = [
  GATE_ROT_NONE,                  GATE_ROT_NONE,                  GATE_ROT_NONE,                 GATE_ROT_NONE,
  GATE_ROT_NONE,                  GATE_ROT_NONE,                  GATE_ROT_NONE,                 GATE_ROT_NONE,
  GATE_ROT_ACW(GATE_ARM_WEST, 1), GATE_ROT_ACW(GATE_ARM_WEST, 0), GATE_ROT_CW(GATE_ARM_EAST, 0), GATE_ROT_CW(GATE_ARM_EAST, 1),
  GATE_ROT_NONE,                  GATE_ROT_NONE,                  GATE_ROT_NONE,                 GATE_ROT_NONE,
];

export const ROTATING_GATE_ROTATION_INFO_WEST = [
  GATE_ROT_NONE, GATE_ROT_ACW(GATE_ARM_NORTH, 1), GATE_ROT_NONE, GATE_ROT_NONE,
  GATE_ROT_NONE, GATE_ROT_ACW(GATE_ARM_NORTH, 0), GATE_ROT_NONE, GATE_ROT_NONE,
  GATE_ROT_NONE, GATE_ROT_CW(GATE_ARM_SOUTH, 0),  GATE_ROT_NONE, GATE_ROT_NONE,
  GATE_ROT_NONE, GATE_ROT_CW(GATE_ARM_SOUTH, 1),  GATE_ROT_NONE, GATE_ROT_NONE,
];

export const ROTATING_GATE_ROTATION_INFO_EAST = [
  GATE_ROT_NONE, GATE_ROT_NONE, GATE_ROT_CW(GATE_ARM_NORTH, 1),  GATE_ROT_NONE,
  GATE_ROT_NONE, GATE_ROT_NONE, GATE_ROT_CW(GATE_ARM_NORTH, 0),  GATE_ROT_NONE,
  GATE_ROT_NONE, GATE_ROT_NONE, GATE_ROT_ACW(GATE_ARM_SOUTH, 0), GATE_ROT_NONE,
  GATE_ROT_NONE, GATE_ROT_NONE, GATE_ROT_ACW(GATE_ARM_SOUTH, 1), GATE_ROT_NONE,
];

export const ROTATING_GATE_ARM_POSITIONS_CW = [
  { x: 0, y: -1 }, { x: 1, y: -2 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: -1, y: 0 }, { x: -1, y: 1 }, { x: -1, y: -1 }, { x: -2, y: -1 },
];

export const ROTATING_GATE_ARM_POSITIONS_ACW = [
  { x: -1, y: -1 }, { x: -1, y: -2 }, { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 0, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: -2, y: 0 },
];

export const ROTATING_GATE_ARM_LAYOUT = [
  // L-shape gates
  [ 1, 0,  1, 0,  0, 0,  0, 0 ], // L1
  [ 1, 1,  1, 0,  0, 0,  0, 0 ], // L2
  [ 1, 0,  1, 1,  0, 0,  0, 0 ], // L3
  [ 1, 1,  1, 1,  0, 0,  0, 0 ], // L4

  // T-shape gates
  [ 1, 0,  1, 0,  1, 0,  0, 0 ], // T1
  [ 1, 1,  1, 0,  1, 0,  0, 0 ], // T2
  [ 1, 0,  1, 1,  1, 0,  0, 0 ], // T3
  [ 1, 0,  1, 0,  1, 1,  0, 0 ], // T4
];

export interface RotatingGateConfig {
  x: number;
  y: number;
  shape: number;
  initialOrientation: number;
}

export const FORTREE_GYM_GATES: RotatingGateConfig[] = [
  { x: 6, y: 7, shape: GATE_SHAPE_T2, initialOrientation: GATE_ORIENTATION_90 },
  { x: 9, y: 15, shape: GATE_SHAPE_T2, initialOrientation: GATE_ORIENTATION_180 },
  { x: 3, y: 19, shape: GATE_SHAPE_T2, initialOrientation: GATE_ORIENTATION_90 },
  { x: 2, y: 6, shape: GATE_SHAPE_T1, initialOrientation: GATE_ORIENTATION_90 },
  { x: 9, y: 12, shape: GATE_SHAPE_T1, initialOrientation: GATE_ORIENTATION_0 },
  { x: 6, y: 23, shape: GATE_SHAPE_T1, initialOrientation: GATE_ORIENTATION_0 },
  { x: 12, y: 22, shape: GATE_SHAPE_T1, initialOrientation: GATE_ORIENTATION_0 },
  { x: 6, y: 3, shape: GATE_SHAPE_L4, initialOrientation: GATE_ORIENTATION_180 },
];

export class FortreeGymRotatingGateTracker {
  private gateOrientations: number[];

  constructor(gates = FORTREE_GYM_GATES) {
    this.gateOrientations = gates.map(g => g.initialOrientation);
  }

  getOrientation(gateId: number): number {
    return this.gateOrientations[gateId] ?? 0;
  }

  setOrientation(gateId: number, orientation: number): void {
    this.gateOrientations[gateId] = orientation % GATE_ORIENTATION_MAX;
  }

  reset(): void {
    this.gateOrientations = FORTREE_GYM_GATES.map(g => g.initialOrientation);
  }

  hasArm(gateId: number, armInfo: number): boolean {
    const arm = Math.floor(armInfo / 2);
    const isLongArm = armInfo % 2;
    const currentOrientation = this.getOrientation(gateId);
    const armOrientation = (arm - currentOrientation + 4) % 4;
    const shape = FORTREE_GYM_GATES[gateId].shape;
    return (ROTATING_GATE_ARM_LAYOUT[shape]?.[armOrientation * 2 + isLongArm] ?? 0) === 1;
  }

  canRotate(
    gateId: number,
    rotationDirection: number,
    isCollisionAtCoord?: (x: number, y: number) => boolean,
  ): boolean {
    const armPos =
      rotationDirection === ROTATE_ANTICLOCKWISE
        ? ROTATING_GATE_ARM_POSITIONS_ACW
        : rotationDirection === ROTATE_CLOCKWISE
          ? ROTATING_GATE_ARM_POSITIONS_CW
          : null;
    if (!armPos) return false;

    const orientation = this.getOrientation(gateId);
    const gate = FORTREE_GYM_GATES[gateId];
    const shape = gate.shape;

    for (let i = GATE_ARM_NORTH; i <= GATE_ARM_WEST; i++) {
      for (let j = 0; j < 2; j++) {
        const armIndex = 2 * ((orientation + i) % 4) + j;
        if (ROTATING_GATE_ARM_LAYOUT[shape]?.[2 * i + j]) {
          const checkX = gate.x + armPos[armIndex].x;
          const checkY = gate.y + armPos[armIndex].y;
          if (isCollisionAtCoord && isCollisionAtCoord(checkX, checkY)) {
            return false;
          }
        }
      }
    }
    return true;
  }

  rotateInDirection(gateId: number, rotationDirection: number): number {
    let orientation = this.getOrientation(gateId);
    if (rotationDirection === ROTATE_ANTICLOCKWISE) {
      orientation = orientation === 0 ? GATE_ORIENTATION_270 : orientation - 1;
    } else if (rotationDirection === ROTATE_CLOCKWISE) {
      orientation = (orientation + 1) % GATE_ORIENTATION_MAX;
    }
    this.setOrientation(gateId, orientation);
    return orientation;
  }

  checkMovement(
    direction: Direction,
    targetX: number,
    targetY: number,
    isCollisionAtCoord?: (x: number, y: number) => boolean,
  ): {
    blocked: boolean;
    rotated: boolean;
    gateId?: number;
    newOrientation?: number;
    sound?: number;
  } {
    let rotationTable: number[];
    if (direction === "north") {
      rotationTable = ROTATING_GATE_ROTATION_INFO_NORTH;
    } else if (direction === "south") {
      rotationTable = ROTATING_GATE_ROTATION_INFO_SOUTH;
    } else if (direction === "west") {
      rotationTable = ROTATING_GATE_ROTATION_INFO_WEST;
    } else if (direction === "east") {
      rotationTable = ROTATING_GATE_ROTATION_INFO_EAST;
    } else {
      return { blocked: false, rotated: false };
    }

    for (let i = 0; i < FORTREE_GYM_GATES.length; i++) {
      const gate = FORTREE_GYM_GATES[i];
      if (
        gate.x - 2 <= targetX &&
        targetX <= gate.x + 1 &&
        gate.y - 2 <= targetY &&
        targetY <= gate.y + 1
      ) {
        const centerX = targetX - gate.x + 2;
        const centerY = targetY - gate.y + 2;
        const rotationInfo = rotationTable[centerY * 4 + centerX];

        if (rotationInfo !== undefined && rotationInfo !== GATE_ROT_NONE) {
          const rotationDirection = (rotationInfo & 0xf0) >> 4;
          const armInfo = rotationInfo & 0x0f;

          if (this.hasArm(i, armInfo)) {
            if (this.canRotate(i, rotationDirection, isCollisionAtCoord)) {
              const newOrientation = this.rotateInDirection(i, rotationDirection);
              return {
                blocked: false,
                rotated: true,
                gateId: i,
                newOrientation,
                sound: EmeraldConstants.SE_ROTATING_GATE,
              };
            }
            return { blocked: true, rotated: false, gateId: i };
          }
        }
      }
    }

    return { blocked: false, rotated: false };
  }
}

/**
 * Mauville City Gym (Ciudad Malvalona - Wattson / Erico):
 * Electric Laser Barriers Puzzle (field_specials.c & MauvilleCity_Gym/scripts.inc).
 * Stepping on 4 floor switches activates/deactivates alternating red and green laser beams.
 */
export const METATILE_MauvilleGym_RaisedSwitch = 517; // 0x205
export const METATILE_MauvilleGym_PressedSwitch = 518; // 0x206
export const METATILE_MauvilleGym_FloorTile = 538; // 0x21A

export const METATILE_MauvilleGym_GreenBeamH1_On = 544; // 0x220
export const METATILE_MauvilleGym_GreenBeamH2_On = 545; // 0x221
export const METATILE_MauvilleGym_RedBeamH1_On = 546; // 0x222
export const METATILE_MauvilleGym_RedBeamH2_On = 547; // 0x223

export const METATILE_MauvilleGym_GreenBeamH3_On = 552; // 0x228
export const METATILE_MauvilleGym_GreenBeamH4_On = 553; // 0x229
export const METATILE_MauvilleGym_RedBeamH3_On = 554; // 0x22A
export const METATILE_MauvilleGym_RedBeamH4_On = 555; // 0x22B

export const METATILE_MauvilleGym_GreenBeamH1_Off = 560; // 0x230
export const METATILE_MauvilleGym_GreenBeamH2_Off = 561; // 0x231
export const METATILE_MauvilleGym_RedBeamH1_Off = 562; // 0x232
export const METATILE_MauvilleGym_RedBeamH2_Off = 563; // 0x233

export const METATILE_MauvilleGym_GreenBeamH3_Off = 568; // 0x238
export const METATILE_MauvilleGym_GreenBeamH4_Off = 569; // 0x239
export const METATILE_MauvilleGym_RedBeamH3_Off = 570; // 0x23A
export const METATILE_MauvilleGym_RedBeamH4_Off = 571; // 0x23B

export const METATILE_MauvilleGym_GreenBeamV1_On = 576; // 0x240
export const METATILE_MauvilleGym_RedBeamV1_On = 577; // 0x241
export const METATILE_MauvilleGym_PoleBottom_On = 578; // 0x242
export const METATILE_MauvilleGym_PoleBottom_Off = 579; // 0x243

export const METATILE_MauvilleGym_GreenBeamV2_On = 584; // 0x248
export const METATILE_MauvilleGym_RedBeamV2_On = 585; // 0x249
export const METATILE_MauvilleGym_PoleTop_On = 592; // 0x250
export const METATILE_MauvilleGym_PoleTop_Off = 593; // 0x251

export const MAUVILLE_GYM_SWITCHES = [
  { x: 0, y: 15 },
  { x: 4, y: 12 },
  { x: 3, y: 9 },
  { x: 8, y: 9 },
];

export function isElectricBarrierMetatile(metatileId: number): boolean {
  return (
    metatileId === METATILE_MauvilleGym_GreenBeamH3_On ||
    metatileId === METATILE_MauvilleGym_GreenBeamH4_On ||
    metatileId === METATILE_MauvilleGym_RedBeamH3_On ||
    metatileId === METATILE_MauvilleGym_RedBeamH4_On ||
    metatileId === METATILE_MauvilleGym_GreenBeamV1_On ||
    metatileId === METATILE_MauvilleGym_GreenBeamV2_On ||
    metatileId === METATILE_MauvilleGym_RedBeamV1_On ||
    metatileId === METATILE_MauvilleGym_RedBeamV2_On ||
    metatileId === METATILE_MauvilleGym_PoleBottom_On ||
    metatileId === METATILE_MauvilleGym_PoleBottom_Off ||
    metatileId === METATILE_MauvilleGym_PoleTop_On
  );
}

export interface MetatileTileUpdate {
  x: number;
  y: number;
  metatileId: number;
}

export class MauvilleGymLaserTracker {
  private activeSwitchIndex: number | null = null;
  private altBarriers = false;
  private defeated = false;

  onStep(x: number, y: number): {
    isSwitch: boolean;
    switchIndex?: number;
    altBarriers?: boolean;
    tileUpdates?: MetatileTileUpdate[];
    soundSwitch?: number;
    soundUnlock?: number;
  } {
    if (this.defeated) return { isSwitch: false };

    const switchIndex = MAUVILLE_GYM_SWITCHES.findIndex(s => s.x === x && s.y === y);
    if (switchIndex === -1) return { isSwitch: false };

    this.activeSwitchIndex = switchIndex;
    this.altBarriers = !this.altBarriers;

    const tileUpdates: MetatileTileUpdate[] = [];

    // Switch tiles update
    for (let i = 0; i < MAUVILLE_GYM_SWITCHES.length; i++) {
      tileUpdates.push({
        x: MAUVILLE_GYM_SWITCHES[i].x,
        y: MAUVILLE_GYM_SWITCHES[i].y,
        metatileId: i === switchIndex ? METATILE_MauvilleGym_PressedSwitch : METATILE_MauvilleGym_RaisedSwitch,
      });
    }

    // Barrier metatiles update based on altBarriers state
    if (this.altBarriers) {
      // SetAltBarriers
      tileUpdates.push(
        { x: 3, y: 11, metatileId: METATILE_MauvilleGym_RedBeamV1_On },
        { x: 3, y: 12, metatileId: METATILE_MauvilleGym_RedBeamV2_On },
        { x: 3, y: 13, metatileId: METATILE_MauvilleGym_PoleTop_On },
        { x: 4, y: 10, metatileId: METATILE_MauvilleGym_RedBeamH1_On },
        { x: 5, y: 10, metatileId: METATILE_MauvilleGym_RedBeamH2_On },
        { x: 4, y: 11, metatileId: METATILE_MauvilleGym_RedBeamH3_On },
        { x: 5, y: 11, metatileId: METATILE_MauvilleGym_RedBeamH4_On },
        { x: 7, y: 10, metatileId: METATILE_MauvilleGym_RedBeamH1_On },
        { x: 8, y: 10, metatileId: METATILE_MauvilleGym_RedBeamH2_On },
        { x: 7, y: 11, metatileId: METATILE_MauvilleGym_RedBeamH3_On },
        { x: 8, y: 11, metatileId: METATILE_MauvilleGym_RedBeamH4_On },
        { x: 4, y: 13, metatileId: METATILE_MauvilleGym_GreenBeamH1_Off },
        { x: 5, y: 13, metatileId: METATILE_MauvilleGym_GreenBeamH2_Off },
        { x: 4, y: 14, metatileId: METATILE_MauvilleGym_GreenBeamH3_Off },
        { x: 5, y: 14, metatileId: METATILE_MauvilleGym_GreenBeamH4_Off },
        { x: 1, y: 10, metatileId: METATILE_MauvilleGym_GreenBeamH1_Off },
        { x: 2, y: 10, metatileId: METATILE_MauvilleGym_GreenBeamH2_Off },
        { x: 1, y: 11, metatileId: METATILE_MauvilleGym_GreenBeamH3_Off },
        { x: 2, y: 11, metatileId: METATILE_MauvilleGym_GreenBeamH4_Off },
        { x: 6, y: 8, metatileId: METATILE_MauvilleGym_PoleBottom_On },
        { x: 6, y: 9, metatileId: METATILE_MauvilleGym_FloorTile },
        { x: 6, y: 10, metatileId: METATILE_MauvilleGym_PoleTop_Off },
        { x: 4, y: 6, metatileId: METATILE_MauvilleGym_GreenBeamH1_Off },
        { x: 5, y: 6, metatileId: METATILE_MauvilleGym_GreenBeamH2_Off },
        { x: 4, y: 7, metatileId: METATILE_MauvilleGym_GreenBeamH3_Off },
        { x: 5, y: 7, metatileId: METATILE_MauvilleGym_GreenBeamH4_Off },
      );
    } else {
      // Default barriers
      tileUpdates.push(
        { x: 3, y: 11, metatileId: METATILE_MauvilleGym_PoleBottom_Off },
        { x: 3, y: 12, metatileId: METATILE_MauvilleGym_FloorTile },
        { x: 3, y: 13, metatileId: METATILE_MauvilleGym_PoleTop_Off },
        { x: 4, y: 10, metatileId: METATILE_MauvilleGym_RedBeamH1_Off },
        { x: 5, y: 10, metatileId: METATILE_MauvilleGym_RedBeamH2_Off },
        { x: 4, y: 11, metatileId: METATILE_MauvilleGym_RedBeamH3_Off },
        { x: 5, y: 11, metatileId: METATILE_MauvilleGym_RedBeamH4_Off },
        { x: 7, y: 10, metatileId: METATILE_MauvilleGym_RedBeamH1_Off },
        { x: 8, y: 10, metatileId: METATILE_MauvilleGym_RedBeamH2_Off },
        { x: 7, y: 11, metatileId: METATILE_MauvilleGym_RedBeamH3_Off },
        { x: 8, y: 11, metatileId: METATILE_MauvilleGym_RedBeamH4_Off },
        { x: 4, y: 13, metatileId: METATILE_MauvilleGym_GreenBeamH1_On },
        { x: 5, y: 13, metatileId: METATILE_MauvilleGym_GreenBeamH2_On },
        { x: 4, y: 14, metatileId: METATILE_MauvilleGym_GreenBeamH3_On },
        { x: 5, y: 14, metatileId: METATILE_MauvilleGym_GreenBeamH4_On },
        { x: 1, y: 10, metatileId: METATILE_MauvilleGym_GreenBeamH1_On },
        { x: 2, y: 10, metatileId: METATILE_MauvilleGym_GreenBeamH2_On },
        { x: 1, y: 11, metatileId: METATILE_MauvilleGym_GreenBeamH3_On },
        { x: 2, y: 11, metatileId: METATILE_MauvilleGym_GreenBeamH4_On },
        { x: 6, y: 8, metatileId: METATILE_MauvilleGym_GreenBeamV1_On },
        { x: 6, y: 9, metatileId: METATILE_MauvilleGym_GreenBeamV2_On },
        { x: 6, y: 10, metatileId: METATILE_MauvilleGym_PoleTop_On },
        { x: 4, y: 6, metatileId: METATILE_MauvilleGym_GreenBeamH1_On },
        { x: 5, y: 6, metatileId: METATILE_MauvilleGym_GreenBeamH2_On },
        { x: 4, y: 7, metatileId: METATILE_MauvilleGym_GreenBeamH3_On },
        { x: 5, y: 7, metatileId: METATILE_MauvilleGym_GreenBeamH4_On },
      );
    }

    return {
      isSwitch: true,
      switchIndex,
      altBarriers: this.altBarriers,
      tileUpdates,
      soundSwitch: EmeraldConstants.SE_SWITCH,
      soundUnlock: EmeraldConstants.SE_UNLOCK,
    };
  }

  deactivatePuzzle(): { tileUpdates: MetatileTileUpdate[]; soundUnlock: number } {
    this.defeated = true;
    const tileUpdates: MetatileTileUpdate[] = [];

    // Press all switches
    for (const sw of MAUVILLE_GYM_SWITCHES) {
      tileUpdates.push({ x: sw.x, y: sw.y, metatileId: METATILE_MauvilleGym_PressedSwitch });
    }

    // Turn off all beams
    tileUpdates.push(
      { x: 3, y: 11, metatileId: METATILE_MauvilleGym_PoleBottom_Off },
      { x: 3, y: 12, metatileId: METATILE_MauvilleGym_FloorTile },
      { x: 3, y: 13, metatileId: METATILE_MauvilleGym_PoleTop_Off },
      { x: 4, y: 10, metatileId: METATILE_MauvilleGym_RedBeamH1_Off },
      { x: 5, y: 10, metatileId: METATILE_MauvilleGym_RedBeamH2_Off },
      { x: 4, y: 11, metatileId: METATILE_MauvilleGym_RedBeamH3_Off },
      { x: 5, y: 11, metatileId: METATILE_MauvilleGym_RedBeamH4_Off },
      { x: 7, y: 10, metatileId: METATILE_MauvilleGym_RedBeamH1_Off },
      { x: 8, y: 10, metatileId: METATILE_MauvilleGym_RedBeamH2_Off },
      { x: 7, y: 11, metatileId: METATILE_MauvilleGym_RedBeamH3_Off },
      { x: 8, y: 11, metatileId: METATILE_MauvilleGym_RedBeamH4_Off },
      { x: 4, y: 13, metatileId: METATILE_MauvilleGym_GreenBeamH1_Off },
      { x: 5, y: 13, metatileId: METATILE_MauvilleGym_GreenBeamH2_Off },
      { x: 4, y: 14, metatileId: METATILE_MauvilleGym_GreenBeamH3_Off },
      { x: 5, y: 14, metatileId: METATILE_MauvilleGym_GreenBeamH4_Off },
      { x: 1, y: 10, metatileId: METATILE_MauvilleGym_GreenBeamH1_Off },
      { x: 2, y: 10, metatileId: METATILE_MauvilleGym_GreenBeamH2_Off },
      { x: 1, y: 11, metatileId: METATILE_MauvilleGym_GreenBeamH3_Off },
      { x: 2, y: 11, metatileId: METATILE_MauvilleGym_GreenBeamH4_Off },
      { x: 6, y: 8, metatileId: METATILE_MauvilleGym_PoleBottom_Off },
      { x: 6, y: 9, metatileId: METATILE_MauvilleGym_FloorTile },
      { x: 6, y: 10, metatileId: METATILE_MauvilleGym_PoleTop_Off },
      { x: 4, y: 6, metatileId: METATILE_MauvilleGym_GreenBeamH1_Off },
      { x: 5, y: 6, metatileId: METATILE_MauvilleGym_GreenBeamH2_Off },
      { x: 4, y: 7, metatileId: METATILE_MauvilleGym_GreenBeamH3_Off },
      { x: 5, y: 7, metatileId: METATILE_MauvilleGym_GreenBeamH4_Off },
    );

    return {
      tileUpdates,
      soundUnlock: EmeraldConstants.SE_UNLOCK,
    };
  }

  isAlt(): boolean {
    return this.altBarriers;
  }

  isGymDefeated(): boolean {
    return this.defeated;
  }

  reset(): void {
    this.activeSwitchIndex = null;
    this.altBarriers = false;
    this.defeated = false;
  }
}

/**
 * Lavaridge Town Gym (Pueblo Lavácalda - Flannery / Candela):
 * Steam Geysers & Hot Sand Pits Puzzle (field_effect.c & LavaridgeTown_Gym/scripts.inc).
 * Geysers launch the player between 1F and B1F; trainers hide buried under sand.
 */
export interface BuriedTrainerInfo {
  id: string;
  name: string;
  trainerId: number;
  mapId: string;
  x: number;
  y: number;
}

export const LAVARIDGE_BURIED_TRAINERS: BuriedTrainerInfo[] = [
  // 1F
  { id: "COLE", name: "Cole", trainerId: 442, mapId: "MAP_LAVARIDGE_TOWN_GYM_1F", x: 3, y: 14 },
  { id: "GERALD", name: "Gerald", trainerId: 444, mapId: "MAP_LAVARIDGE_TOWN_GYM_1F", x: 2, y: 15 },
  { id: "AXLE", name: "Axle", trainerId: 443, mapId: "MAP_LAVARIDGE_TOWN_GYM_1F", x: 3, y: 10 },
  { id: "DANIELLE", name: "Danielle", trainerId: 445, mapId: "MAP_LAVARIDGE_TOWN_GYM_1F", x: 5, y: 2 },
  // B1F
  { id: "JACE", name: "Jace", trainerId: 446, mapId: "MAP_LAVARIDGE_TOWN_GYM_B1F", x: 4, y: 18 },
  { id: "KEEGAN", name: "Keegan", trainerId: 447, mapId: "MAP_LAVARIDGE_TOWN_GYM_B1F", x: 3, y: 6 },
  { id: "JEFF", name: "Jeff", trainerId: 449, mapId: "MAP_LAVARIDGE_TOWN_GYM_B1F", x: 13, y: 17 },
  { id: "ELI", name: "Eli", trainerId: 448, mapId: "MAP_LAVARIDGE_TOWN_GYM_B1F", x: 4, y: 16 },
];

export const LAVARIDGE_GYM_GEYSER_WARPS: Record<string, { x: number; y: number }> = {
  // 1F to B1F
  "MAP_LAVARIDGE_TOWN_GYM_1F:10,18": { x: 10, y: 18 },
  "MAP_LAVARIDGE_TOWN_GYM_1F:8,9": { x: 8, y: 9 },
  "MAP_LAVARIDGE_TOWN_GYM_1F:4,18": { x: 4, y: 18 },
  "MAP_LAVARIDGE_TOWN_GYM_1F:5,14": { x: 5, y: 14 },
  "MAP_LAVARIDGE_TOWN_GYM_1F:0,17": { x: 0, y: 17 },
  "MAP_LAVARIDGE_TOWN_GYM_1F:5,9": { x: 5, y: 9 },
  "MAP_LAVARIDGE_TOWN_GYM_1F:2,15": { x: 2, y: 15 },
  "MAP_LAVARIDGE_TOWN_GYM_1F:3,14": { x: 3, y: 14 },
  "MAP_LAVARIDGE_TOWN_GYM_1F:1,14": { x: 1, y: 14 },
  "MAP_LAVARIDGE_TOWN_GYM_1F:0,10": { x: 0, y: 10 },
  "MAP_LAVARIDGE_TOWN_GYM_1F:3,10": { x: 3, y: 10 },
  "MAP_LAVARIDGE_TOWN_GYM_1F:0,6": { x: 0, y: 6 },
  "MAP_LAVARIDGE_TOWN_GYM_1F:3,6": { x: 3, y: 6 },
  "MAP_LAVARIDGE_TOWN_GYM_1F:5,6": { x: 5, y: 6 },
  "MAP_LAVARIDGE_TOWN_GYM_1F:2,3": { x: 2, y: 3 },
  "MAP_LAVARIDGE_TOWN_GYM_1F:5,2": { x: 5, y: 2 },
  "MAP_LAVARIDGE_TOWN_GYM_1F:7,2": { x: 7, y: 2 },
  "MAP_LAVARIDGE_TOWN_GYM_1F:8,6": { x: 8, y: 6 },
  "MAP_LAVARIDGE_TOWN_GYM_1F:10,6": { x: 10, y: 6 },
  "MAP_LAVARIDGE_TOWN_GYM_1F:4,16": { x: 4, y: 16 },
  "MAP_LAVARIDGE_TOWN_GYM_1F:12,3": { x: 12, y: 3 },
  "MAP_LAVARIDGE_TOWN_GYM_1F:14,6": { x: 14, y: 6 },
  "MAP_LAVARIDGE_TOWN_GYM_1F:13,17": { x: 13, y: 17 },
  "MAP_LAVARIDGE_TOWN_GYM_1F:12,12": { x: 12, y: 12 },

  // B1F to 1F
  "MAP_LAVARIDGE_TOWN_GYM_B1F:10,18": { x: 10, y: 18 },
  "MAP_LAVARIDGE_TOWN_GYM_B1F:8,9": { x: 8, y: 9 },
  "MAP_LAVARIDGE_TOWN_GYM_B1F:4,18": { x: 4, y: 18 },
  "MAP_LAVARIDGE_TOWN_GYM_B1F:5,14": { x: 5, y: 14 },
  "MAP_LAVARIDGE_TOWN_GYM_B1F:0,17": { x: 0, y: 17 },
  "MAP_LAVARIDGE_TOWN_GYM_B1F:5,9": { x: 5, y: 9 },
  "MAP_LAVARIDGE_TOWN_GYM_B1F:2,15": { x: 2, y: 15 },
  "MAP_LAVARIDGE_TOWN_GYM_B1F:3,14": { x: 3, y: 14 },
  "MAP_LAVARIDGE_TOWN_GYM_B1F:1,14": { x: 1, y: 14 },
  "MAP_LAVARIDGE_TOWN_GYM_B1F:0,10": { x: 0, y: 10 },
  "MAP_LAVARIDGE_TOWN_GYM_B1F:3,10": { x: 3, y: 10 },
  "MAP_LAVARIDGE_TOWN_GYM_B1F:0,6": { x: 0, y: 6 },
  "MAP_LAVARIDGE_TOWN_GYM_B1F:3,6": { x: 3, y: 6 },
  "MAP_LAVARIDGE_TOWN_GYM_B1F:5,6": { x: 5, y: 6 },
  "MAP_LAVARIDGE_TOWN_GYM_B1F:2,3": { x: 2, y: 3 },
  "MAP_LAVARIDGE_TOWN_GYM_B1F:5,2": { x: 5, y: 2 },
  "MAP_LAVARIDGE_TOWN_GYM_B1F:7,2": { x: 7, y: 2 },
  "MAP_LAVARIDGE_TOWN_GYM_B1F:8,6": { x: 8, y: 6 },
  "MAP_LAVARIDGE_TOWN_GYM_B1F:10,6": { x: 10, y: 6 },
  "MAP_LAVARIDGE_TOWN_GYM_B1F:4,16": { x: 4, y: 16 },
  "MAP_LAVARIDGE_TOWN_GYM_B1F:12,3": { x: 12, y: 3 },
  "MAP_LAVARIDGE_TOWN_GYM_B1F:14,6": { x: 14, y: 6 },
  "MAP_LAVARIDGE_TOWN_GYM_B1F:13,17": { x: 13, y: 17 },
  "MAP_LAVARIDGE_TOWN_GYM_B1F:12,12": { x: 12, y: 12 },
};

export class LavaridgeGymTracker {
  private revealedTrainers = new Set<string>();

  onStep(
    mapId: string,
    x: number,
    y: number,
    behavior: number,
  ): {
    action: "none" | "fall" | "launch";
    destMap?: string;
    destX?: number;
    destY?: number;
    soundLaunch?: number;
    soundLand?: number;
  } {
    const is1F = mapId === "MAP_LAVARIDGE_TOWN_GYM_1F";
    const isB1F = mapId === "MAP_LAVARIDGE_TOWN_GYM_B1F";

    const is1FWarp = behavior === MBEmerald.MB_LAVARIDGE_GYM_1F_WARP;
    const isB1FWarp = behavior === MBEmerald.MB_LAVARIDGE_GYM_B1F_WARP;

    if (is1F && is1FWarp) {
      const key = `${mapId}:${x},${y}`;
      const dest = LAVARIDGE_GYM_GEYSER_WARPS[key];
      return {
        action: "fall",
        destMap: "MAP_LAVARIDGE_TOWN_GYM_B1F",
        destX: dest ? dest.x : x,
        destY: dest ? dest.y : y,
        soundLaunch: EmeraldConstants.SE_LAVARIDGE_FALL_WARP,
      };
    }

    if (isB1F && isB1FWarp) {
      const key = `${mapId}:${x},${y}`;
      const dest = LAVARIDGE_GYM_GEYSER_WARPS[key];
      return {
        action: "launch",
        destMap: "MAP_LAVARIDGE_TOWN_GYM_1F",
        destX: dest ? dest.x : x,
        destY: dest ? dest.y : y,
        soundLaunch: EmeraldConstants.SE_LAVARIDGE_FALL_WARP,
        soundLand: EmeraldConstants.SE_M_DIG,
      };
    }

    return { action: "none" };
  }

  checkBuriedTrainers(
    mapId: string,
    playerX: number,
    playerY: number,
  ): {
    revealed: boolean;
    trainer?: BuriedTrainerInfo;
    sound?: number;
  } {
    for (const trainer of LAVARIDGE_BURIED_TRAINERS) {
      if (trainer.mapId !== mapId) continue;
      if (this.revealedTrainers.has(trainer.id)) continue;

      const dist = Math.max(Math.abs(trainer.x - playerX), Math.abs(trainer.y - playerY));
      if (dist <= 1) {
        this.revealedTrainers.add(trainer.id);
        return {
          revealed: true,
          trainer,
          sound: EmeraldConstants.SE_M_DIG,
        };
      }
    }

    return { revealed: false };
  }

  isTrainerRevealed(trainerId: string): boolean {
    return this.revealedTrainers.has(trainerId);
  }

  reset(): void {
    this.revealedTrainers.clear();
  }
}

/**
 * Dewford Town Gym (Pueblo Azuliza - Marcial / Brawly):
 * Stepped Dynamic Darkness (dewford_gym.c / SetFlashLevel / AnimateFlash).
 *
 * In pokeemerald / field_screen_effect.c:
 * sFlashLevelToRadius[] = { 200, 72, 64, 56, 48, 40, 32, 24, 0 };
 * Level 7 is maximum darkness (minimum radius = 24px circular spotlight around player).
 * Defeating each of the 6 martial arts dojo trainers progressively expands the light:
 * - 0 defeated: level 7 (24px)
 * - 1 defeated: level 6 (32px)
 * - 2 defeated: level 5 (40px)
 * - 3 defeated: level 4 (48px)
 * - 4 defeated: level 3 (56px)
 * - 5 defeated: level 2 (64px)
 * - 6 defeated: level 1 (72px)
 * Defeating Leader Brawly: level 0 (200px / floodlights illuminate entire gym)!
 */
export const DEWFORD_FLASH_LEVEL_RADII = [200, 72, 64, 56, 48, 40, 32, 24, 0] as const;

export interface DewfordGymTrainer {
  id: string;
  name: string;
  species: string;
  x: number;
  y: number;
}

export const DEWFORD_GYM_TRAINERS: DewfordGymTrainer[] = [
  { id: "TRAINER_TAKAO", name: "Takao", species: "Machop", x: 2, y: 18 },
  { id: "TRAINER_JOCELYN", name: "Jocelyn", species: "Meditite", x: 15, y: 3 },
  { id: "TRAINER_LAURA", name: "Laura", species: "Meditite", x: 12, y: 25 },
  { id: "TRAINER_BRENDEN", name: "Brenden", species: "Machop", x: 14, y: 12 },
  { id: "TRAINER_CRISTIAN", name: "Cristian", species: "Makuhita", x: 7, y: 8 },
  { id: "TRAINER_LILITH", name: "Lilith", species: "Meditite", x: 16, y: 9 },
];

export const DEWFORD_GYM_LEADER = {
  id: "TRAINER_BRAWLY_1",
  name: "Brawly",
  species: "Makuhita",
  x: 4,
  y: 3,
};

export class DewfordGymDarknessTracker {
  private defeatedTrainers = new Set<string>();
  private brawlyDefeated = false;

  getDefeatedCount(): number {
    return this.defeatedTrainers.size;
  }

  isTrainerDefeated(id: string): boolean {
    return this.defeatedTrainers.has(id);
  }

  isBrawlyDefeated(): boolean {
    return this.brawlyDefeated;
  }

  getFlashLevel(): number {
    if (this.brawlyDefeated) return 0;
    const count = this.defeatedTrainers.size;
    return Math.max(1, 7 - count);
  }

  getFlashRadius(): number {
    const level = this.getFlashLevel();
    return DEWFORD_FLASH_LEVEL_RADII[level] ?? 200;
  }

  defeatTrainer(trainerId: string): {
    changed: boolean;
    prevLevel: number;
    newLevel: number;
    prevRadius: number;
    newRadius: number;
    sound?: number;
    brawlyDefeated?: boolean;
    trainer?: DewfordGymTrainer;
  } {
    const prevLevel = this.getFlashLevel();
    const prevRadius = this.getFlashRadius();

    if (trainerId === DEWFORD_GYM_LEADER.id) {
      if (this.brawlyDefeated) {
        return { changed: false, prevLevel, newLevel: prevLevel, prevRadius, newRadius: prevRadius };
      }
      this.brawlyDefeated = true;
      const newLevel = this.getFlashLevel();
      const newRadius = this.getFlashRadius();
      return {
        changed: true,
        prevLevel,
        newLevel,
        prevRadius,
        newRadius,
        sound: EmeraldConstants.SE_SWITCH,
        brawlyDefeated: true,
      };
    }

    if (this.defeatedTrainers.has(trainerId)) {
      return { changed: false, prevLevel, newLevel: prevLevel, prevRadius, newRadius: prevRadius };
    }

    const trainer = DEWFORD_GYM_TRAINERS.find(t => t.id === trainerId);
    if (!trainer) {
      return { changed: false, prevLevel, newLevel: prevLevel, prevRadius, newRadius: prevRadius };
    }

    this.defeatedTrainers.add(trainerId);
    const newLevel = this.getFlashLevel();
    const newRadius = this.getFlashRadius();
    return {
      changed: true,
      prevLevel,
      newLevel,
      prevRadius,
      newRadius,
      sound: EmeraldConstants.SE_SWITCH,
      brawlyDefeated: false,
      trainer,
    };
  }

  checkTrainerProximity(playerX: number, playerY: number): DewfordGymTrainer | null {
    for (const trainer of DEWFORD_GYM_TRAINERS) {
      if (this.defeatedTrainers.has(trainer.id)) continue;
      const dist = Math.max(Math.abs(trainer.x - playerX), Math.abs(trainer.y - playerY));
      if (dist <= 1) return trainer;
    }
    return null;
  }

  checkLeaderProximity(playerX: number, playerY: number): boolean {
    if (this.brawlyDefeated) return false;
    const dist = Math.max(Math.abs(DEWFORD_GYM_LEADER.x - playerX), Math.abs(DEWFORD_GYM_LEADER.y - playerY));
    return dist <= 1;
  }

  reset(): void {
    this.defeatedTrainers.clear();
    this.brawlyDefeated = false;
  }
}

/**
 * Petalburg City Gym (Ciudad Petalia - Norman):
 * Shoji sliding doors (sliding_door / field_specials.c) and thematic battle rooms.
 * 7 specialized rooms with trainers enhanced with battle items:
 * - Room 1 (Entrance / Vestíbulo): leads to Room 2 (Speed) or Room 3 (Accuracy).
 * - Room 2 (Speed Room): Trainer Randall (Swellow, Agility / X Speed) -> Room 4 (Confusion) or Room 5 (Defense).
 * - Room 3 (Accuracy Room): Trainer Mary (Delcatty, Faint Attack / Dire Hit / X Accuracy) -> Room 5 (Defense) or Room 6 (Recovery).
 * - Room 4 (Confusion Room): Trainer Parker (Spinda, Teeter Dance / X Special) -> Room 7 (Strength).
 * - Room 5 (Defense Room): Trainer Alexia (Wigglytuff, Defense Curl / X Defend) -> Room 7 (Strength) or Room 8 (OHKO).
 * - Room 6 (Recovery Room): Trainer George (Slakoth, Slack Off / Sitrus Berry) -> Room 8 (OHKO).
 * - Room 7 (Strength Room): Trainer Jody (Zangoose, Swords Dance / Slash) -> Room 9 (Norman).
 * - Room 8 (OHKO Room): Trainer Berke (Vigoroth, Focus Energy / Slash) -> Room 9 (Norman).
 * - Room 9 (Gym Leader): Norman (Spinda, Vigoroth, Linoone, Slaking).
 */

export const METATILE_PetalburgGym_Door = 548; // 0x224
export const METATILE_PetalburgGym_RoomEntrance_Left = 528; // 0x210
export const METATILE_PetalburgGym_RoomEntrance_Right = 529; // 0x211
export const METATILE_PetalburgGym_SlidingDoor_Frame0 = 536; // 0x218
export const METATILE_PetalburgGym_SlidingDoor_Frame1 = 537; // 0x219
export const METATILE_PetalburgGym_SlidingDoor_Frame2 = 538; // 0x21A
export const METATILE_PetalburgGym_SlidingDoor_Frame3 = 539; // 0x21B
export const METATILE_PetalburgGym_SlidingDoor_Frame4 = 540; // 0x21C

export const PETALBURG_SLIDING_DOOR_ANIM_FRAMES = [
  METATILE_PetalburgGym_SlidingDoor_Frame0,
  METATILE_PetalburgGym_SlidingDoor_Frame1,
  METATILE_PetalburgGym_SlidingDoor_Frame2,
  METATILE_PetalburgGym_SlidingDoor_Frame3,
  METATILE_PetalburgGym_SlidingDoor_Frame4,
];

export interface PetalburgGymTrainerInfo {
  id: string;
  name: string;
  roomNumber: number;
  roomName: string;
  species: string;
  enhancedItem: string;
  x: number;
  y: number;
}

export const PETALBURG_GYM_TRAINERS: PetalburgGymTrainerInfo[] = [
  {
    id: "TRAINER_RANDALL",
    name: "Randall",
    roomNumber: 2,
    roomName: "Speed Room",
    species: "Swellow",
    enhancedItem: "X Speed",
    x: 4,
    y: 81,
  },
  {
    id: "TRAINER_MARY",
    name: "Mary",
    roomNumber: 3,
    roomName: "Accuracy Room",
    species: "Delcatty",
    enhancedItem: "Dire Hit & X Accuracy",
    x: 4,
    y: 94,
  },
  {
    id: "TRAINER_PARKER",
    name: "Parker",
    roomNumber: 4,
    roomName: "Confusion Room",
    species: "Spinda",
    enhancedItem: "X Special",
    x: 4,
    y: 42,
  },
  {
    id: "TRAINER_ALEXIA",
    name: "Alexia",
    roomNumber: 5,
    roomName: "Defense Room",
    species: "Wigglytuff",
    enhancedItem: "X Defend",
    x: 4,
    y: 55,
  },
  {
    id: "TRAINER_GEORGE",
    name: "George",
    roomNumber: 6,
    roomName: "Recovery Room",
    species: "Slakoth",
    enhancedItem: "Sitrus Berry & Potion",
    x: 4,
    y: 68,
  },
  {
    id: "TRAINER_JODY",
    name: "Jody",
    roomNumber: 7,
    roomName: "Strength Room",
    species: "Zangoose",
    enhancedItem: "X Attack & Slash",
    x: 4,
    y: 16,
  },
  {
    id: "TRAINER_BERKE",
    name: "Berke",
    roomNumber: 8,
    roomName: "One-Hit KO Room",
    species: "Vigoroth",
    enhancedItem: "Dire Hit & Focus Energy",
    x: 4,
    y: 29,
  },
];

export const PETALBURG_GYM_LEADER = {
  id: "TRAINER_NORMAN_1",
  name: "Norman",
  species: "Slaking",
  x: 4,
  y: 2,
};

export interface PetalburgDoorWarp {
  sourceX: number;
  sourceY: number;
  destX: number;
  destY: number;
  requiredTrainer?: string;
  roomFrom: number;
  roomTo: number;
  name: string;
}

export const PETALBURG_NORTH_DOORS: PetalburgDoorWarp[] = [
  // Room 1 (Entrance) -> Room 2 (Speed) or Room 3 (Accuracy)
  { sourceX: 1, sourceY: 104, destX: 7, destY: 85, roomFrom: 1, roomTo: 2, name: "Speed Room Door" },
  { sourceX: 7, sourceY: 104, destX: 1, destY: 98, roomFrom: 1, roomTo: 3, name: "Accuracy Room Door" },

  // Room 2 (Speed) -> Room 4 (Confusion) or Room 5 (Defense)
  { sourceX: 1, sourceY: 78, destX: 7, destY: 46, requiredTrainer: "TRAINER_RANDALL", roomFrom: 2, roomTo: 4, name: "Confusion Room Door" },
  { sourceX: 7, sourceY: 78, destX: 1, destY: 59, requiredTrainer: "TRAINER_RANDALL", roomFrom: 2, roomTo: 5, name: "Defense Room Door (Left)" },

  // Room 3 (Accuracy) -> Room 5 (Defense) or Room 6 (Recovery)
  { sourceX: 1, sourceY: 91, destX: 7, destY: 59, requiredTrainer: "TRAINER_MARY", roomFrom: 3, roomTo: 5, name: "Defense Room Door (Right)" },
  { sourceX: 7, sourceY: 91, destX: 1, destY: 72, requiredTrainer: "TRAINER_MARY", roomFrom: 3, roomTo: 6, name: "Recovery Room Door" },

  // Room 4 (Confusion) -> Room 7 (Strength)
  { sourceX: 7, sourceY: 39, destX: 1, destY: 20, requiredTrainer: "TRAINER_PARKER", roomFrom: 4, roomTo: 7, name: "Strength Room Door (Left)" },

  // Room 5 (Defense) -> Room 7 (Strength) or Room 8 (OHKO)
  { sourceX: 1, sourceY: 52, destX: 7, destY: 20, requiredTrainer: "TRAINER_ALEXIA", roomFrom: 5, roomTo: 7, name: "Strength Room Door (Right)" },
  { sourceX: 7, sourceY: 52, destX: 1, destY: 33, requiredTrainer: "TRAINER_ALEXIA", roomFrom: 5, roomTo: 8, name: "One-Hit KO Room Door (Left)" },

  // Room 6 (Recovery) -> Room 8 (OHKO)
  { sourceX: 1, sourceY: 65, destX: 7, destY: 33, requiredTrainer: "TRAINER_GEORGE", roomFrom: 6, roomTo: 8, name: "One-Hit KO Room Door (Right)" },

  // Room 7 (Strength) -> Room 9 (Norman)
  { sourceX: 7, sourceY: 13, destX: 1, destY: 7, requiredTrainer: "TRAINER_JODY", roomFrom: 7, roomTo: 9, name: "Gym Leader's Room Door (Left)" },

  // Room 8 (OHKO) -> Room 9 (Norman)
  { sourceX: 1, sourceY: 26, destX: 7, destY: 7, requiredTrainer: "TRAINER_BERKE", roomFrom: 8, roomTo: 9, name: "Gym Leader's Room Door (Right)" },
];

export const PETALBURG_SOUTH_EXITS: Record<string, { destX: number; destY: number }> = {
  // Speed Room south exit -> Entrance
  "7,85": { destX: 1, destY: 105 },
  "6,85": { destX: 1, destY: 105 },
  // Accuracy Room south exit -> Entrance
  "1,98": { destX: 7, destY: 105 },
  "2,98": { destX: 7, destY: 105 },
  // Confusion Room south exit -> Speed Room
  "7,46": { destX: 1, destY: 79 },
  "6,46": { destX: 1, destY: 79 },
  // Defense Room south left exit -> Speed Room
  "1,59": { destX: 7, destY: 79 },
  "2,59": { destX: 7, destY: 79 },
  // Defense Room south right exit -> Accuracy Room
  "7,59": { destX: 1, destY: 92 },
  "6,59": { destX: 1, destY: 92 },
  // Recovery Room south exit -> Accuracy Room
  "1,72": { destX: 7, destY: 92 },
  "2,72": { destX: 7, destY: 92 },
  // Strength Room south left exit -> Confusion Room
  "1,20": { destX: 7, destY: 40 },
  "2,20": { destX: 7, destY: 40 },
  // Strength Room south right exit -> Defense Room
  "7,20": { destX: 1, destY: 53 },
  "6,20": { destX: 1, destY: 53 },
  // OHKO Room south left exit -> Defense Room
  "1,33": { destX: 7, destY: 53 },
  "2,33": { destX: 7, destY: 53 },
  // OHKO Room south right exit -> Recovery Room
  "7,33": { destX: 1, destY: 66 },
  "6,33": { destX: 1, destY: 66 },
  // Leader Room south left exit -> Strength Room
  "1,7": { destX: 7, destY: 14 },
  "2,7": { destX: 7, destY: 14 },
  // Leader Room south right exit -> OHKO Room
  "7,7": { destX: 1, destY: 27 },
  "6,7": { destX: 1, destY: 27 },
};

export const PETALBURG_ROOM_DOOR_TILES: Record<number, MetatileTileUpdate[]> = {
  1: [
    { x: 1, y: 104, metatileId: METATILE_PetalburgGym_SlidingDoor_Frame4 },
    { x: 7, y: 104, metatileId: METATILE_PetalburgGym_SlidingDoor_Frame4 },
    { x: 6, y: 85, metatileId: METATILE_PetalburgGym_RoomEntrance_Left },
    { x: 7, y: 85, metatileId: METATILE_PetalburgGym_RoomEntrance_Right },
    { x: 1, y: 98, metatileId: METATILE_PetalburgGym_RoomEntrance_Left },
    { x: 2, y: 98, metatileId: METATILE_PetalburgGym_RoomEntrance_Right },
  ],
  2: [
    { x: 1, y: 78, metatileId: METATILE_PetalburgGym_SlidingDoor_Frame4 },
    { x: 7, y: 78, metatileId: METATILE_PetalburgGym_SlidingDoor_Frame4 },
    { x: 6, y: 46, metatileId: METATILE_PetalburgGym_RoomEntrance_Left },
    { x: 7, y: 46, metatileId: METATILE_PetalburgGym_RoomEntrance_Right },
    { x: 1, y: 59, metatileId: METATILE_PetalburgGym_RoomEntrance_Left },
    { x: 2, y: 59, metatileId: METATILE_PetalburgGym_RoomEntrance_Right },
  ],
  3: [
    { x: 1, y: 91, metatileId: METATILE_PetalburgGym_SlidingDoor_Frame4 },
    { x: 7, y: 91, metatileId: METATILE_PetalburgGym_SlidingDoor_Frame4 },
    { x: 6, y: 59, metatileId: METATILE_PetalburgGym_RoomEntrance_Left },
    { x: 7, y: 59, metatileId: METATILE_PetalburgGym_RoomEntrance_Right },
    { x: 1, y: 72, metatileId: METATILE_PetalburgGym_RoomEntrance_Left },
    { x: 2, y: 72, metatileId: METATILE_PetalburgGym_RoomEntrance_Right },
  ],
  4: [
    { x: 7, y: 39, metatileId: METATILE_PetalburgGym_SlidingDoor_Frame4 },
    { x: 1, y: 20, metatileId: METATILE_PetalburgGym_RoomEntrance_Left },
    { x: 2, y: 20, metatileId: METATILE_PetalburgGym_RoomEntrance_Right },
  ],
  5: [
    { x: 1, y: 52, metatileId: METATILE_PetalburgGym_SlidingDoor_Frame4 },
    { x: 7, y: 52, metatileId: METATILE_PetalburgGym_SlidingDoor_Frame4 },
    { x: 6, y: 20, metatileId: METATILE_PetalburgGym_RoomEntrance_Left },
    { x: 7, y: 20, metatileId: METATILE_PetalburgGym_RoomEntrance_Right },
    { x: 1, y: 33, metatileId: METATILE_PetalburgGym_RoomEntrance_Left },
    { x: 2, y: 33, metatileId: METATILE_PetalburgGym_RoomEntrance_Right },
  ],
  6: [
    { x: 1, y: 65, metatileId: METATILE_PetalburgGym_SlidingDoor_Frame4 },
    { x: 6, y: 33, metatileId: METATILE_PetalburgGym_RoomEntrance_Left },
    { x: 7, y: 33, metatileId: METATILE_PetalburgGym_RoomEntrance_Right },
  ],
  7: [
    { x: 7, y: 13, metatileId: METATILE_PetalburgGym_SlidingDoor_Frame4 },
    { x: 1, y: 7, metatileId: METATILE_PetalburgGym_RoomEntrance_Left },
    { x: 2, y: 7, metatileId: METATILE_PetalburgGym_RoomEntrance_Right },
  ],
  8: [
    { x: 1, y: 26, metatileId: METATILE_PetalburgGym_SlidingDoor_Frame4 },
    { x: 6, y: 7, metatileId: METATILE_PetalburgGym_RoomEntrance_Left },
    { x: 7, y: 7, metatileId: METATILE_PetalburgGym_RoomEntrance_Right },
  ],
};

export class PetalburgGymDoorTracker {
  private defeatedTrainers = new Set<string>();
  private normanDefeated = false;
  private gymUnlocked = true;

  setGymUnlocked(unlocked: boolean): void {
    this.gymUnlocked = unlocked;
  }

  isGymUnlocked(): boolean {
    return this.gymUnlocked;
  }

  isTrainerDefeated(id: string): boolean {
    return this.defeatedTrainers.has(id);
  }

  isNormanDefeated(): boolean {
    return this.normanDefeated;
  }

  getDefeatedCount(): number {
    return this.defeatedTrainers.size + (this.normanDefeated ? 1 : 0);
  }

  defeatTrainer(id: string): {
    changed: boolean;
    trainer?: PetalburgGymTrainerInfo;
    isNorman?: boolean;
    tileUpdates?: MetatileTileUpdate[];
    sound?: number;
    unlockedAll?: boolean;
  } {
    if (id === PETALBURG_GYM_LEADER.id) {
      if (this.normanDefeated) return { changed: false };
      this.normanDefeated = true;
      const tileUpdates: MetatileTileUpdate[] = [];
      for (let r = 1; r <= 8; r++) {
        tileUpdates.push(...(PETALBURG_ROOM_DOOR_TILES[r] ?? []));
      }
      return {
        changed: true,
        isNorman: true,
        tileUpdates,
        sound: EmeraldConstants.SE_UNLOCK,
        unlockedAll: true,
      };
    }

    if (this.defeatedTrainers.has(id)) return { changed: false };

    const trainer = PETALBURG_GYM_TRAINERS.find(t => t.id === id);
    if (!trainer) return { changed: false };

    this.defeatedTrainers.add(id);
    const tileUpdates = PETALBURG_ROOM_DOOR_TILES[trainer.roomNumber] ?? [];
    return {
      changed: true,
      trainer,
      isNorman: false,
      tileUpdates,
      sound: EmeraldConstants.SE_UNLOCK,
      unlockedAll: false,
    };
  }

  isDoorUnlocked(door: PetalburgDoorWarp): boolean {
    if (this.normanDefeated) return true;
    if (!door.requiredTrainer) return this.gymUnlocked;
    return this.defeatedTrainers.has(door.requiredTrainer);
  }

  checkDoorMovement(
    playerX: number,
    playerY: number,
    targetX: number,
    targetY: number,
  ): {
    isDoor: boolean;
    canEnter: boolean;
    locked: boolean;
    door?: PetalburgDoorWarp;
    destX?: number;
    destY?: number;
    sound?: number;
  } {
    const door = PETALBURG_NORTH_DOORS.find(
      d => (d.sourceX === targetX || d.sourceX === playerX) && d.sourceY === targetY,
    );
    if (!door) return { isDoor: false, canEnter: false, locked: false };

    const unlocked = this.isDoorUnlocked(door);
    if (!unlocked) {
      return {
        isDoor: true,
        canEnter: false,
        locked: true,
        door,
        sound: EmeraldConstants.SE_WALL_HIT,
      };
    }

    return {
      isDoor: true,
      canEnter: true,
      locked: false,
      door,
      destX: door.destX,
      destY: door.destY,
      sound: EmeraldConstants.SE_UNLOCK,
    };
  }

  checkSouthExit(
    playerX: number,
    playerY: number,
  ): {
    isExit: boolean;
    destX?: number;
    destY?: number;
    sound?: number;
  } {
    const key = `${playerX},${playerY}`;
    const exit = PETALBURG_SOUTH_EXITS[key];
    if (exit) {
      return {
        isExit: true,
        destX: exit.destX,
        destY: exit.destY,
        sound: EmeraldConstants.SE_DOOR,
      };
    }
    return { isExit: false };
  }

  checkTrainerProximity(
    playerX: number,
    playerY: number,
  ): {
    found: boolean;
    trainer?: PetalburgGymTrainerInfo;
    isNorman?: boolean;
  } {
    if (!this.normanDefeated) {
      const normanDist = Math.max(Math.abs(PETALBURG_GYM_LEADER.x - playerX), Math.abs(PETALBURG_GYM_LEADER.y - playerY));
      if (normanDist <= 1) {
        return { found: true, isNorman: true };
      }
    }

    for (const trainer of PETALBURG_GYM_TRAINERS) {
      if (this.defeatedTrainers.has(trainer.id)) continue;
      const dist = Math.max(Math.abs(trainer.x - playerX), Math.abs(trainer.y - playerY));
      if (dist <= 1) {
        return { found: true, trainer, isNorman: false };
      }
    }

    return { found: false };
  }

  getAllUnlockedDoorMetatiles(): MetatileTileUpdate[] {
    const updates: MetatileTileUpdate[] = [];
    if (this.normanDefeated) {
      for (let r = 1; r <= 8; r++) {
        updates.push(...(PETALBURG_ROOM_DOOR_TILES[r] ?? []));
      }
      return updates;
    }

    if (this.gymUnlocked) {
      updates.push(...(PETALBURG_ROOM_DOOR_TILES[1] ?? []));
    }
    for (const trainer of PETALBURG_GYM_TRAINERS) {
      if (this.defeatedTrainers.has(trainer.id)) {
        updates.push(...(PETALBURG_ROOM_DOOR_TILES[trainer.roomNumber] ?? []));
      }
    }
    return updates;
  }

  reset(): void {
    this.defeatedTrainers.clear();
    this.normanDefeated = false;
  }
}
