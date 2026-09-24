import type { Direction, EngineListener } from "./types";
import type { MovementSystem } from "./MovementSystem";
import type { WorldState } from "./types";

export class ObjectEventSystem {
  private elapsed = 0;
  private readonly origins = new Map<string, { x: number; y: number }>();

  constructor(private readonly movement: MovementSystem, private readonly emit: EngineListener) {}

  update(state: WorldState, deltaMs: number): void {
    this.elapsed += deltaMs;
    if (this.elapsed < 1800) return;
    this.elapsed = 0;
    for (const object of state.objects) {
      if (!object.active || !object.movement_type?.includes("WANDER")) continue;
      if (!this.origins.has(object.id)) this.origins.set(object.id, { x: object.x, y: object.y });
      const anchor = this.origins.get(object.id)!;
      const origin = { x: object.x, y: object.y };
      const minX = anchor.x - (object.movement_range_x ?? 1);
      const maxX = anchor.x + (object.movement_range_x ?? 1);
      const minY = anchor.y - (object.movement_range_y ?? 1);
      const maxY = anchor.y + (object.movement_range_y ?? 1);
      const directions: Direction[] = ["north", "south", "west", "east"];
      for (let index = directions.length - 1; index > 0; index--) {
        const swap = Math.floor(Math.random() * (index + 1));
        [directions[index], directions[swap]] = [directions[swap], directions[index]];
      }
      const moved = directions.some((direction) => {
        const delta = { north: { x: 0, y: -1 }, south: { x: 0, y: 1 }, west: { x: -1, y: 0 }, east: { x: 1, y: 0 } }[direction];
        const candidate = { x: object.x + delta.x, y: object.y + delta.y };
        return candidate.x >= minX && candidate.x <= maxX && candidate.y >= minY && candidate.y <= maxY && this.movement.moveObject(state, object.id, direction);
      });
      if (moved) this.emit({ type: "step", from: origin, to: { x: object.x, y: object.y }, direction: "south" });
    }
  }

  interactionAt(state: WorldState, point: { x: number; y: number }) {
    return state.objects.find((object) => object.active && object.x === point.x && object.y === point.y);
  }
}
