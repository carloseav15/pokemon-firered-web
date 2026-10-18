import * as MB from "../games/firered/generated/metatileBehavior";
import type { WorldGrid } from "./data/worldGrid";
import type { Direction } from "./render/sprites";
import type { PlayerVehicle } from "./state";

const DELTAS: Record<Direction, readonly [number, number, number]> = {
  south: [0, 1, 1], north: [0, -1, 2], west: [-1, 0, 3], east: [1, 0, 4],
};
export type StepPlan = { x: number; y: number; jump: boolean; vehicle: PlayerVehicle; status: "ready" | "blocked" | "loading" };

/** Viewer navigation decision. CheckForPlayerAvatarCollision / ShouldJumpLedge inspect
 * the adjacent destination (field_player_avatar.c), not the tile under the player.
 * Surf embark via HM Surf and party actions replaces the viewer's provisional automatic
 * adaptation; allowAutoSurf permits sandbox/URL exploration without HM requirements.
 */
export function planStep(grid: WorldGrid, x: number, y: number, direction: Direction, vehicle: PlayerVehicle, currentElevation = grid.elevationAt(x, y), allowAutoSurf = false): StepPlan {
  const [dx, dy, ledgeDirection] = DELTAS[direction];
  const frontX = x + dx, frontY = y + dy;
  if (!grid.isLoaded(frontX, frontY)) return { x: frontX, y: frontY, jump: false, vehicle, status: "loading" };
  const jump = grid.ledgeDirection(frontX, frontY) === ledgeDirection;
  const targetX = x + dx * (jump ? 2 : 1), targetY = y + dy * (jump ? 2 : 1);
  const result: StepPlan = { x: targetX, y: targetY, jump, vehicle, status: "blocked" };
  if (!grid.isLoaded(targetX, targetY)) return { ...result, status: "loading" };
  // A ledge cannot be entered from another direction, even if a source collision bit is clear.
  if (!jump && grid.ledgeDirection(frontX, frontY)) return result;
  const water = grid.isWaterTile(targetX, targetY);
  if (vehicle !== "surf" && water && !allowAutoSurf) return result;
  const nextVehicle = water ? "surf" : vehicle === "surf" ? "walk" : vehicle;
  if (jump && water) return result;
  // IsMetatileDirectionallyImpassable checks the exit side of the old tile and
  // the entry side of the destination, using the original FR behavior predicates.
  const blockedExit = {south:MB.MetatileBehavior_IsSouthBlocked,north:MB.MetatileBehavior_IsNorthBlocked,
    west:MB.MetatileBehavior_IsWestBlocked,east:MB.MetatileBehavior_IsEastBlocked}[direction];
  const blockedEntry = {south:MB.MetatileBehavior_IsNorthBlocked,north:MB.MetatileBehavior_IsSouthBlocked,
    west:MB.MetatileBehavior_IsEastBlocked,east:MB.MetatileBehavior_IsWestBlocked}[direction];
  if (!jump && (blockedExit(grid.behaviorAt(x,y)) || blockedEntry(grid.behaviorAt(targetX,targetY)))) return result;
  const elevation = grid.elevationAt(targetX,targetY);
  const mismatch = currentElevation !== 0 && elevation !== 0 && elevation !== 15 && elevation !== currentElevation;
  // Native CanStopSurfing permits a return to elevation3; boarding uses source HM Surf
  // action sequence or explicit sandbox allowAutoSurf.
  if (!jump && mismatch && !(water && vehicle !== "surf") && !(vehicle === "surf" && !water && elevation === 3)) return result;
  // Check NPCs and terrain before committing a vehicle change or accepting a landing.
  if (!grid.isWalkable(targetX, targetY, nextVehicle)) return result;
  return { ...result, vehicle: nextVehicle, status: "ready" };
}
