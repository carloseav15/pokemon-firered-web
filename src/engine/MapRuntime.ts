import type { Direction, GridPoint, MapData, RuntimeObject, WorldState } from "./types";

export class MapRuntime {
  constructor(public readonly data: MapData) {}

  inBounds(point: GridPoint): boolean {
    return point.x >= 0 && point.y >= 0 && point.x < this.data.width && point.y < this.data.height;
  }

  collisionAt(point: GridPoint): number {
    return this.data.collision[point.y]?.[point.x] ?? 3;
  }

  behaviorAt(point: GridPoint): number {
    return this.data.behavior[point.y]?.[point.x] ?? 0;
  }

  elevationAt(point: GridPoint): number {
    return this.data.elevation?.[point.y]?.[point.x] ?? 0;
  }

  warpAt(point: GridPoint) {
    return this.data.warpEvents.find((warp) => warp.x === point.x && warp.y === point.y);
  }

  objectAt(point: GridPoint, objects: RuntimeObject[], ignoreId?: string): RuntimeObject | undefined {
    return objects.find((object) => object.active && object.solid && object.id !== ignoreId && object.x === point.x && object.y === point.y);
  }

  backgroundEventAt(point: GridPoint) {
    return this.data.backgroundEvents.find((event) => event.x === point.x && event.y === point.y);
  }

  connectionAtEdge(point: GridPoint, direction: Direction) {
    const edge = direction === "north" || direction === "south"
      ? (direction === "north" ? point.y === 0 : point.y === this.data.height - 1)
      : (direction === "west" ? point.x === 0 : point.x === this.data.width - 1);
    if (!edge) return undefined;
    const sourceDirection = { north: "up", south: "down", west: "left", east: "right" }[direction];
    return this.data.connections?.find((connection) => connection.direction === sourceDirection || connection.direction === direction);
  }

  createWorldState(mapId: string, spawn: GridPoint): WorldState {
    return {
      mapId,
      player: { position: { ...spawn }, facing: "south", moving: false, surfing: false },
      objects: this.data.objectEvents.map((event, index) => ({
        ...event,
        id: `${mapId}:object:${event.local_id ?? index}`,
        solid: true,
        // Event flags hide objects only when set. The new-game script sets
        // initial hide flags; the presence of a flag in map.json does not.
        active: true,
      })),
      flags: {},
      variables: {},
    };
  }
}
