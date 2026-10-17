import {GetStairsMovementDirection} from "../../src/core/field/mapTransitions";
// Source-data validation; does not claim browser transitions or story-script parity.
import { readFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import type { MapHeader } from '../../src/core/rom';
import { NavigationWarps, warpAt } from '../../src/viewer/navigation';
const load = async (id:string):Promise<MapHeader> => JSON.parse(await readFile(`public/fr/maps/${id}.json`,'utf8'));
const index = JSON.parse(await readFile('public/viewer/kanto.json','utf8'));
const pending = Object.keys(index.maps), seen = new Set<string>();
let staticWarps=0,dynamicReturns=0;
const router = new NavigationWarps(load);
for(let n=0;n<pending.length;n++){
  const id=pending[n]!;if(seen.has(id))continue;seen.add(id);
  const header=await load(id);
  for(let w=0;w<header.warps.length;w++){
    const source=header.warps[w]!;
    assert.equal(warpAt(header,source.x,source.y,source.elevation),w,`${id}:${w} event lookup`);
    if(source.destMap==='MAP_DYNAMIC')continue;
    const destination=await router.resolve(header,w);staticWarps++;
    assert.equal(destination.mapId,source.destMap);assert.equal(destination.warpId,source.destWarpId);
    assert.equal(destination.arrival.x,destination.header.warps[source.destWarpId]!.x);
    router.commit(destination);
    if(destination.arrival.destMap==='MAP_DYNAMIC'){
      const back=await router.resolve(destination.header,destination.warpId);
      assert.equal(back.mapId,id);assert.equal(back.warpId,w);dynamicReturns++;
    }
    if(!seen.has(source.destMap))pending.push(source.destMap);
  }
  for(const connection of header.connections)if(!seen.has(connection.map))pending.push(connection.map);
}
const C=await import('../../src/games/firered/generated/constants');
assert.deepEqual(GetStairsMovementDirection(C.MB_UP_RIGHT_STAIR_WARP),[16,-10]);
assert.deepEqual(GetStairsMovementDirection(C.MB_UP_LEFT_STAIR_WARP),[-17,-10]);
assert.deepEqual(GetStairsMovementDirection(C.MB_DOWN_RIGHT_STAIR_WARP),[17,3]);
assert.deepEqual(GetStairsMovementDirection(C.MB_DOWN_LEFT_STAIR_WARP),[-17,3]);
assert.deepEqual(GetStairsMovementDirection(C.MB_UP_RIGHT_STAIR_WARP+256),[16,-10]);
assert.deepEqual(GetStairsMovementDirection(C.MB_NORMAL),[0,0]);
const blank=new NavigationWarps(load);
await assert.rejects(()=>blank.resolve({warps:[{destMap:'MAP_DYNAMIC',destWarpId:127}]} as MapHeader,0),/sin entrada previa/);
console.log(JSON.stringify({maps:seen.size,staticWarps,dynamicReturns,status:'PASS',scope:'real exported addresses and dynamic slot; browser animation not covered'}));
// Source elevator destinations use signed warpId -1 and explicit coordinates.
const specs=JSON.parse(await readFile('public/viewer/elevators.json','utf8')).elevators;
let floorDestinations=0;
for(const definition of Object.values(specs) as Array<{choices:Array<{destination:{mapId:string;warpId:number;x:number;y:number}|null}>}>)for(const choice of definition.choices){
  if(!choice.destination)continue;
  const target=await router.resolveAddress(choice.destination);
  assert.equal(target.arrival.x,choice.destination.x);assert.equal(target.arrival.y,choice.destination.y);
  const layout=JSON.parse(await readFile(`public/fr/layouts/${target.header.layout}.json`,'utf8'));
  assert.ok(target.arrival.x<layout.width&&target.arrival.y<layout.height);
  const cabin=await load('MAP_CELADON_CITY_DEPARTMENT_STORE_ELEVATOR');
  router.restore(choice.destination);
  const back=await router.resolve(cabin,0);
  assert.equal(back.mapId,choice.destination.mapId);assert.equal(back.arrival.x,choice.destination.x);
  // Defensive snapshots must not let a caller mutate the dynamic return slot.
  const snapshot=router.returnAddress!;snapshot.x=999;
  assert.equal(router.returnAddress!.x,choice.destination.x);
  floorDestinations++;
}
const first=await load('MAP_CELADON_CITY_DEPARTMENT_STORE_1F');
const valid=await router.resolveAddress({mapId:first.id,warpId:6,x:0,y:0});
assert.equal(valid.arrival.x,first.warps[6]!.x); // Valid warp id takes precedence over coordinates.
await assert.rejects(()=>router.resolveAddress({mapId:first.id,warpId:-1,x:-1,y:1}),/Destino inexistente/);
console.log(`Viewer elevator coordinate destinations PASS: ${floorDestinations}`);

// Field temporaries follow the source map loaders (overworld.c:753-797), not
// menus. PREPARED: flags/vars are test inputs; no story outcome is manufactured.
const { rom } = await import('../../src/core/rom');
rom.constants = JSON.parse(await readFile('public/fr/constants.json','utf8'));
const S = await import('../../src/games/firered/save');
const events = await import('../../src/viewer/mapEvents');
const { isViewerObjectPresent } = await import('../../src/viewer/data/objectPresence');
const { EntityManager } = await import('../../src/viewer/render/entities');
S.setSave(S.newSaveData());
events.restoreViewerEventMap('MAP_ROUTE9');
S.flagSet(C.FLAG_BADGE01_GET); // PREPARED: explicit input for map-load reset/preservation
for (let id=C.TEMP_FLAGS_START;id<=C.TEMP_FLAGS_END;id++) S.flagSet(id); // PREPARED: explicit input for map-load reset/preservation
for (let id=C.TEMP_VARS_START;id<=C.TEMP_VARS_END;id++) S.varSet(id,123); // PREPARED: explicit input for map-load reset/preservation
S.varSet(C.VAR_MAP_SCENE_PEWTER_CITY,1); // PREPARED: explicit input for map-load reset/preservation
S.flagSet(C.FLAG_SYS_USE_STRENGTH); // PREPARED: explicit input for map-load reset/preservation
assert.equal(events.enterViewerEventMap('MAP_ROUTE9'),false);
assert.equal(S.flagGet(C.FLAG_TEMP_12),true,'same map keeps temporary removals');
const tree = {map:'MAP_ROUTE9',x:2,y:8,layer:'corte',flag:C.FLAG_TEMP_12,localId:1};
assert.equal(isViewerObjectPresent(tree),false);
assert.equal(isViewerObjectPresent({...tree,map:'MAP_PEWTER_CITY'}),true,'temp bits do not belong to neighbouring sector maps');
assert.equal(events.enterViewerEventMap('MAP_ROUTE10'),true);
for (let id=C.TEMP_FLAGS_START;id<=C.TEMP_FLAGS_END;id++) assert.equal(S.flagGet(id),false,`temp flag ${id}`);
for (let id=C.TEMP_VARS_START;id<=C.TEMP_VARS_END;id++) assert.equal(S.varGet(id),0,`temp var ${id}`);
assert.equal(S.flagGet(C.FLAG_SYS_USE_STRENGTH),false);
assert.equal(S.flagGet(C.FLAG_BADGE01_GET),true);
assert.equal(S.varGet(C.VAR_MAP_SCENE_PEWTER_CITY),1);
S.flagSet(C.FLAG_TEMP_12); // PREPARED: explicit input for map-load reset/preservation
events.restoreViewerEventMap('MAP_ROUTE9');
assert.equal(S.flagGet(C.FLAG_TEMP_12),true,'continue restores saved temporaries');
assert.equal(events.enterViewerEventMap('MAP_ROUTE9',true),true,'same-map warp reloads');
assert.equal(S.flagGet(C.FLAG_TEMP_12),false);
// Template removal with flag 0 must not erase the template permanently. Local
// IDs repeat across maps; removing one must preserve the other and occupancy.
const objects = new EntityManager(null as unknown as HTMLElement,0,0);
objects.addEntity({...tree,flag:0},2,8,'south');
objects.addEntity({...tree,map:'MAP_ROUTE10',flag:0},2,8,'south');
objects.removeObject('MAP_ROUTE9',1);
objects.syncPresence(isViewerObjectPresent);
assert.equal(objects.entities.length,2);
assert.equal(objects.findAt(2,8)?.element.map,'MAP_ROUTE10');
objects.resetRemovedObjects();objects.syncPresence(isViewerObjectPresent);
assert.equal(objects.findAt(2,8)?.element.map,'MAP_ROUTE9');
console.log('PREPARED flags/vars and template fixtures; Viewer map events PASS: map change/same-map warp reset, same-map interaction/continue preservation, persistent progress and retained templates');
