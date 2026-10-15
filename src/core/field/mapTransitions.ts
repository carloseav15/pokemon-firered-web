import * as MB from "@game/generated/metatileBehavior";
import * as C from "@game/generated/constants";

// MapTransitionIsEnter / MapTransitionIsExit (fldeff_flash.c): mirror the
// explicit sTransitionTypes rows instead of treating unknown map types as valid.
const FLASH_TRANSITION_SURFACE_TYPES = new Set([
  C.MAP_TYPE_TOWN, C.MAP_TYPE_CITY, C.MAP_TYPE_ROUTE, C.MAP_TYPE_UNDERWATER,
  C.MAP_TYPE_OCEAN_ROUTE, C.MAP_TYPE_UNKNOWN, C.MAP_TYPE_INDOOR, C.MAP_TYPE_SECRET_BASE,
]);

export function MapTransitionIsEnter(fromType: number, toType: number): boolean {
  return toType === C.MAP_TYPE_UNDERGROUND && FLASH_TRANSITION_SURFACE_TYPES.has(fromType);
}

export function MapTransitionIsExit(fromType: number, toType: number): boolean {
  return fromType === C.MAP_TYPE_UNDERGROUND && FLASH_TRANSITION_SURFACE_TYPES.has(toType);
}

/** GetStairsMovementDirection (field_fadetransition.c); C narrows behavior to u8. */
export function GetStairsMovementDirection(metatileBehavior: number): [number, number] {
  const behavior = metatileBehavior & 0xff;
  if (MB.MetatileBehavior_IsDirectionalUpRightStairWarp(behavior)) return [16, -10];
  if (MB.MetatileBehavior_IsDirectionalUpLeftStairWarp(behavior)) return [-17, -10];
  if (MB.MetatileBehavior_IsDirectionalDownRightStairWarp(behavior)) return [17, 3];
  if (MB.MetatileBehavior_IsDirectionalDownLeftStairWarp(behavior)) return [-17, 3];
  return [0, 0];
}

