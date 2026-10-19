import { clearViewerObjects } from "./objectState";
import { clearTempFieldEventData, flagClear, save } from "@game/save";
import * as C from "@game/generated/constants";
import { TrySetMapSaveWarpStatus } from "@core/pokemon/saveLocation";
import { RestartWildEncounterImmunitySteps } from "@core/field/wildEncounter";
import { isMapTypeOutdoors } from "@core/field/overworld";
import { rom } from "@core/rom";
import { TryRegenerateRenewableHiddenItems } from "@game/renewableHiddenItems";
import { onCameraTransitionForRoamer, onWarpForRoamer } from "@core/pokemon/roamer";

// The live SaveBlock's TEMP_FLAGS/TEMP_VARS describe one loaded map, not every
// neighbouring map drawn by the viewer. Restore/continue keeps that saved state.
let currentMap: string | null = null;
export function viewerEventMap(): string | null { return currentMap; }
export function restoreViewerEventMap(mapId: string | null): void { currentMap = mapId; }

/** overworld.c:753-762 / 787-797 reload templates and clear temporary field data.
 * A warp reloads even when its destination is the same map; a camera transition
 * reloads only when crossing the map boundary. Menus/interactions do neither.
 */
export function enterViewerEventMap(mapId: string, warp = false): boolean {
  if (currentMap === mapId && !warp) return false;
  // LoadMapFromWarp / LoadMapFromCameraTransition bookkeeping for the map entered,
  // in source order; the save's current map is the new one. Trainer rematches
  // (VS Seeker), weather, ambient cries and music are not handled here.
  const num = rom.mapNum(mapId);
  save.location = { ...save.location, mapGroup: num >>> 8, mapNum: num & 0xff };
  TrySetMapSaveWarpStatus();
  if (currentMap !== null) clearTempFieldEventData();
  RestartWildEncounterImmunitySteps();
  const mapType = rom.cachedMap(mapId)?.mapType;
  if (warp && mapType !== undefined && isMapTypeOutdoors(mapType)) flagClear(C.FLAG_SYS_FLASH_ACTIVE);
  save.objectEventTemplates = [];
  clearViewerObjects();
  currentMap = mapId;
  TryRegenerateRenewableHiddenItems();
  if (warp) onWarpForRoamer(); else onCameraTransitionForRoamer();
  return true;
}
