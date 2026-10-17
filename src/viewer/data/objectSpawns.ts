import * as C from '@game/generated/constants';
import { MAP_OFFSET, MAP_OFFSET_W, MAP_OFFSET_H } from '@core/field/fieldmap';
import { ShouldInitObjectEventStateFromTemplate } from '@core/field/objectSpawnRules';
import type { MapHeader, MapObjectTemplate } from '@core/rom';
import type { Element } from '../types';
import { isViewerObjectPresent } from './objectPresence';

const key=(map:string,id:number)=>`${map}:${id}`;
const obstacle=(graphics:number)=>graphics===C.OBJ_EVENT_GFX_CUT_TREE||graphics===C.OBJ_EVENT_GFX_ROCK_SMASH_ROCK;
/** Source spawning is latched: moving onto an edge must not remove an already
 * active object. Only leaving the spawn window or loading a map retries init.
 * Ordinary NPC scheduling, slot limits and their movement remain engine work.
 */
export class ViewerObjectSpawns {
  private active=new Set<string>();
  reset(): void { this.active.clear(); }
  adopt(element:Element): void {
    if(element.localId!==undefined&&(element.graphics==='OBJ_EVENT_GFX_CUT_TREE'||element.graphics==='OBJ_EVENT_GFX_ROCK_SMASH_ROCK'))this.active.add(key(element.map,element.localId));
  }
  update(header:MapHeader, player:{x:number;y:number}, width:number, height:number, headers:ReadonlyMap<string,MapHeader>): void {
    const relevant=new Set<string>();
    const hooks={playerMapPosition:()=>player,mapType:()=>header.mapType,
      map:()=>({xSize:width+MAP_OFFSET_W,ySize:height+MAP_OFFSET_H})};
    for(const entry of header.objects){
      const source=entry.clone?headers.get(entry.targetMap)?.objects[entry.targetLocalId-1]:entry;
      if(!source||source.clone||!obstacle(source.graphicsId))continue;
      const id=key(entry.clone?entry.targetMap:header.id,source.localId);
      relevant.add(id);
      if(!isViewerObjectPresent(cloneElement(entry.clone?entry.targetMap:header.id,source))){this.active.delete(id);continue;}
      // TrySpawnObjectEvents compares template coords + MAP_OFFSET with the
      // source player's local pos window; both bounds are inclusive.
      const x=entry.x+MAP_OFFSET,y=entry.y+MAP_OFFSET;
      const inView=x>=player.x-2&&x<=player.x+MAP_OFFSET_W+2&&y>=player.y&&y<=player.y+MAP_OFFSET_H+2;
      if(!inView){this.active.delete(id);continue;}
      if(!this.active.has(id)&&ShouldInitObjectEventStateFromTemplate(hooks,source,!!entry.clone,entry.x,entry.y))this.active.add(id);
    }
    for(const id of this.active)if(!relevant.has(id))this.active.delete(id);
  }
  isActive(element:Element): boolean { return element.localId!==undefined&&this.active.has(key(element.map,element.localId)); }
  present(element:Element): boolean {
    const graphics=element.graphics;
    if(graphics!=='OBJ_EVENT_GFX_CUT_TREE'&&graphics!=='OBJ_EVENT_GFX_ROCK_SMASH_ROCK')return true;
    return element.localId!==undefined&&this.active.has(key(element.map,element.localId));
  }
}

export function cloneElement(mapId:string, template:MapObjectTemplate):Element {
  return {map:mapId,localId:template.localId,x:template.x,y:template.y,flag:template.flag,graphics:template.graphicsName,
    movementType:template.movementType,layer:'npc',direction:template.movementType===C.MOVEMENT_TYPE_FACE_UP?'up':template.movementType===C.MOVEMENT_TYPE_FACE_LEFT?'left':template.movementType===C.MOVEMENT_TYPE_FACE_RIGHT?'right':'down'};
}
