import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {EscalatorTiles,EscalatorWarpAnimation} from '../../src/core/field/escalatorAnimation';
import {TaskManager} from '../../src/core/gba/tasks';
import {registerCData} from '../../src/core/hw/assets';
import * as Trig from '../../src/core/hw/trig';
import * as C from '../../src/games/firered/generated/constants';
registerCData('trig',JSON.parse(readFileSync('public/fr/cdata/trig.json','utf8')).defs);
Trig.initTrig();
const constants=JSON.parse(readFileSync('public/fr/constants.json','utf8')) as Record<string,number>;
const native=JSON.parse(execFileSync('python3',['tools/checks/clangEscalator.py'],{encoding:'utf8',maxBuffer:64e6})) as number[][];
const normal=(n:string)=>constants[`METATILE_PokemonCenter_Escalator_${n}_Normal`]!;
const layout=[normal('TopNextRail'),normal('Top'),normal('TopNext'),normal('BottomNextRail'),normal('BottomRail'),normal('BottomNext'),normal('Bottom'),normal('Top'),normal('Bottom')];
const traces:number[][]=[];
// PREPARED movement/fade/map callbacks match the native harness; source task arithmetic and state only.
for(const behavior of [C.MB_UP_ESCALATOR,C.MB_DOWN_ESCALATOR])for(const fade of [1,5])for(const mb of [0,3])for(let face=1;face<=4;face++)for(const down of [0,1]){
 const scheduler=new TaskManager();
 let tick=0,busy=mb>0,busyUntil=mb,frozen=0,locks=0,fades=0,fadeIns=0,warps=0,loadMap=0,sounds=0,qlOut=0,qlIn=0,lastHeld=0,fadeActive=false,callback=false;
 const grid:number[][]=Array.from({length:5},()=>Array(5).fill(0));
 for(let i=0;i<9;i++)grid[1+(i/3|0)]![1+i%3]=layout[i]!;
 const sprite={x2:0,y2:0};
 const clearHeld=()=>{if(tick>=busyUntil){busy=false;return true;}return false;};
 const setHeld=(a:number)=>{lastHeld=a;busy=true;busyUntil=tick+2;};
 const tiles=new EscalatorTiles({metatileIdAt:(x,y)=>grid[y]![x]!&0x3ff,setMetatileIdAt:(x,y,v)=>{grid[y]![x]=v;}},()=>({x:2,y:2}),scheduler,n=>constants[n]!);
 const animation=new EscalatorWarpAnimation({
  sprite:()=>sprite,freezeObjects:()=>{frozen=1;},unfreezeObjects:()=>{frozen=0;},
  playerMovementReady:()=>!busy||clearHeld(),
  holdFacing:()=>setHeld(100+face),faceRight:()=>setHeld(100+C.DIR_EAST),
  playerMovementFinished:()=>clearHeld(),walkRight:()=>setHeld(200+C.DIR_EAST),
  playEscalatorSound:()=>{sounds++;},beginFadeOut:()=>{fades++;fadeActive=true;},
  fadeFinished:()=>!fadeActive&&tick>=fade,
  warpIntoMap:()=>{warps++;loadMap=1;callback=true;},
  destinationIsDownEscalator:()=>!!down,beginWarpIn:()=>{fadeIns++;locks++;},
  unlockControls:()=>{locks--;},questLog:d=>{if(d===C.QL_ESCALATOR_OUT)qlOut++;else qlIn++;},
 },tiles,scheduler);
 const record=()=>{
  traces.push([behavior,fade,mb,face,down,tick,0,sprite.x2,sprite.y2,animation.outStage,animation.inStage,tiles.drawState,frozen,locks,fades,fadeIns,warps,loadMap,sounds,qlOut,qlIn,lastHeld,+busy,+callback,+tiles.IsEscalatorMoving(),
   ...[1,2,3].flatMap(y=>[1,2,3].map(x=>grid[y]![x]!))]);
};
 animation.StartEscalatorWarp(behavior,10);record();
 let pendingIn=-1;
 while(++tick<400){
  if(fadeActive&&tick>=fade)fadeActive=false;
  scheduler.run();
  if(loadMap&&pendingIn<0)pendingIn=tick+3;
  if(pendingIn===tick&&callback){callback=false;animation.FieldCB_EscalatorWarpIn();}
  record();
  if(pendingIn>=0&&tick>pendingIn&&!animation.active&&!scheduler.tasks.some(t=>t.isActive))break;
 }
 assert.ok(tick<400,'task must terminate');
}
assert.equal(traces.length,native.length);
for(let i=0;i<native.length;i++)assert.deepEqual(traces[i],native[i],`C frame ${i}`);
console.log(`Escalator warp native C comparison PASS: ${traces.length} frames, 64 behavior/fade/movement/facing/arrival cases, out/in states, tile stages and map writes`);
