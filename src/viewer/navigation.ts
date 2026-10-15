import type { MapHeader, MapWarp } from "@core/rom";
import * as MB from "../games/firered/generated/metatileBehavior";
import type { Direction } from "./render/sprites";

// field_control_avatar.c: local event coordinates and elevation, independently of atlas placement.
export function warpAt(header: MapHeader, x: number, y: number, elevation: number): number {
  return header.warps.findIndex(w => w.x === x && w.y === y && (w.elevation === 0 || w.elevation === elevation));
}

export function stepWarpBehavior(behavior: number): boolean {
  return MB.MetatileBehavior_IsWarpDoor(behavior) || MB.MetatileBehavior_IsLadder(behavior)
    || MB.MetatileBehavior_IsEscalator(behavior) || MB.MetatileBehavior_IsNonAnimDoor(behavior)
    || MB.MetatileBehavior_IsLavaridgeB1FWarp(behavior) || MB.MetatileBehavior_IsLavaridge1FWarp(behavior)
    || MB.MetatileBehavior_IsWarpPad(behavior) || MB.MetatileBehavior_IsFallWarp(behavior)
    || MB.MetatileBehavior_IsUnionRoomWarp(behavior);
}

export function inputWarpBehavior(behavior: number, direction: Direction): boolean {
  switch (direction) {
    case "north": return MB.MetatileBehavior_IsNorthArrowWarp(behavior);
    case "south": return MB.MetatileBehavior_IsSouthArrowWarp(behavior);
    case "west": return MB.MetatileBehavior_IsWestArrowWarp(behavior)
      || MB.MetatileBehavior_IsDirectionalUpLeftStairWarp(behavior) || MB.MetatileBehavior_IsDirectionalDownLeftStairWarp(behavior);
    case "east": return MB.MetatileBehavior_IsEastArrowWarp(behavior)
      || MB.MetatileBehavior_IsDirectionalUpRightStairWarp(behavior) || MB.MetatileBehavior_IsDirectionalDownRightStairWarp(behavior);
  }
}

export type WarpAddress = { mapId: string; warpId: number; x?: number; y?: number };

/** overworld.c GetAdjustedInitialDirection after StoreInitialPlayerAvatarState (no scripted direction override). */
export function warpArrivalDirection(behavior: number, previous: Direction): Direction {
  if (MB.MetatileBehavior_IsDeepSouthWarp(behavior) || MB.MetatileBehavior_IsSouthArrowWarp(behavior)) return "north";
  if (MB.MetatileBehavior_IsNonAnimDoor(behavior) || MB.MetatileBehavior_IsWarpDoor_2(behavior)
    || MB.MetatileBehavior_IsNorthArrowWarp(behavior)) return "south";
  if (MB.MetatileBehavior_IsWestArrowWarp(behavior)
    || MB.MetatileBehavior_IsDirectionalUpLeftStairWarp(behavior) || MB.MetatileBehavior_IsDirectionalDownLeftStairWarp(behavior)) return "east";
  if (MB.MetatileBehavior_IsEastArrowWarp(behavior)
    || MB.MetatileBehavior_IsDirectionalUpRightStairWarp(behavior) || MB.MetatileBehavior_IsDirectionalDownRightStairWarp(behavior)) return "west";
  return MB.MetatileBehavior_IsLadder(behavior) ? previous : "south";
}
export type ResolvedWarp = WarpAddress & { header: MapHeader; arrival: MapWarp; dynamicReturn: WarpAddress | null };

/** overworld.c has one dynamicWarp slot (its slot argument is unused). Only commit it after a successful transition. */
export class NavigationWarps {
  private dynamic: WarpAddress | null = null;
  constructor(private readonly load: (id: string) => Promise<MapHeader>) {}
  async resolve(source: MapHeader, warpId: number): Promise<ResolvedWarp> {
    const warp = source.warps[warpId];
    if (!warp) throw new Error(`Warp inexistente: ${source.id}:${warpId}`);
    const address = warp.destMap === "MAP_DYNAMIC" ? this.dynamic : { mapId: warp.destMap, warpId: warp.destWarpId };
    if (!address) throw new Error(`Salida dinámica sin entrada previa: ${source.id}:${warpId}`);
    return this.resolveAddress(address, { mapId: source.id, warpId, x: warp.x, y: warp.y });
  }
  /** overworld.c SetPlayerCoordsFromWarp: signed warpId first, explicit coords second. */
  async resolveAddress(address: WarpAddress, source?: WarpAddress): Promise<ResolvedWarp> {
    const header = await this.load(address.mapId);
    let arrival = address.warpId >= 0 ? header.warps[address.warpId] : undefined;
    if (!arrival && Number.isSafeInteger(address.x) && Number.isSafeInteger(address.y) && address.x! >= 0 && address.y! >= 0) {
      arrival = { x: address.x!, y: address.y!, elevation: 0, destMap: "", destWarpId: -1 };
    }
    if (!arrival) throw new Error(`Destino inexistente: ${address.mapId}:${address.warpId}`);
    return { ...address, header, arrival,
      dynamicReturn: arrival.destMap === "MAP_DYNAMIC" && source ? { ...source } : null };
  }
  commit(destination: ResolvedWarp): void {
    if (destination.dynamicReturn) this.dynamic = destination.dynamicReturn;
  }
  get returnAddress(): WarpAddress | null { return this.dynamic && { ...this.dynamic }; }
  restore(address: WarpAddress | null): void { this.dynamic = address && { ...address }; }
}
