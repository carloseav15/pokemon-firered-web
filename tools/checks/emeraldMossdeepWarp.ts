// Reuses hoennCircuit's DOM/RAF/data harness (--mossdeep). Inputs are PREPARED
// source switch/warp cells, not a claimed walk through the complete gym.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tasks } from '../../src/core/gba/tasks.ts';
import { sound } from '../../src/core/audio/sound.ts';
import { resolve } from 'node:path';
import { rom } from '../../src/core/rom.ts';
import { save } from '../../src/games/firered/save.ts';
import { mossdeepGymWarp } from '../../src/games/emerald/mossdeepGymWarp.ts';
import type { EngineInteraction } from '../../src/viewer/engineInteraction.ts';
import type { Game } from '../../src/games/firered/game.ts';
import type { NavigationSave } from '../../src/viewer/session.ts';
import * as EM from '../../src/games/emerald/generated/constants.ts';
import * as EMB from '../../src/games/emerald/generated/metatileBehavior.ts';
type Pump = (frames:number,input?:(frame:number)=>number,done?:()=>boolean)=>Promise<number>;
export async function runMossdeepWarpChecks(engine:EngineInteraction,pump:Pump):Promise<void> {
 const mapId='MAP_MOSSDEEP_CITY_GYM';
 const navOn=(map:string)=>(x:number,y:number):NavigationSave=>({mapId:map,x,y,direction:'south',dynamic:null});
 const nav=navOn(mapId);
 const errors:unknown[][]=[],baseError=console.error;
 console.error=(...args:unknown[])=>{errors.push(args);baseError(...args);};
 try {
  // PREPARED first entry and source yellow-switch cell. No object/template result is injected.
  await engine.enterMap(nav(2,21));
  const game=(engine as unknown as {game:Game}).game,ow=game.overworld;
  const templates=()=>ow.objects.templates.map(t=>[t.localId,t.x,t.y,t.movementType,t.elevation]);
  const original=templates();
  assert.equal(await engine.tryEmeraldStep(nav(2,21),'walk'),true);
  await pump(500);assert.equal(engine.open,false);
  const changed=templates();assert.notDeepEqual(changed,original,'real source switch must change templates');
  const shared={party:structuredClone(save.party),bag:structuredClone(save.bag),money:save.money};
  const source=JSON.parse(readFileSync(resolve(process.env.POKEEMERALD??'../refs-src/pokeemerald','data/maps/MossdeepCity_Gym/map.json'),'utf8'));
  // PREPARED incoming temporary destinations; ApplyCurrentWarp must clear them.
  ow.fixedDiveWarp={mapGroup:1,mapNum:2,warpId:3,x:4,y:5};
  ow.fixedHoleWarp={mapGroup:6,mapNum:7,warpId:8,x:9,y:10};
  let count=0;
  for(const [i,warp] of ow.header.warps.entries()){
   if(warp.destMap!==mapId)continue;
   assert.equal(EMB.MetatileBehavior_IsMossdeepGymWarp(ow.map.behaviorAt(warp.x+7,warp.y+7)),true);
   const sourceWarp=source.warp_events[i];
   assert.equal(warp.destWarpId,Number(sourceWarp.dest_warp_id));
   const expected=source.warp_events[Number(sourceWarp.dest_warp_id)];
   // PREPARED player on each source pad, to check every exported destination independently.
   await engine.tryMossdeepWarp(nav(warp.x,warp.y),i);
   await pump(500);assert.equal(engine.open,false,`warp ${i} must return controls`);
   assert.deepEqual([save.location.x,save.location.y],[expected.x,expected.y],`source warp ${i}`);
   assert.equal(save.facing,1,'GetAdjustedInitialDirection default south on Mossdeep tiles');
   assert.deepEqual(templates(),changed,`source warp ${i} retains modified templates`);
   assert.equal(mossdeepGymWarp(ow).skipsObjectEventLoad,false,'source exit clears the skip bit');
   assert.equal(ow.controlsLocked,false);
   for(const temporary of [ow.fixedDiveWarp,ow.fixedHoleWarp])assert.deepEqual(temporary,{mapGroup:127,mapNum:127,warpId:-1,x:-1,y:-1},'ApplyCurrentWarp temporary destination reset');
   count++;
  }
  assert.equal(count,source.warp_events.filter((w:{dest_map:string})=>w.dest_map===mapId).length);
  // The source coord event executes the exported command, not the removed manual return destination.
  const event=source.coord_events.find((e:{script:string})=>e.script==='MossdeepCity_Gym_EventScript_WarpToEntrance');assert.ok(event);
  assert.equal(await engine.tryEmeraldStep(nav(event.x,event.y),'walk'),true);
  await pump(500);assert.equal(engine.open,false);
  const script=readFileSync(resolve(process.env.POKEEMERALD??'../refs-src/pokeemerald','data/maps/MossdeepCity_Gym/scripts.inc'),'utf8');
  const match=/warpmossdeepgym MAP_MOSSDEEP_CITY_GYM, (\d+), (\d+)/.exec(script);assert.ok(match);
  assert.deepEqual([save.location.x,save.location.y],match.slice(1).map(Number));
  assert.deepEqual(templates(),changed,'script return retains the puzzle templates');
  assert.deepEqual({party:save.party,bag:save.bag,money:save.money},shared);
  assert.deepEqual(errors,[],'no script/warp failure can count as success');
  compareSourceCallbacks(ow);
  await trickHousePuzzle7(engine,pump,navOn,errors);
  console.log(`PASS Mossdeep: real source switch, ${count} source pads + exported return command, template/facing/shared-state preservation (PREPARED cells; no browser or full walk)`);
 } finally {console.error=baseError;}
}

