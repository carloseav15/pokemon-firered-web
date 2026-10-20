import * as MBEmerald from "../games/emerald/generated/metatileBehavior";
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
