import { clearViewerObjects } from "./objectState";
import { clearTempFieldEventData, save } from "@game/save";

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
  if (currentMap !== null) clearTempFieldEventData();
  save.objectEventTemplates = [];
  clearViewerObjects();
  currentMap = mapId;
  return true;
}