// field_control_avatar.c calls DoMossdeepGymWarp for every MB_MOSSDEEP_GYM_WARP tile: Trick House Puzzle 7 shares it.
// PREPARED entry tile and source pad cells; the yellow button is a real coord event, the warp pairs come from map.json.
async function trickHousePuzzle7(engine:EngineInteraction,pump:Pump,navOn:(map:string)=>(x:number,y:number)=>NavigationSave,errors:unknown[][]):Promise<void> {
 const mapId='MAP_ROUTE110_TRICK_HOUSE_PUZZLE7',nav=navOn(mapId);
 await engine.enterMap(nav(0,21));
 const game=(engine as unknown as {game:Game}).game,ow=game.overworld;
 const templates=()=>ow.objects.templates.map(t=>[t.localId,t.x,t.y,t.movementType,t.elevation]);
 const original=templates();
 const root=process.env.POKEEMERALD??'../refs-src/pokeemerald';
 const source=JSON.parse(readFileSync(resolve(root,'data/maps/Route110_TrickHousePuzzle7/map.json'),'utf8'));
 const yellow=source.coord_events.find((e:{script:string})=>e.script.endsWith('YellowButton'));assert.ok(yellow);
 assert.equal(await engine.tryEmeraldStep(nav(yellow.x,yellow.y),'walk'),true);
 await pump(500);assert.equal(engine.open,false);
 const changed=templates();assert.notDeepEqual(changed,original,'the yellow button must move its arrow-tile objects');
 const shared={party:structuredClone(save.party),bag:structuredClone(save.bag),money:save.money};
 let count=0;
 for(const [i,warp] of ow.header.warps.entries()){
  if(warp.destMap!==mapId)continue;
  assert.equal(EMB.MetatileBehavior_IsMossdeepGymWarp(ow.map.behaviorAt(warp.x+7,warp.y+7)),true,`pad ${i}`);
  const expected=source.warp_events[Number(source.warp_events[i].dest_warp_id)];
  await engine.tryMossdeepWarp(nav(warp.x,warp.y),i);
  await pump(500);assert.equal(engine.open,false,`pad ${i} must return controls`);
  assert.deepEqual([save.location.x,save.location.y],[expected.x,expected.y],`source pad ${i}`);
  assert.deepEqual(templates(),changed,`pad ${i} retains the moved objects`);
  assert.equal(ow.controlsLocked,false);count++;
 }
 assert.equal(count,source.warp_events.filter((w:{dest_map:string})=>w.dest_map===mapId).length);
 assert.deepEqual({party:save.party,bag:save.bag,money:save.money},shared);
 assert.deepEqual(errors,[],'no script/warp failure can count as success');
 console.log(`PASS Trick House Puzzle 7: real yellow button, ${count} source teleport pads through the shared Mossdeep warp, retained objects and shared state (PREPARED entry/pad cells)`);
}

