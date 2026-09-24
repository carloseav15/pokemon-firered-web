import type { EngineListener, GridPoint, MapConnection, WarpEvent } from "./types";

export class TransitionSystem {
  private busy = false;

  constructor(private readonly emit: EngineListener) {}

  get isBusy(): boolean {
    return this.busy;
  }

  beginMapChange(mapId: string): boolean {
    if (this.busy) return false;
    this.busy = true;
    this.emit({ type: "transition-start", mapId });
    return true;
  }

  finishMapChange(mapId: string): void {
    if (!this.busy) return;
    this.busy = false;
    this.emit({ type: "transition-end", mapId });
  }

  warpDestination(warp: WarpEvent, destinationWarps: WarpEvent[]): GridPoint | undefined {
    const target = destinationWarps[Number(warp.dest_warp_id ?? 0)];
    return target ? { x: target.x, y: target.y } : undefined;
  }

  connectionDestination(connection: MapConnection, current: GridPoint, width: number, height: number): GridPoint {
    const offset = connection.offset ?? 0;
    if (connection.direction === "north") return { x: current.x + offset, y: height - 1 };
    if (connection.direction === "south") return { x: current.x + offset, y: 0 };
    if (connection.direction === "west") return { x: width - 1, y: current.y + offset };
    return { x: 0, y: current.y + offset };
  }
}
