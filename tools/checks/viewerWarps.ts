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

// PREPARED: runtime object inputs, not a prepared movement/script result.
await import('./setupNodeGbaMock');
const { ObjectEvent, ObjectEvents } = await import('../../src/core/field/objectEvents');
const { readViewerObjectState } = await import('../../src/viewer/objectState');
const actor=new ObjectEvent();actor.localId=1;actor.currentCoords={x:11,y:16};actor.facingDirection=C.DIR_WEST;actor.invisible=true;
const moved=readViewerObjectState(actor,'MAP_ROUTE9');
objects.applyObjectState(moved,{...tree,flag:0},0,0);objects.syncPresence(isViewerObjectPresent);
assert.equal(objects.findAt(4,9)?.element.map,'MAP_ROUTE9','invisible active object still occupies its tile');
assert.equal(objects.findAt(2,8)?.element.map,'MAP_ROUTE10','other map with same ID remains in place');
assert.equal(objects.entities[0]!.dir,'west');
assert.equal(objects.entities[0]!.scriptInvisible,true);
assert.ok(objects.takeVacatedTiles().some(p=>p.gx===2&&p.gy===8),'old occupancy invalidated');
objects.resetRemovedObjects();objects.syncPresence(isViewerObjectPresent);
assert.equal(objects.findAt(2,8)?.element.map,'MAP_ROUTE9');
assert.equal(objects.entities[0]!.scriptInvisible,false);
assert.equal(objects.entities[0]!.dir,'south');
assert.ok(objects.takeVacatedTiles().some(p=>p.gx===4&&p.gy===9),'moved tile invalidated on map reload');
// No graphics/hook calls are needed to remove a bare ObjectEvent: assert the
// observer reports explicit removal after deactivation, but not camera culling.
const runtime=new ObjectEvents({} as ConstructorParameters<typeof ObjectEvents>[0]);
const notices:boolean[]=[];runtime.onScriptObjectRemoved=o=>notices.push(o.active);
const addBare=()=>{const o=new ObjectEvent();o.localId=1;o.mapNum=0;o.mapGroup=0;runtime.objects[1]=o;return o;};
runtime.RemoveObjectEventByLocalIdAndMap(1,0,0);assert.equal(notices.length,0);
addBare();runtime.RemoveObjectEventByLocalIdAndMap(1,0,0);assert.deepEqual(notices,[false]);
runtime.remove(addBare());assert.deepEqual(notices,[false],'culling is not a script remove');
console.log('PREPARED object fixtures; viewer object pose, invisible collision, identity, map reset and explicit-removal observer PASS');

// An explicitly removed actor may never have been in the viewer's static index.
objects.applyObjectState({...moved,localId:77,removed:true},{...tree,localId:77,flag:0},0,0);
objects.syncPresence(isViewerObjectPresent);
const retired=objects.entities.find(e=>e.element.localId===77)!;
assert.equal(retired.removed,true);assert.equal(retired.hidden,true);assert.equal(retired.engineState,true);

// PREPARED projection fixtures exercise JSON compatibility and map ownership.
const projections=await import('../../src/viewer/objectState');
const projection={mapId:'MAP_PEWTER_CITY_GYM',localId:2,x:5,y:8,direction:'east' as const,invisible:true,removed:false};
projections.storeViewerObjects(projection.mapId,[projection]);
S.setSave(JSON.parse(JSON.stringify(S.save)));
assert.deepEqual(projections.savedViewerObjects(projection.mapId),[projection]);
assert.deepEqual(projections.savedViewerObjects('MAP_ROUTE9'),[]);
const projectionCopy=projections.savedViewerObjects(projection.mapId);
projectionCopy[0]!.x=99;
assert.equal(projections.savedViewerObjects(projection.mapId)[0]!.x,5);
projections.storeViewerObjects(projection.mapId,[{...projection,x:NaN}]); // PREPARED malformed input
assert.deepEqual(projections.savedViewerObjects(projection.mapId),[]);
projections.storeViewerObjects(projection.mapId,[projection,projection]); // PREPARED duplicate identities
assert.deepEqual(projections.savedViewerObjects(projection.mapId),[]);
projections.storeViewerObjects(projection.mapId,[projection]);

