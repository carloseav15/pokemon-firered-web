import { save, type SaveData } from '@game/save';
import * as C from '@game/generated/constants';
import { MAP_OFFSET } from '@core/field/fieldmap';
import type { ObjectEvent } from '@core/field/objectEvents';
import type { Direction } from './render/sprites';

export type ViewerObjectState = {
  mapId: string; localId: number; x: number; y: number;
  direction: Direction; invisible: boolean; removed: boolean;
};
export const objectStateKey = (state: Pick<ViewerObjectState,'mapId'|'localId'>): string => `${state.mapId}:${state.localId}`;
export function readViewerObjectState(object: ObjectEvent, mapId: string, removed = false): ViewerObjectState {
  return {mapId,localId:object.localId,x:object.currentCoords.x-MAP_OFFSET,y:object.currentCoords.y-MAP_OFFSET,
    direction:({[C.DIR_SOUTH]:'south',[C.DIR_NORTH]:'north',[C.DIR_WEST]:'west',[C.DIR_EAST]:'east'} as const)[object.facingDirection] ?? 'south',
    invisible:object.invisible,removed};
}
export const objectDirection = (direction: Direction): number => ({south:C.DIR_SOUTH,north:C.DIR_NORTH,west:C.DIR_WEST,east:C.DIR_EAST})[direction];

// Viewer projection only: the engine retains its full load_save.c slot snapshot.
// Keep this map-scoped copy in the same SaveBlock so both SAVE entry points
// serialize the last observed poses, including explicitly removed instances.
type ViewerObjectSave = SaveData & { viewerObjects?: { version: 1; mapId: string; states: ViewerObjectState[] } };
export function storeViewerObjects(mapId: string, states: ViewerObjectState[]): void {
  (save as ViewerObjectSave).viewerObjects = {version:1,mapId,states:structuredClone(states)};
}
export function clearViewerObjects(): void { delete (save as ViewerObjectSave).viewerObjects; }
export function savedViewerObjects(mapId: string): ViewerObjectState[] {
  const snapshot=(save as ViewerObjectSave).viewerObjects;
  if(snapshot?.version!==1||snapshot.mapId!==mapId||!Array.isArray(snapshot.states))return [];
  // Older saves have no projection. Reject malformed snapshots as a whole.
  if(!snapshot.states.every(s=>s&&s.mapId===mapId&&Number.isInteger(s.localId)&&s.localId>0&&s.localId<256
    &&Number.isInteger(s.x)&&s.x>=-32768&&s.x<=32767&&Number.isInteger(s.y)&&s.y>=-32768&&s.y<=32767
    &&['north','south','east','west'].includes(s.direction)&&typeof s.invisible==='boolean'&&typeof s.removed==='boolean')
    ||new Set(snapshot.states.map(objectStateKey)).size!==snapshot.states.length)return [];
  return structuredClone(snapshot.states);
}
