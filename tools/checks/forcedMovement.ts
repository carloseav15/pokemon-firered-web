import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {ForcedMovement,type ForcedObject,type ForcedAction} from '../../src/core/field/forcedMovement';
import * as C from '../../src/games/firered/generated/constants';
const native=JSON.parse(execFileSync('python3',['tools/checks/clangForcedMovement.py'],{encoding:'utf8',maxBuffer:16e6})) as number[][];
let index=0;
// PREPARED external callbacks match the native harness; no map/gameplay claim.
for(let b=0;b<256;b++)for(let f=0;f<4;f++)for(let d=1;d<=4;d++)for(const collision of [0,1,5,6,7,8])for(let held=0;held<2;held++){
 const state={flags:(f&1?C.PLAYER_AVATAR_FLAG_CONTROLLABLE:0)|(f&2?C.PLAYER_AVATAR_FLAG_FORCED:0),lastSpinTile:f&2?C.MB_SPIN_RIGHT:0,runningState:0};
 const o:ForcedObject={currentMetatileBehavior:b,heldMovementFinished:!!held,movementDirection:d,facingDirection:d,facingDirectionLocked:true,disableAnim:true,enableAnim:false};
 let action=0,actionDir=0,sound=0,clear=0,set=0,collisions=0;
 const actions:ForcedAction[]=['PlayerWalkFast','PlayerWalkNormal','PlayerRideWaterCurrent','PlayerGoSpin','PlayerJumpLedge'];
 const controller=new ForcedMovement(state,{object:()=>o,clearHeldMovement:()=>{clear++;o.heldMovementFinished=false;},
  setDirection:dir=>{set++;o.movementDirection=dir;if(!o.facingDirectionLocked)o.facingDirection=dir;},
  collision:()=>{collisions++;return collision;},move:(a,dir)=>{action=actions.indexOf(a)+1;actionDir=dir;},
  spinSound:()=>{sound++;},matJump:()=>{action=6;},matSpin:()=>{action=7;}});
 const spin=controller.TryUpdatePlayerSpinDirection();let result=spin;
 if(!spin){o.disableAnim=false;o.facingDirectionLocked=false;result=controller.TryDoMetatileBehaviorForcedMovement();}
 const trace=[b,f,d,collision,held,+spin,+result,state.flags,state.lastSpinTile,state.runningState,o.movementDirection,o.facingDirection,+o.facingDirectionLocked,+o.disableAnim,+o.enableAnim,action,actionDir,sound,clear,set,collisions];
 assert.deepEqual(trace,native[index],`C dispatch case ${index}`);index++;
}
assert.equal(index,native.length);
console.log(`Forced movement native C comparison PASS: ${index} cases, all 256 behaviors, four directions/flags, six collisions, held guard; actions/sounds/flags/spin persistence`);
