import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {TeleportAnimation,type TeleportObject} from '../../src/core/field/teleportAnimation';
import {TaskManager} from '../../src/core/gba/tasks';
// PREPARED callbacks deliberately match the C harness; no gameplay claim.
const native=JSON.parse(execFileSync('python3',['tools/checks/clangTeleportAnims.py'],{encoding:'utf8',maxBuffer:8e6})) as number[][];
const traces:number[][]=[];
for(let direction=1;direction<=4;direction++)for(const screenY of [32,80,172])for(const delay of [0,3]){
 let tick=0;const scheduler=new TaskManager();
 const object:TeleportObject={facingDirection:direction,fixedPriority:false,sprite:{y2:0,priority:2,subpriority:80,subspriteMode:1}};
 const animation=new TeleportAnimation({object:()=>object,screenY:()=>screenY,clearHeldMovement:()=>tick>=delay,
  heldMovementFinished:()=>tick%17!==8&&tick%17!==9,face:d=>{object.facingDirection=d;}},scheduler);
 for(let phase=0;phase<2;phase++){
  object.facingDirection=phase?1:direction;object.fixedPriority=false;
  Object.assign(object.sprite,{y2:0,priority:2,subpriority:80,subspriteMode:1});tick=0;
  if(phase)animation.StartTeleportInPlayerAnim();else animation.StartTeleportWarpOutPlayerAnim();
  const active=()=>phase?animation.WaitTeleportInPlayerAnim():animation.WaitTeleportWarpOutPlayerAnim();
  const record=()=>traces.push([direction,screenY,delay,phase,tick,Number(active()),object.facingDirection,screenY+object.sprite.y2,
   object.sprite.priority,object.sprite.subpriority,Number(object.fixedPriority),object.sprite.subspriteMode]);
  record();while(active()&&++tick<400){scheduler.run();record();}
  assert.ok(!active(),'native task must terminate');
 }
 animation.reset();assert.ok(!scheduler.tasks.some(t=>t.isActive));
}
assert.equal(traces.length,native.length);
for(let i=0;i<native.length;i++)assert.deepEqual(traces[i],native[i],`C frame ${i}`);
console.log(`Teleport native C comparison PASS: ${traces.length} frames, 24 actor/guard cases, out/in, directions/priorities/offsets/completion`);
