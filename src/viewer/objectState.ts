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