// Original C entry/exit bodies are the oracle for their ordered calls. Peripheral
// APIs are PREPARED trace hooks here; the preceding integration executes real tasks/maps.
function compareSourceCallbacks(ow:Game['overworld']):void {
 const root=resolve(process.env.POKEEMERALD??'../refs-src/pokeemerald');
 function body(file:string,name:string):string {
  const source=readFileSync(resolve(root,'src',file),'utf8');
  const match=new RegExp(`^(?:static )?void ${name}\\([^;]*?\\)\\s*\\{`,'m').exec(source);assert.ok(match,name);
  let pos=source.indexOf('{',match.index)+1,depth=1;
  while(depth){const c=source[pos++];if(c==='{')depth++;else if(c==='}')depth--;}
  return source.slice(match.index,pos);
 }
 const dir='.decomp-build/checks/mossdeep-warp';mkdirSync(dir,{recursive:true});
 writeFileSync(`${dir}/callbacks.c`,`#include <stdio.h>
#include <stdint.h>
typedef uint8_t u8;
#define SKIP_OBJECT_EVENT_LOAD ${EM.SKIP_OBJECT_EVENT_LOAD}
#define SE_WARP_IN ${EM.SE_WARP_IN}
#define SE_WARP_OUT ${EM.SE_WARP_OUT}
u8 sObjectEventLoadFlag;void (*gFieldCallback)(void);int saved;
void Task_WarpAndLoadMap(u8 id){} void Task_ExitNonDoor(u8 id){}
void LockPlayerFieldControls(void){puts("lock");}
void SaveObjectEvents(void){saved=1;}
void TryFadeOutOldMapMusic(void){puts("music:out");}
void WarpFadeOutScreen(void){puts("fade:out");}
void Overworld_PlaySpecialMapMusic(void){puts("music:in");}
void WarpFadeInScreen(void){puts("fade:in");}
void PlaySE(int id){printf("sound:%d\\n",id);}
u8 CreateTask(void (*fn)(u8),u8 priority){printf("task:%d\\n",priority);return 0;}
${body('overworld.c','SetObjectEventLoadFlag')}
${body('field_screen_effect.c','FieldCB_MossdeepGymWarpExit')}
${body('field_screen_effect.c','DoMossdeepGymWarp')}
int main(){DoMossdeepGymWarp();printf("state:%d:%d\\n",sObjectEventLoadFlag,saved);gFieldCallback();printf("state:%d\\n",sObjectEventLoadFlag);}
`);
 const cc=spawnSync('cc',[`${dir}/callbacks.c`,'-o',`${dir}/callbacks`],{encoding:'utf8'});assert.equal(cc.status,0,cc.stderr);
 const c=spawnSync(`${dir}/callbacks`,[],{encoding:'utf8'});assert.equal(c.status,0,c.stderr);
 const trace:string[]=[],originals=new Map<string,unknown>();
 const methods=ow as unknown as Record<string,unknown>;
 for(const [name,event] of [['LockPlayerFieldControls','lock'],['TryFadeOutOldMapMusic','music:out'],['warpFadeOutScreen','fade:out'],['playSpecialMapMusic','music:in'],['WarpFadeInScreen','fade:in']]){
  originals.set(name!,methods[name!]);methods[name!]=()=>{trace.push(event!);};
 }
 const create=tasks.create,play=sound.playSE;
 const warp=mossdeepGymWarp(ow),setFlag=warp.SetObjectEventLoadFlag;
 let currentFlag=0;
 try {
  tasks.create=()=>{trace.push('task:10');return 0;};
  sound.playSE=id=>{trace.push(`sound:${id}`);};
  warp.SetObjectEventLoadFlag=function(flag:number){currentFlag=flag;setFlag.call(this,flag);};
  warp.DoMossdeepGymWarp();trace.push(`state:${currentFlag}:${Number(save.objectEventsVersion===1)}`);
  (warp as unknown as {FieldCB_MossdeepGymWarpExit():void}).FieldCB_MossdeepGymWarpExit();
  trace.push(`state:${currentFlag}`);
  assert.deepEqual(trace,c.stdout.trim().split('\n'));
 } finally {
  for(const [name,method] of originals)methods[name]=method;
  tasks.create=create;sound.playSE=play;warp.SetObjectEventLoadFlag=setFlag;
 }
 console.log('PASS original Mossdeep C entry/exit ordered calls and load-flag state (PREPARED peripheral trace hooks)');
}
