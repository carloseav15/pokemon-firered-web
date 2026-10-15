import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {FallWarpAnimation,type FallObject} from '../../src/core/field/fallWarpAnimation';
import {TaskManager} from '../../src/core/gba/tasks';
const native=JSON.parse(execFileSync('python3',['tools/checks/clangFallWarp.py'],{encoding:'utf8',maxBuffer:8e6})) as number[][];
const traces:number[][]=[];
// PREPARED callbacks match the native harness; source arithmetic/states, not scene validation.
for(const y of [32,72,120])for(const center of [-8,-16])for(const weather of [0,20])for(const wet of [0,1]){
 let tick=0,pan=0,prevent=false,soundCount=0,lastSound=0,surf=0;const scheduler=new TaskManager();
 const object:FallObject={facingDirection:1,invisible:false,fixedPriority:false,triggerGroundEffectsOnMove:false,triggerGroundEffectsOnStop:false,landingJump:false,
  sprite:{y2:0,centerToCornerVecY:center,priority:2,subspriteMode:1}};
 const fall=new FallWarpAnimation({object:()=>object,screenY:()=>y,preventStep:v=>{prevent=v;},face:d=>{object.facingDirection=d;},weatherFinished:()=>tick>=weather,
  playSound:id=>{lastSound=id;soundCount++;},beginPan:()=>{pan=0;},pan:v=>{pan=v;},finish:()=>{pan=0;surf=wet?8:0;}},scheduler);
 fall.start();
 const record=()=>traces.push([y,center,weather,wet,tick,Number(fall.active),fall.stage,Number(object.invisible),Number(object.fixedPriority),Number(object.triggerGroundEffectsOnMove),Number(object.triggerGroundEffectsOnStop),Number(object.landingJump),object.sprite.y2,object.sprite.priority,object.sprite.subspriteMode,Number(prevent),pan,soundCount,lastSound,surf]);
 record();while(fall.active&&++tick<300){scheduler.run();record();}
 assert.ok(!fall.active);fall.reset();assert.ok(!scheduler.tasks.some(t=>t.isActive));
}
assert.equal(traces.length,native.length);
for(let i=0;i<native.length;i++)assert.deepEqual(traces[i],native[i],`C frame ${i}`);
console.log(`Fall warp native C comparison PASS: ${traces.length} frames, 24 actor/weather/water cases, seven states, visibility/priority/ground flags/shake/completion`);
