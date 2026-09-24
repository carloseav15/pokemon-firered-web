import { isSurfableBehavior, isTallGrassBehavior, isWaterBehavior, MetatileBehavior } from "./MetatileBehavior";
import { MapRuntime } from "./MapRuntime";
import type { GridPoint, WorldState } from "./types";

export type TerrainEffect = "none" | "tall-grass" | "sand" | "water-ripple" | "waterfall" | "ice" | "puddle" | "reflection";

export class TerrainSystem {
  constructor(private readonly map: MapRuntime) {}

  effectAt(point: GridPoint): TerrainEffect {
    const behavior = this.map.behaviorAt(point);
    if (isTallGrassBehavior(behavior)) return "tall-grass";
    if (behavior === MetatileBehavior.SAND) return "sand";
    if (behavior === MetatileBehavior.WATERFALL) return "waterfall";
    if (behavior === MetatileBehavior.PUDDLE) return "puddle";
    if (behavior === MetatileBehavior.ICE) return "ice";
    if (isWaterBehavior(behavior) && isSurfableBehavior(behavior)) return "water-ripple";
    return "none";
  }

  canSurf(point: GridPoint, state: WorldState): boolean {
    return state.player.surfing && isSurfableBehavior(this.map.behaviorAt(point));
  }

  isReflective(point: GridPoint): boolean {
    const behavior = this.map.behaviorAt(point);
    return behavior === MetatileBehavior.POND_WATER || behavior === MetatileBehavior.PUDDLE || behavior === MetatileBehavior.ICE || behavior === MetatileBehavior.UNUSED_WATER || behavior === MetatileBehavior.CYCLING_ROAD_WATER;
  }
}
