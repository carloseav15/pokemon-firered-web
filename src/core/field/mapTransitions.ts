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

