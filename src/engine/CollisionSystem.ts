import type { Direction, GridPoint, MapData, RuntimeObject, WorldState } from "./types";
import { MapRuntime } from "./MapRuntime";
import { isDirectionalBlocked, isSurfableBehavior, isWaterBehavior } from "./MetatileBehavior";

export const WATER_BEHAVIORS = new Set([0x10, 0x11, 0x12, 0x13, 0x15, 0x1a, 0x1b]);

export class CollisionSystem {
  constructor(private readonly map: MapRuntime) {}

  nextPosition(position: GridPoint, direction: Direction): GridPoint {
    const delta = { north: { x: 0, y: -1 }, south: { x: 0, y: 1 }, west: { x: -1, y: 0 }, east: { x: 1, y: 0 } }[direction];
    return { x: position.x + delta.x, y: position.y + delta.y };
  }

  isWater(point: GridPoint): boolean {
    return isWaterBehavior(this.map.behaviorAt(point));
  }

  isPassable(point: GridPoint, state: WorldState, ignoreObjectId?: string, direction?: Direction): boolean {
    if (!this.map.inBounds(point)) return false;
    const behavior = this.map.behaviorAt(point);
    if (this.map.warpAt(point)) return true;
    if (this.map.collisionAt(point) !== 0) return false;
    if (direction && isDirectionalBlocked(behavior, direction)) return false;
    if (this.isWater(point) && (!state.player.surfing || !isSurfableBehavior(behavior))) return false;
    const fromElevation = this.map.elevationAt(state.player.position);
    const targetElevation = this.map.elevationAt(point);
    if (fromElevation !== 0 && targetElevation !== 0 && fromElevation !== targetElevation) return false;
    const occupied = this.map.objectAt(point, state.objects, ignoreObjectId);
    if (occupied) return false;
    return true;
  }

  canStep(point: GridPoint, state: WorldState, direction?: Direction): boolean {
    return this.isPassable(point, state, undefined, direction);
  }

  isBlocked(point: GridPoint, state: WorldState): boolean {
    return !this.isPassable(point, state);
  }

  debugCells(data: MapData): Array<{ x: number; y: number; water: boolean }> {
    const cells: Array<{ x: number; y: number; water: boolean }> = [];
    for (let y = 0; y < data.height; y += 1) {
      for (let x = 0; x < data.width; x += 1) {
        const point = { x, y };
        if (data.collision[y]?.[x] !== 0 || isWaterBehavior(data.behavior[y]?.[x] ?? 0)) cells.push({ x, y, water: isWaterBehavior(data.behavior[y]?.[x] ?? 0) });
      }
    }
    return cells;
  }
}
