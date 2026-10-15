import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { ElevatorAnimation } from '../../src/core/field/elevatorAnimation';
import { TaskManager } from '../../src/core/gba/tasks';
import { registerCData } from '../../src/core/hw/assets';
registerCData('field_specials', JSON.parse(readFileSync('public/fr/cdata/field_specials.json', 'utf8')).defs);
const native = JSON.parse(execFileSync('python3', ['tools/checks/clangElevator.py'], {encoding:'utf8', maxBuffer:32e6})) as number[][];
const traces: number[][] = [];
const values = [0,1,2,3,4,7,8,9,14,15,65535];
// PREPARED external operations match the C harness. These are task traces, not gameplay.
for (const from of values) for (const to of values) {
  const scheduler = new TaskManager();
  let pan=0,stop=0,restore=0,resume=0,sound=0,draw=0,writes=0,hash=0;
  const animation = new ElevatorAnimation({
    stopCameraPanning:()=>{stop++;},pan:(_x,y)=>{pan=y;},restoreCameraPanning:()=>{restore++;},resumeScript:()=>{resume++;},
    playSE:id=>{sound=id;},setMetatile:(x,y,v)=>{writes++;hash=(hash*31+x*17+y*13+v)&0xffff;},drawMap:()=>{draw++;},
  }, scheduler);
  animation.AnimateElevator(from,to);
  for(let frame=0;frame<220;frame++) {
    const active=scheduler.tasks.filter(t=>t.isActive);
    traces.push([from,to,frame,active.length,pan,stop,restore,resume,sound,draw,writes,hash,+active.some(t=>t.priority===8)]);
    if(!active.length)break;
    scheduler.run();
  }
  assert.equal(scheduler.tasks.filter(t=>t.isActive).length,0);
  assert.equal(resume,1); assert.equal(restore,1);
}
assert.deepEqual(traces,native);
console.log(`Elevator native C comparison PASS: ${values.length**2} cases, ${traces.length} frames (both directions, same floor, clamp to eight floors, camera/audio/map/script timing)`);