events.restoreViewerEventMap(projection.mapId);
assert.equal(events.enterViewerEventMap(projection.mapId),false);
assert.equal(projections.savedViewerObjects(projection.mapId).length,1);
events.enterViewerEventMap('MAP_ROUTE9');
assert.deepEqual(projections.savedViewerObjects(projection.mapId),[]);
S.setSave(S.newSaveData());
assert.deepEqual(projections.savedViewerObjects(projection.mapId),[]);
console.log('PREPARED projection fixtures; JSON round trip, legacy save and map ownership PASS');

// Source predicates: inclusive +/-8, +/-6 clone exclusion and border flags.
// PREPARED template/player inputs; these are not script or gameplay outcomes.
const rules=await import('../../src/core/field/objectSpawnRules');
const {ViewerObjectSpawns}=await import('../../src/viewer/data/objectSpawns');
const route9=await load('MAP_ROUTE9'),cerulean=await load('MAP_CERULEAN_CITY');
const cut=route9.objects.find(o=>!o.clone&&o.localId===10)!;
if(cut.clone)throw Error('Missing source tree');
let rulePlayer={x:0,y:8};
const ruleHooks={playerMapPosition:()=>rulePlayer,mapType:()=>C.MAP_TYPE_ROUTE,map:()=>({xSize:30+15,ySize:20+14})};
S.setSave(S.newSaveData());
assert.equal(rules.ShouldInitObjectEventStateFromTemplate(ruleHooks,cut,false,0,0),false);
assert.equal(S.flagGet(C.FLAG_TEMP_12),true,'west entry hides source TEMP tree');
S.flagClear(C.FLAG_TEMP_12); // PREPARED reset between boundary inputs
rulePlayer={x:1,y:8};
assert.equal(rules.ShouldInitObjectEventStateFromTemplate(ruleHooks,cut,false,0,0),true);
for(const [dx,dy,expected] of [[8,6,false],[8,-6,false],[-8,6,false],[-8,-6,false],[9,0,true],[-9,0,true],[0,7,true],[0,-7,true]] as const){
 rulePlayer={x:50-dx,y:18-dy};
 assert.equal(rules.TemplateIsObstacleAndWithinView(ruleHooks,cut,50,18),expected,`${dx},${dy}`);
}
// PREPARED boundary matrix for all four sides, indoor bypass and flag range.
for(const [playerInput,coords] of [
 [{x:0,y:10},{x:8,y:10}],[{x:29,y:10},{x:21,y:10}],
 [{x:10,y:0},{x:10,y:6}],[{x:10,y:19},{x:10,y:13}],
] as const){
 rulePlayer={...playerInput};S.flagClear(C.FLAG_TEMP_1F); // PREPARED independent boundary input
 assert.equal(rules.ShouldInitObjectEventStateFromTemplate(ruleHooks,{...cut,...coords,flag:C.FLAG_TEMP_1F},false,0,0),false);
 assert.equal(S.flagGet(C.FLAG_TEMP_1F),true);
}
rulePlayer={x:0,y:8};S.flagClear(C.FLAG_BADGE01_GET); // PREPARED permanent flag input
assert.equal(rules.ShouldInitObjectEventStateFromTemplate(ruleHooks,{...cut,flag:C.FLAG_BADGE01_GET},false,0,0),false);
assert.equal(S.flagGet(C.FLAG_BADGE01_GET),false,'obstacle initialization must never set a permanent flag');
assert.equal(rules.ShouldInitObjectEventStateFromTemplate({...ruleHooks,mapType:()=>C.MAP_TYPE_INDOOR},cut,false,0,0),true);
assert.equal(rules.ShouldInitObjectEventStateFromTemplate(ruleHooks,{...cut,graphicsId:C.OBJ_EVENT_GFX_FAT_MAN},true,0,8),true);
const treeElement={map:route9.id,localId:cut.localId,x:cut.x,y:cut.y,graphics:cut.graphicsName,layer:'npc'};
const spawns=new ViewerObjectSpawns(),sourceHeaders=new Map([[route9.id,route9],[cerulean.id,cerulean]]);
events.restoreViewerEventMap(cerulean.id);
spawns.update(cerulean,{x:47,y:18},index.maps[cerulean.id].width,index.maps[cerulean.id].height,sourceHeaders);
assert.equal(spawns.present(treeElement),false,'nearby obstacle clone must not spawn');
spawns.update(cerulean,{x:41,y:18},index.maps[cerulean.id].width,index.maps[cerulean.id].height,sourceHeaders);
assert.equal(spawns.present(treeElement),true,'clone spawns one tile beyond horizontal exclusion');
spawns.update(cerulean,{x:47,y:18},index.maps[cerulean.id].width,index.maps[cerulean.id].height,sourceHeaders);
assert.equal(spawns.present(treeElement),true,'existing clone remains active when approached');
events.restoreViewerEventMap(route9.id);S.flagClear(C.FLAG_TEMP_12); // PREPARED camera transition after existing clone
spawns.update(route9,{x:0,y:8},index.maps[route9.id].width,index.maps[route9.id].height,sourceHeaders);
assert.equal(spawns.present(treeElement),true,'camera transition retains the active clone identity');
assert.equal(S.flagGet(C.FLAG_TEMP_12),false,'retained instance bypasses initialization flag side effect');
events.restoreViewerEventMap(cerulean.id);

