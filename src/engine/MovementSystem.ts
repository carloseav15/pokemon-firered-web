import type { Direction, EngineListener, GridPoint } from "./types";
import { CollisionSystem } from "./CollisionSystem";
import { MapRuntime } from "./MapRuntime";
import { TerrainSystem } from "./TerrainSystem";
import { forcedDirection, MetatileBehavior } from "./MetatileBehavior";
import type { WorldState } from "./types";

export class MovementSystem {
  private readonly terrain: TerrainSystem;

  constructor(private readonly map: MapRuntime, private readonly collision: CollisionSystem, private readonly emit: EngineListener) {
    this.terrain = new TerrainSystem(map);
  }

  movePlayer(state: WorldState, direction: Direction): boolean {
    state.player.facing = direction;
    const from = { ...state.player.position };
    const to = this.collision.nextPosition(from, direction);
    if (!this.collision.canStep(to, state, direction)) {
      this.emit({ type: "blocked", position: to, direction });
      return false;
    }
    state.player.position = to;
    this.emit({ type: "step", from, to, direction });
    const terrain = this.terrain.effectAt(to);
    if (terrain !== "none") this.emit({ type: "terrain", position: to, effect: terrain });
    const warp = this.map.warpAt(to);
    if (warp) this.emit({ type: "warp", warp });
    return true;
  }

  moveObject(state: WorldState, objectId: string, direction: Direction): boolean {
    const object = state.objects.find((candidate) => candidate.id === objectId);
    if (!object || !object.active) return false;
    const to = this.collision.nextPosition(object, direction);
    if (!this.collision.isPassable(to, state, objectId, direction) || (to.x === state.player.position.x && to.y === state.player.position.y)) return false;
    object.x = to.x;
    object.y = to.y;
    return true;
  }

  directionFor(from: GridPoint, to: GridPoint): Direction {
    if (to.y < from.y) return "north";
    if (to.y > from.y) return "south";
    return to.x < from.x ? "west" : "east";
  }

  forcedDirectionAt(point: GridPoint, fallback?: Direction): Direction | undefined {
    const behavior = this.map.behaviorAt(point);
    return forcedDirection(behavior) ?? (behavior === MetatileBehavior.ICE ? fallback : undefined);
  }
}
