// PREPARED objects and argument streams. This checks the bytecode boundary, not
// frames, collision or audiovisual equivalence of every shared action backend.
import './setupNodeGbaMock.ts';
import assert from 'node:assert/strict';
import { rom, ROM_BASE, setDataRoot } from '../../src/core/rom.ts';
import { tasks } from '../../src/core/gba/tasks.ts';
import { ScriptMovement } from '../../src/core/script/movement.ts';
import { EMERALD_SHARED_MOVEMENT_ACTIONS, EMERALD_REGIONAL_MOVEMENT_ACTIONS } from '../../src/games/emerald/generated/movementContract.ts';
import { emeraldMovement, translateEmeraldMovementAction } from '../../src/games/emerald/rotatingTileMovement.ts';
import * as EM from '../../src/games/emerald/generated/constants.ts';
import * as FR from '../../src/games/firered/generated/constants.ts';
import type { ObjectEvent } from '../../src/core/field/objectEvents.ts';
import type { Overworld } from '../../src/core/field/overworld.ts';
function host() {
 const object={heldMovementActive:false,localId:1} as ObjectEvent, seen:number[]=[];
 let frozen=0;
 const ow={objects:{objects:[object],externalMovementActions:new Map(),indexOf:()=>0,
   setHeldMovement:(_object:ObjectEvent,id:number)=>{seen.push(id);return false;},
   freeze:()=>{frozen++;},unfreeze:()=>{}},game:{}} as unknown as Overworld;
 const driver=new ScriptMovement(ow);ow.game.scriptMovement=driver;
 return {ow,driver,object,seen,frozen:()=>frozen};
}
setDataRoot('/emerald');tasks.reset();
const shared=[...EMERALD_SHARED_MOVEMENT_ACTIONS].filter(([id])=>id!==EM.MOVEMENT_ACTION_STEP_END);
const a=host();rom.scripts=Uint8Array.from([...shared.map(([id])=>id),EM.MOVEMENT_ACTION_STEP_END]);
assert.equal(a.driver.start(a.object,ROM_BASE),false);
for(let i=0;i<=shared.length;i++)a.driver.ScriptMovement_MoveObjects(a.driver.GetMoveObjectsTaskId());
assert.deepEqual(a.seen,shared.map(([,id])=>id));assert.equal(a.frozen(),1);
assert.equal(a.driver.GetMovementScript(0),ROM_BASE+shared.length);
assert.equal(a.driver.isFinished(a.object),true);
assert.equal(emeraldMovement(a.ow),emeraldMovement(a.ow));
// Reject a missing regional body anywhere in the script, before even the first valid action runs.
let rejected=0;
for(const [id,reason] of EMERALD_REGIONAL_MOVEMENT_ACTIONS){
 if(id===EM.MOVEMENT_ACTION_LOCK_ANIM||id===EM.MOVEMENT_ACTION_UNLOCK_ANIM)continue;
 const h=host();rom.scripts=Uint8Array.from([EM.MOVEMENT_ACTION_WALK_NORMAL_RIGHT,id,EM.MOVEMENT_ACTION_STEP_END]);
 assert.throws(()=>h.driver.start(h.object,ROM_BASE),/Unsupported Emerald movement/);
 assert.equal(h.driver.GetMoveObjectsTaskId(),255,reason);assert.deepEqual(h.seen,[]);rejected++;
}
// The source terminator is mandatory; an out-of-ROM 0xff is not another action.
const truncated=host();rom.scripts=Uint8Array.from([EM.MOVEMENT_ACTION_WALK_NORMAL_DOWN]);
assert.throws(()=>truncated.driver.start(truncated.object,ROM_BASE),/unknown source action/);
const internal=host();const lock=translateEmeraldMovementAction(EM.MOVEMENT_ACTION_LOCK_ANIM);
assert.ok(lock>255);internal.driver.startBytes(internal.object,[lock,FR.MOVEMENT_ACTION_STEP_END]);
internal.driver.ScriptMovement_MoveObjects(internal.driver.GetMoveObjectsTaskId());assert.deepEqual(internal.seen,[lock]);
// FireRed and internal scripts keep their existing dispatcher namespace.
setDataRoot('/fr');const fr=host();rom.scripts=Uint8Array.from([FR.MOVEMENT_ACTION_WALK_FAST_DOWN,FR.MOVEMENT_ACTION_STEP_END]);
fr.driver.start(fr.object,ROM_BASE);fr.driver.ScriptMovement_MoveObjects(fr.driver.GetMoveObjectsTaskId());
assert.deepEqual(fr.seen,[FR.MOVEMENT_ACTION_WALK_FAST_DOWN]);
assert.ok(shared.some(([e,f])=>e!==f),'fixture must exercise divergent numeric IDs');
console.log(`PASS movement boundary: ${shared.length} source-compared action IDs; ${rejected} missing regional bodies rejected before scheduling; internal/FireRed regressions (PREPARED; not action parity)`);