spawns.reset();spawns.update(cerulean,{x:47,y:18},index.maps[cerulean.id].width,index.maps[cerulean.id].height,sourceHeaders);
assert.equal(spawns.present(treeElement),false,'map reload retries clone initialization');
let cloneCount=0;
for(const id of Object.keys(index.maps)){
 const h=await load(id),origin=index.maps[id];
 for(const clone of h.objects){if(!clone.clone)continue;
  const target=await load(clone.targetMap),source=target.objects[clone.targetLocalId-1],targetOrigin=index.maps[clone.targetMap];
  assert.ok(source&&!source.clone&&targetOrigin,`${id} clone source`);
  assert.equal(origin.x+clone.x,targetOrigin.x+source.x);
  assert.equal(origin.y+clone.y,targetOrigin.y+source.y);cloneCount++;
 }
}
console.log(`PREPARED boundary inputs; source clone/border predicates, latched spawning and ${cloneCount} real clone identities/coordinates PASS`);

// PREPARED ObjectEvent records at actual exported clone anchors. Their source
// identities differ from the loaded coordinate frame; no gameplay is prepared.
let cloneProjectionCount=0;
for(const id of Object.keys(index.maps)){
 const h=await load(id),loadedOrigin=index.maps[id];
 for(const clone of h.objects){if(!clone.clone)continue;
  const owner=index.maps[clone.targetMap],source=(await load(clone.targetMap)).objects[clone.targetLocalId-1];
  if(!source||source.clone)throw Error('Missing source object');
  const record=new ObjectEvent();record.localId=source.localId;record.currentCoords={x:clone.x+7,y:clone.y+7};
  const offset=projections.translateViewerObjectCoords({x:0,y:0},loadedOrigin,owner);
  const state=projections.readViewerObjectState(record,clone.targetMap,false,offset);
  assert.equal(state.x,source.x);assert.equal(state.y,source.y);
  assert.deepEqual(projections.translateViewerObjectCoords(state,owner,loadedOrigin),{x:clone.x,y:clone.y});
  projections.storeViewerObjects(id,[state]);S.setSave(JSON.parse(JSON.stringify(S.save)));
  assert.deepEqual(projections.savedViewerObjects(id),[state]);
  assert.deepEqual(projections.savedViewerObjects(clone.targetMap),[],'snapshot still belongs to the loaded map');
  const legacy=JSON.parse(JSON.stringify(S.save));legacy.viewerObjects.version=1;S.setSave(legacy);
  assert.deepEqual(projections.savedViewerObjects(id),[],'v1 cannot silently reinterpret foreign identities');
  cloneProjectionCount++;
 }
}
projections.storeViewerObjects(projection.mapId,[projection]);
const legacyProjection=JSON.parse(JSON.stringify(S.save));legacyProjection.viewerObjects.version=1;S.setSave(legacyProjection);
assert.deepEqual(projections.savedViewerObjects(projection.mapId),[projection],'same-map version 1 remains loadable');
const foreign={...projection,mapId:'MAP_ROUTE9',removed:true};
projections.storeViewerObjects(projection.mapId,[projection,foreign]);S.setSave(JSON.parse(JSON.stringify(S.save)));
assert.equal(projections.savedViewerObjects(projection.mapId).length,2,'same localId in different maps is distinct');
console.log(`PREPARED clone records; ${cloneProjectionCount} source identity/frame conversions, v2 JSON and v1 migration PASS`);
