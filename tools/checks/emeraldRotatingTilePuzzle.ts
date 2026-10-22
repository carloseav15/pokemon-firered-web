// PREPARED geometry for source-C branch comparison, followed by real exported map/script VM runs.
// No browser/rendering claim. The oracle compiles the original C body, not a rewritten algorithm.
import './setupNodeGbaMock.ts';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { rom, setDataRoot } from '../../src/core/rom.ts';
import * as C from '../../src/games/emerald/generated/constants.ts';
import { ROTATING_TILE_ACTIONS } from '../../src/games/emerald/rotatingTileMovement.ts';
import { RotatingTilePuzzle } from '../../src/games/emerald/rotatingTilePuzzle.ts';
import type { Overworld } from '../../src/core/field/overworld.ts';
const fetchFile=globalThis.fetch;
globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input);if(url.startsWith('/')&&!existsSync('public'+url))return new Response('',{status:404});return fetchFile(input,init);}) as typeof fetch;
setDataRoot('/emerald');
await rom.load();
const decomp = process.env.POKEEMERALD ?? resolve('../refs-src/pokeemerald');
const source = readFileSync(resolve(decomp, 'src/rotating_tile_puzzle.c'), 'utf8');
const dir = '.decomp-build/checks/rotating'; mkdirSync(dir, { recursive: true });
const used = new Set(source.match(/\b(?:MOVEMENT_\w+|DIR_\w+|LOCALID_\w+|OBJECT_\w+|METATILE_\w+)\b/g));
const values: Record<string,number> = { ...C, ...rom.constants };
const definitions = [...used].filter(k => values[k] !== undefined).map(k => `#define ${k} ${values[k]}`).join('\n');
const shim = `
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
typedef uint8_t u8; typedef int8_t s8; typedef uint16_t u16; typedef int16_t s16; typedef int32_t s32; typedef uint8_t bool8;
#define EWRAM_DATA
#define MAP_OFFSET 7
#define TRY_FREE_AND_SET_NULL(p) do { free(p); p=NULL; } while(0)
#define AllocZeroed(n) calloc(1,n)
${definitions}
struct ObjectEventTemplate { s16 x,y; u8 localId,movementType; };
struct { struct ObjectEventTemplate objectEventTemplates[64]; struct { u8 mapNum,mapGroup; } location; } block, *gSaveBlock1Ptr=&block;
struct { u8 facingDirection; } gObjectEvents[16];
int live,ox,oy,oldTile,newTile,events[32],nevents,cleared,unfrozen;
u16 MapGridGetMetatileIdAt(s16 x,s16 y) { if(x==ox+7&&y==oy+7)return oldTile; return newTile; }
u8 GetObjectEventIdByLocalIdAndMap(u8 id,u8 num,u8 group) { return id==255?0:(live&&id==1?1:16); }
void ObjectEventClearHeldMovementIfFinished(void *p) { cleared++; }
void ScriptMovement_UnfreezeObjectEvents(void) { unfrozen++; }
void ScriptMovement_StartObjectMovementScript(u8 id,u8 num,u8 group,const u8 *p) { for(int i=0;i<8;i++){ events[nevents++]=p[i];if(p[i]==MOVEMENT_ACTION_STEP_END)break;} }
`;
const main = `
int main(void) {
 int trick,puzzle,type,facing;
 while(scanf("%d%d%d%d%d%d%d",&trick,&puzzle,&oldTile,&newTile,&live,&type,&facing)==7) {
 memset(&block,0,sizeof(block)); nevents=cleared=unfrozen=0; ox=20;oy=20;
 // Empty C slots must be off puzzle tiles, as on the source maps; use a separate map cell.
 for(int i=1;i<64;i++){ block.objectEventTemplates[i].x=-100;block.objectEventTemplates[i].y=-100; }
 block.objectEventTemplates[0]=(struct ObjectEventTemplate){ox,oy,1,type};gObjectEvents[1].facingDirection=facing;
 InitRotatingTilePuzzle(trick); int id=MoveRotatingTileObjects(puzzle); TurnRotatingTileObjects(); FreeRotatingTilePuzzle();
 printf("%d %d %d %d %d %d",id,block.objectEventTemplates[0].x,block.objectEventTemplates[0].y,block.objectEventTemplates[0].movementType,cleared,unfrozen);
 for(int i=0;i<nevents;i++)printf(" %d",events[i]);puts("");
 }
}
`;
// The zeroed slots' cell cannot use newTile (which may be an arrow).
const actualShim = shim.replace('return newTile;','if(x<0||y<0)return 0; return newTile;');
writeFileSync(`${dir}/oracle.c`, actualShim + source.replace(/^#include.*$/gm, '') + main);
const compiled = spawnSync('cc', ['-std=c99','-w',`${dir}/oracle.c`,'-o',`${dir}/oracle`], {encoding:'utf8'});
assert.equal(compiled.status,0,compiled.stderr);
const cases: number[][]=[];
for(const trick of [0,1])for(const row of [0,2,4])for(const arrow of [0,1,2,3,4,7])for(const difference of [-3,-1,0,1,3])for(const live of [0,1])for(const facing of [C.DIR_NORTH,C.DIR_SOUTH,C.DIR_EAST,C.DIR_WEST]) {
 const start=rom.c(trick?'METATILE_TrickHousePuzzle_Arrow_YellowOnWhite_Right':'METATILE_MossdeepGym_YellowArrow_Right');
 cases.push([trick,row,start+row*8+arrow,start+row*8+arrow+difference,live,[C.MOVEMENT_TYPE_FACE_UP,C.MOVEMENT_TYPE_FACE_DOWN,C.MOVEMENT_TYPE_FACE_RIGHT,C.MOVEMENT_TYPE_FACE_LEFT][facing-1]!,facing]);
}
// Out-of-range row, before-threshold, and Trick House negative subtraction/conversion.
for(const old of [0,591,592,657,663,704,1023])cases.push([1,0,old,664,1,C.MOVEMENT_TYPE_FACE_RIGHT,C.DIR_EAST]);
const oracle=spawnSync(`${dir}/oracle`,[],{input:cases.map(c=>c.join(' ')).join('\n'),encoding:'utf8',maxBuffer:4e6});
assert.equal(oracle.status,0,oracle.stderr);
const lines=oracle.stdout.trim().split('\n');assert.equal(lines.length,cases.length);
for(let i=0;i<cases.length;i++) {
 const [trick,row,old,next,live,type,facing]=cases[i]!;
 const template={x:20,y:20,localId:1,movementType:type!};const events:number[]=[];let cleared=0,unfrozen=0;
 const ow={map:{metatileIdAt:(x:number,y:number)=>x===27&&y===27?old:next},objects:{templates:[template],mapNum:0,mapGroup:0,externalMovementActions:new Map(),
  byLocalIdAndMap:(id:number)=>id===255?{}:live?{facingDirection:facing}:undefined,
  ObjectEventClearHeldMovementIfFinished:()=>{cleared++;}},game:{scriptMovement:{
   ScriptMovement_StartObjectMovementScript:(_id:number,_n:number,_g:number,bytes:number[])=>{events.push(...bytes);},
   ScriptMovement_UnfreezeObjectEvents:()=>{unfrozen++;}}}} as unknown as Overworld;
 const puzzle=new RotatingTilePuzzle(ow);puzzle.InitRotatingTilePuzzle(trick!);const id=puzzle.MoveRotatingTileObjects(row!);puzzle.TurnRotatingTileObjects();puzzle.FreeRotatingTilePuzzle();
 assert.deepEqual([id,template.x,template.y,template.movementType,cleared,unfrozen,...events],lines[i]!.split(' ').map(Number).map((v,index)=>index>=6?ROTATING_TILE_ACTIONS.get(v)!:v),`source C case ${i}: ${cases[i]}`);
}
console.log(`original C comparison PASS: ${cases.length} PREPARED cases (both maps, all arrows/directions, active/absent objects, rotation and arithmetic branches)`);

// Source maps and their assembled switch scripts, using real object movement and ScriptContext.
const { Game } = await import('../../src/games/firered/game.ts');
const saveModule = await import('../../src/games/firered/save.ts');
const { newSaveData, setSave } = saveModule;
const { resetWorldRegion, enterBankedRegion } = await import('../../src/viewer/regionSave.ts');
const { runEmeraldMapEntry } = await import('../../src/viewer/hoennMapEntry.ts');
const { SetTilesetProfile, MAP_OFFSET } = await import('../../src/core/field/fieldmap.ts');
const { preloadFieldAssets } = await import('../../src/core/field/preloadField.ts');
const { loadFieldFx } = await import('../../src/core/field/fieldEffects.ts');
const { tasks } = await import('../../src/core/gba/tasks.ts');
const { sound } = await import('../../src/core/audio/sound.ts');
SetTilesetProfile('emerald');
const { preloadPacks, loadCData } = await import('../../src/core/hw/assets.ts');
await Promise.all([preloadFieldAssets(),loadFieldFx(),preloadPacks(['graphics_text_window','graphics_fonts','graphics_help_system','graphics_quest_log']),loadCData('fonts','text_window_graphics','text_printer','text')]);
const context = new Proxy({imageSmoothingEnabled:false}, {get:(t,k)=>k in t?t[k as keyof typeof t]:()=>{},set:(t,k,v)=>{(t as unknown as Record<PropertyKey,unknown>)[k]=v;return true;}});
const canvas={getContext:()=>context,width:240,height:160} as unknown as HTMLCanvasElement;
const warnings:string[]=[];const warn=console.warn;console.warn=(...args:unknown[])=>{warnings.push(args.join(' '));warn(...args);};
function oracleRows(inputs:number[][]): number[][] {
 const result=spawnSync(`${dir}/oracle`,[],{input:inputs.map(c=>c.join(' ')).join('\n'),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);return result.stdout.trim().split('\n').map(l=>l.split(' ').map(Number));
}
// PREPARED storage and trainer only; puzzle outcomes come exclusively from source scripts.
const storage = new Map<string,string>();
Object.assign(globalThis, {localStorage:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>{storage.set(k,v);},removeItem:(k:string)=>{storage.delete(k);}}});
const regions = await import('../../src/viewer/regionSave.ts');
const session = await import('../../src/viewer/session.ts');
const projection = await import('../../src/viewer/objectState.ts');
const mapEvents = await import('../../src/viewer/mapEvents.ts');
const { EngineInteraction } = await import('../../src/viewer/engineInteraction.ts');
const { createMon } = await import('../../src/core/pokemon/pokemon.ts');
// Exercise the actual adapter methods without mounting a DOM dialog or starting a render loop.
type Adapter = { game: InstanceType<typeof Game>; interactionMapId:string; observedObjects:Map<string,import('../../src/viewer/objectState.ts').ViewerObjectState>; hooks:unknown; observeObjects():void; prepareObjects(nav:import('../../src/viewer/session.ts').NavigationSave,prepared:boolean):Promise<void> };
function adapter(game:InstanceType<typeof Game>,mapId:string):Adapter {
 const bridge=Object.create(EngineInteraction.prototype) as Adapter;
 Object.assign(bridge,{game,interactionMapId:mapId,observedObjects:new Map(),hooks:{mapOrigin:()=>({x:0,y:0}),readObjects:projection.savedViewerObjects}});
 return bridge;
}
const templatePoses=(ow:Overworld)=>ow.objects.templates.map(t=>[t.localId,t.x,t.y,t.movementType,t.elevation]);
const livePoses=(ow:Overworld)=>ow.objects.list.filter(o=>!o.isPlayer).map(o=>projection.readViewerObjectState(o,ow.header.id)).sort((a,b)=>a.localId-b.localId);
let moved=0;
for(const [mapId,prefix,trick] of [
 ['MAP_MOSSDEEP_CITY_GYM','MossdeepCity_Gym',0],
 ['MAP_ROUTE110_TRICK_HOUSE_PUZZLE7','Route110_TrickHousePuzzle7',1],
] as const)for(const [row,color] of ['Yellow','Blue','Green','Purple','Red'].entries()) {
 if(trick&&row===4)continue; // Source labels RedButton as unused; it has no coordinate caller.
 // PREPARED entry only: source map's own templates, no positions/tiles/results rewritten.
 storage.clear();resetWorldRegion();setSave(newSaveData());
 regions.worldOf().started.kanto=true;
 saveModule.save.party.push(createMon(C.SPECIES_TREECKO,5));
 saveModule.save.bag.items.push({item:C.ITEM_POTION,quantity:3});
 enterBankedRegion('hoenn');tasks.reset();
 const game=new Game(canvas),ow=game.overworld;
 const nav={mapId,x:1,y:1,direction:'south' as const,dynamic:null};
 await runEmeraldMapEntry(game,nav);
 const retained=ow.header.objects.filter(o=>!o.clone).map(o=>({mapId,localId:o.localId}));
 await ow.prepareViewerInteraction(mapId,retained,true);
 // Verify why omitted C padding slots (zero localId/x/y) cannot participate on these maps.
 const emptyTile=ow.map.metatileIdAt(MAP_OFFSET,MAP_OFFSET);
 const emptyResult=oracleRows([[trick,row,emptyTile,emptyTile,0,C.MOVEMENT_TYPE_NONE,C.DIR_SOUTH]])[0]!;
 assert.deepEqual(emptyResult.slice(1,3),[20,20],`${mapId} zeroed C template slots stay outside puzzle arrows`);
 const before=structuredClone(ow.objects.templates);
 const live=before.map(t=>ow.objects.byLocalIdAndMap(t.localId,ow.objects.mapNum,ow.objects.mapGroup));
 const inputs=before.map((t,i)=>[trick,row,ow.map.metatileIdAt(t.x+MAP_OFFSET,t.y+MAP_OFFSET),0,live[i]?1:0,t.movementType,live[i]?.facingDirection??C.DIR_SOUTH]);
 const projected=oracleRows(inputs);
 for(let i=0;i<inputs.length;i++) {
  const t=before[i]!,p=projected[i]!;
  inputs[i]![3]=ow.map.metatileIdAt(t.x+p[1]!-20+MAP_OFFSET,t.y+p[2]!-20+MAP_OFFSET);
 }
 const expected=oracleRows(inputs);
 const label=`${prefix}_EventScript_${color}${trick?'Button':'FloorSwitch'}`;
 const ptr=rom.label(label);assert.ok(ptr,label);
 // The exported map must have a real coordinate event that invokes this label.
 const sourceMap=JSON.parse(readFileSync(resolve(decomp,`data/maps/${prefix}/map.json`),'utf8'));
 assert.ok(sourceMap.coord_events.some((e:{script:string})=>e.script===label),`coordinate caller ${label}`);
 ow.script.ScriptContext_SetupScript(ptr);
 let frames=0;
 while(ow.script.isActive()&&frames<1000) {ow.script.ScriptContext_RunScript();tasks.run();ow.objects.update(0,0);sound.frame();frames++;}
 assert.ok(frames<1000,`${label} finishes`);
 let changed=0;
 for(let i=0;i<before.length;i++) {
  const a=before[i]!,b=ow.objects.templates[i]!,p=expected[i]!;
  assert.deepEqual([b.x-a.x,b.y-a.y,b.movementType],[p[1]!-20,p[2]!-20,p[3]],`${label} source template ${a.localId}`);
  const object=live[i];
  if(object) {
   assert.deepEqual([object.currentCoords.x-MAP_OFFSET,object.currentCoords.y-MAP_OFFSET],[b.x,b.y],`${label} movement completed ${a.localId}`);
   // Oracle logs shift (4 bytes) then optional turn (2 bytes).
   if(p.length===12) {
    const faceAction=p[10];
    const directions:Record<number,number>={[C.MOVEMENT_ACTION_FACE_UP]:C.DIR_NORTH,[C.MOVEMENT_ACTION_FACE_DOWN]:C.DIR_SOUTH,[C.MOVEMENT_ACTION_FACE_LEFT]:C.DIR_WEST,[C.MOVEMENT_ACTION_FACE_RIGHT]:C.DIR_EAST};
    assert.equal(object.facingDirection,directions[faceAction!],`${label} facing ${a.localId}`);
   }
   assert.equal(object.frozen,false,`${label} frees movement lock`);
   assert.equal(object.facingDirectionLocked,false,`${label} releases animation facing lock`);
   assert.equal(object.heldMovementActive,false,`${label} clears completed held movement`);
  }
  if(a.x!==b.x||a.y!==b.y)changed++;
 }
 assert.ok(changed>0,`${label} moves source objects (not an empty command pass)`);moved+=changed;
 assert.equal(saveModule.save.objectEventTemplates,ow.objects.templates,'save templates remain the live templates');
 console.log(`${label}: PASS (${changed} source templates moved; ${frames} frames)`);
 game.scriptMovement.unfreezeAndStop();
 const bridge=adapter(game,mapId);
 bridge.observeObjects();
 const savedTemplates=templatePoses(ow),savedLive=livePoses(ow);
 const progress=structuredClone({flags:saveModule.save.flags,vars:saveModule.save.vars});
 const globals=structuredClone({party:saveModule.save.party,bag:saveModule.save.bag,money:saveModule.save.money});
 assert.ok(session.saveViewerSession(nav),`${label} saves through viewer session`);
 // Storage Continue, then park Hoenn while Kanto saves, then Continue Hoenn again.
 for(const roundTrip of [false,true]) {
  const canonical=regions.reloadWorldSave()!;
  assert.equal(canonical.world!.activeRegion,'hoenn');
  assert.deepEqual(canonical.objectEventTemplates,[], 'Hoenn templates do not leak into Kanto');
  if(roundTrip) {
   assert.ok(regions.writeWorldSave(),'Kanto saves while Hoenn is parked');
   assert.equal(regions.loadWorldSave()!.world!.activeRegion,'kanto');
  }
  const resumedNav=session.continueRegionalSession('hoenn',()=>{throw Error('existing Hoenn bank must not reinitialize');});
  assert.equal(mapEvents.enterViewerEventMap(resumedNav.mapId),false,'first viewer display after Continue must not clear saved map state');
  const resumedGame=new Game(canvas),resumedOw=resumedGame.overworld;
  const report=await runEmeraldMapEntry(resumedGame,resumedNav,{continuing:true});
  assert.equal(report.transition,null,'Continue skips ON_TRANSITION');
  assert.deepEqual({flags:saveModule.save.flags,vars:saveModule.save.vars},progress,'Continue preserves regional progress and TEMP data');
  const resumedBridge=adapter(resumedGame,mapId);
  await resumedBridge.prepareObjects(resumedNav,true);
  assert.deepEqual(templatePoses(resumedOw),savedTemplates,`${label} templates after ${roundTrip?'Kanto bank round trip':'Continue'}`);
  assert.deepEqual(livePoses(resumedOw).filter(o=>savedLive.some(s=>s.localId===o.localId)),savedLive,`${label} live poses after ${roundTrip?'Kanto bank round trip':'Continue'}`);
  assert.deepEqual({party:saveModule.save.party,bag:saveModule.save.bag,money:saveModule.save.money},globals,'shared trainer survives');
  // A further press must use the restored templates, including their independent movementType.
  const prior=structuredClone(resumedOw.objects.templates);
  const objects=prior.map(t=>resumedOw.objects.byLocalIdAndMap(t.localId,resumedOw.objects.mapNum,resumedOw.objects.mapGroup));
  const nextInputs=prior.map((t,i)=>[trick,row,resumedOw.map.metatileIdAt(t.x+MAP_OFFSET,t.y+MAP_OFFSET),0,objects[i]?1:0,t.movementType,objects[i]?.facingDirection??C.DIR_SOUTH]);
  const deltas=oracleRows(nextInputs);
  for(let i=0;i<prior.length;i++)nextInputs[i]![3]=resumedOw.map.metatileIdAt(prior[i]!.x+deltas[i]![1]!-20+MAP_OFFSET,prior[i]!.y+deltas[i]![2]!-20+MAP_OFFSET);
  const nextExpected=oracleRows(nextInputs);
  resumedOw.script.ScriptContext_SetupScript(ptr);
  let ticks=0;
  while(resumedOw.script.isActive()&&ticks++<1000){resumedOw.script.ScriptContext_RunScript();tasks.run();resumedOw.objects.update(0,0);sound.frame();}
  assert.ok(ticks<1000,'next press completes');
  for(let i=0;i<prior.length;i++) {
   const a=prior[i]!,b=resumedOw.objects.templates[i]!,p=nextExpected[i]!;
   assert.deepEqual([b.x-a.x,b.y-a.y,b.movementType],[p[1]!-20,p[2]!-20,p[3]],`${label} next press matches C after restore`);
  }
  resumedGame.scriptMovement.unfreezeAndStop();
  // Unsaved second press must be discarded by the next reload, rather than preparing outcomes.
 }
 // A real departure/re-entry uses the source header again, not the parked puzzle snapshot.
 const reentry=new Game(canvas);
 await runEmeraldMapEntry(reentry,nav);
 assert.deepEqual(templatePoses(reentry.overworld),before.map(t=>[t.localId,t.x,t.y,t.movementType,t.elevation]),'normal re-entry resets source puzzle templates');
 console.log(`${label}: storage Continue + Kanto bank round trip + next source press PASS`);
}
assert.equal(warnings.filter(w=>/not implemented|script command/i.test(w)).length,0,warnings.join('\n'));
console.log(`PASS: 9 exported coordinate scripts; ${moved} source object displacements; no browser/rendering validation`);

// Compare the complete animation-lock allocation family to its original C bodies as well.
const movementSource=readFileSync(resolve(decomp,'src/event_object_movement.c'),'utf8');
function cFunction(name:string):string {
 const match=new RegExp(`(?:u8|bool8|void) ${name}\\([^;]*?\\)\\n\\{`).exec(movementSource);assert.ok(match,name);
 const start=match.index;let at=start+match[0].length,depth=1;
 while(depth&&at<movementSource.length){const c=movementSource[at++];if(c==='{')depth++;else if(c==='}')depth--;}
 return movementSource.slice(start,at);
}
const lockShim=`
#include <stdint.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
typedef uint8_t u8;typedef int16_t s16;typedef uint8_t bool8;typedef uint32_t bool32;
#define FALSE 0
#define TRUE 1
#define OBJECT_EVENTS_COUNT 16
#define LOCALID_NONE 0
#define AllocZeroed(n) calloc(1,n)
#define FREE_AND_SET_NULL(p) do{free(p);p=NULL;}while(0)
struct ObjectEvent{u8 localId,inanimate,facingDirectionLocked,graphicsId,triggerGroundEffectsOnMove;struct{s16 x,y;}currentCoords;};
struct Sprite{u8 sActionFuncId,animPaused;};
struct LockedAnimObjectEvents{u8 localIds[16];u8 count;}*sLockedAnimObjectEvents=NULL;
struct{u8 inanimate;}info;
void *unused;
#define GetObjectEventGraphicsInfo(id) (&info)
u8 FindLockedObjectEventIndex(struct ObjectEvent *);
void SetObjectEventDirection(struct ObjectEvent *o,u8 direction){}
void MoveCoords(u8 direction,s16 *x,s16 *y){}
void ShiftObjectEventCoords(struct ObjectEvent *o,s16 x,s16 y){}
void SetSpriteDataForNormalStep(struct Sprite *s,u8 direction,u8 speed){}
`;
const lockMain=`
int main(void){struct ObjectEvent objects[18]={0};struct Sprite sprites[18]={0};int action,id,anim;
for(int i=0;i<18;i++){objects[i].localId=i+1;sprites[i].animPaused=1;}
while(scanf("%d%d%d",&action,&id,&anim)==3){info.inanimate=anim;struct ObjectEvent *o=&objects[id];struct Sprite *s=&sprites[id];
if(action==0)MovementAction_LockAnim_Step0(o,s);else MovementAction_UnlockAnim_Step0(o,s);
printf("%d %d %d %d %d %d ",o->inanimate,o->facingDirectionLocked,s->animPaused,s->sActionFuncId,sLockedAnimObjectEvents?sLockedAnimObjectEvents->count:0,sLockedAnimObjectEvents?FindLockedObjectEventIndex(o):16);
InitNpcForMovement(o,s,4,0);printf("%d\\n",s->animPaused);
}}
`;
writeFileSync(`${dir}/lock.c`,lockShim+['MovementAction_LockAnim_Step0','MovementAction_UnlockAnim_Step0','FindLockedObjectEventIndex','InitNpcForMovement'].map(cFunction).join('\n')+lockMain);
const lockCompile=spawnSync('cc',['-std=c99',`${dir}/lock.c`,'-o',`${dir}/lock`],{encoding:'utf8'});assert.equal(lockCompile.status,0,lockCompile.stderr);
const { EmeraldRotatingTileMovement }=await import('../../src/games/emerald/rotatingTileMovement.ts');
const gfxIds=Object.entries(rom.objects.gfx).filter(([id])=>Number(id)<C.NUM_OBJ_EVENT_GFX).map(([id])=>Number(id));
const animated=gfxIds.find(id=>!rom.objects.gfx[String(id)].inanimate)!;
const inanimate=gfxIds.find(id=>rom.objects.gfx[String(id)].inanimate)!;
const lockObjects=Array.from({length:18},(_,i)=>({localId:i+1,inanimate:false,facingDirectionLocked:false,graphicsId:i%2?inanimate:animated,sprite:{data:new Int16Array(8),animPaused:true}}));
const lockHost={objects:{externalMovementActions:new Map(),resolveGraphicsId:(id:number)=>id}} as unknown as Overworld;
const locker=new EmeraldRotatingTileMovement(lockHost);
const actions:number[][]=[];
for(let i=0;i<17;i++)actions.push([0,i]); // full allocation and one overflow
for(const a of [[0,0],[1,17],[1,0],[0,16],[1,1],[1,1]])actions.push(a); // duplicate, missing, reuse, repeat unlock
for(let i=0;i<18;i++)actions.push([1,i]);
const lockInput=actions.map(([a,id])=>[a,id,Number(rom.objects.gfx[String(lockObjects[id!]!.graphicsId)].inanimate)]);
const lockOracle=spawnSync(`${dir}/lock`,[],{input:lockInput.map(c=>c.join(' ')).join('\n'),encoding:'utf8'});assert.equal(lockOracle.status,0,lockOracle.stderr);
const expectedLocks=lockOracle.stdout.trim().split('\n').map(l=>l.split(' ').map(Number));
for(let i=0;i<actions.length;i++){
 const [action,id]=actions[i]!,object=lockObjects[id!]!;
 if(action===0)locker.MovementAction_LockAnim_Step0(object as unknown as import('../../src/core/field/objectEvents.ts').ObjectEvent);
 else locker.MovementAction_UnlockAnim_Step0(object as unknown as import('../../src/core/field/objectEvents.ts').ObjectEvent);
 // Inspect allocation only in the oracle harness, not in product state.
 const allocation=(locker as unknown as {sLockedAnimObjectEvents:{localIds:number[];count:number}|null}).sLockedAnimObjectEvents;
 const index=allocation?locker.FindLockedObjectEventIndex(object as unknown as import('../../src/core/field/objectEvents.ts').ObjectEvent):16;
 assert.deepEqual([Number(object.inanimate),Number(object.facingDirectionLocked),Number(object.sprite.animPaused),object.sprite.data[2],allocation?.count??0,index],expectedLocks[i]!.slice(0,6),`animation lock C case ${i}`);
 const { ObjectEvents }=await import('../../src/core/field/objectEvents.ts');
 const helperHost=Object.create(ObjectEvents.prototype);
 helperHost.isExternalMovementAnimationLocked=lockHost.objects.isExternalMovementAnimationLocked;
 const moving=object as unknown as import('../../src/core/field/objectEvents.ts').ObjectEvent;
 Object.assign(moving,{currentCoords:{x:20,y:20},previousCoords:{x:20,y:20},facingDirection:1,movementDirection:1});
 helperHost.initNpcForMovement(moving,C.DIR_EAST,0);
 assert.equal(Number(moving.sprite.animPaused),expectedLocks[i]![6],`InitNpcForMovement animation lock C case ${i}`);
}
console.log(`original animation-lock C comparison PASS: ${actions.length} PREPARED allocation/duplicate/overflow/reuse/unlock operations`);
