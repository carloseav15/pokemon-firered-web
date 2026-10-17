// Shared source predicates from event_object_movement.c:1389-1470.
import * as C from '@game/generated/constants';
import { flagSet } from '@game/save';
import { MAP_OFFSET, MAP_OFFSET_W, MAP_OFFSET_H } from './fieldmap';
import type { MapObjectTemplate } from '../rom';
export type ObjectSpawnHooks = {
  playerMapPosition(): {x:number;y:number};
  mapType(): number;
  map(): {xSize:number;ySize:number};
};
/** ShouldInitObjectEventStateFromTemplate (event_object_movement.c). */
export function ShouldInitObjectEventStateFromTemplate(hooks: ObjectSpawnHooks, template: MapObjectTemplate, isClone: boolean, x: number, y: number): boolean {
  if (isClone && !TemplateIsObstacleAndWithinView(hooks, template, x, y)) return false;
  return TemplateIsObstacleAndVisibleFromConnectingMap(hooks, template, x, y);
}

/** TemplateIsObstacleAndWithinView (event_object_movement.c). */
export function TemplateIsObstacleAndWithinView(hooks: ObjectSpawnHooks, template: MapObjectTemplate, x: number, y: number): boolean {
  if (template.graphicsId !== C.OBJ_EVENT_GFX_CUT_TREE && template.graphicsId !== C.OBJ_EVENT_GFX_ROCK_SMASH_ROCK) return true;
  const player = hooks.playerMapPosition();
  x = (x << 16) >> 16;
  y = (y << 16) >> 16;
  if (player.x < x) {
    if (player.x + (MAP_OFFSET + 1) < x) return true;
    if (player.y - (MAP_OFFSET - 1) <= y && player.y + (MAP_OFFSET - 1) >= y) return false;
  } else {
    if (player.x - (MAP_OFFSET + 1) > x) return true;
    if (player.y - (MAP_OFFSET - 1) <= y && player.y + (MAP_OFFSET - 1) >= y) return false;
  }
  return true;
}

/** TemplateIsObstacleAndVisibleFromConnectingMap (event_object_movement.c). */
export function TemplateIsObstacleAndVisibleFromConnectingMap(hooks: ObjectSpawnHooks, template: MapObjectTemplate, _x: number, _y: number): boolean {
  const type = hooks.mapType();
  if (type !== C.MAP_TYPE_ROUTE && type !== C.MAP_TYPE_TOWN && type !== C.MAP_TYPE_UNDERWATER && type !== C.MAP_TYPE_CITY && type !== C.MAP_TYPE_OCEAN_ROUTE) return true;
  if (template.graphicsId !== C.OBJ_EVENT_GFX_CUT_TREE && template.graphicsId !== C.OBJ_EVENT_GFX_ROCK_SMASH_ROCK) return true;
  const map = hooks.map();
  const width = map.xSize - MAP_OFFSET_W - 1;
  const height = map.ySize - MAP_OFFSET_H - 1;
  const player = hooks.playerMapPosition();
  if (player.x === 0 && template.x <= MAP_OFFSET + 1) { SetHideObstacleFlag(template); return false; }
  if (player.x === width && template.x >= width - (MAP_OFFSET + 1)) { SetHideObstacleFlag(template); return false; }
  if (player.y === 0 && template.y <= MAP_OFFSET - 1) { SetHideObstacleFlag(template); return false; }
  if (player.y === height && template.y >= height - (MAP_OFFSET - 1)) { SetHideObstacleFlag(template); return false; }
  return true;
}

/** SetHideObstacleFlag (event_object_movement.c). */
export function SetHideObstacleFlag(template: MapObjectTemplate): void {
  if (template.flag >= C.FLAG_TEMP_11 && template.flag <= C.FLAG_TEMP_1F) flagSet(template.flag);
}
