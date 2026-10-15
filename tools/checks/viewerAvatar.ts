// Source-backed avatar selection and cadence; no prepared game progress or terrain.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AvatarAnimator, type AvatarData, type AvatarAction } from "../../src/viewer/render/avatar";
import { registerCData } from "../../src/core/hw/assets";
import type { Direction } from "../../src/viewer/render/sprites";
const source=JSON.parse(readFileSync('public/fr/cdata/event_object_movement.json','utf8'));
registerCData('event_object_movement',source.defs);
const data=JSON.parse(readFileSync('public/fr/objects.json','utf8')) as AvatarData;
const directions: Direction[]=['south','north','west','east'];
let cases=0,frames=0;
for(const char of ['red','leaf'] as const)for(const direction of directions)for(const action of ['walk','run','bike','surf','jump','bump','turn','board','dismount'] as AvatarAction[]){
 const vehicle=action==='bike'?'bike':action==='surf'||action==='board'?'surf':'walk';
 const avatar=new AvatarAnimator(data);avatar.stop(char,vehicle,direction,0);avatar.begin(char,vehicle,direction,action,0);
 const expected=action==='run'?`sAnim_Run${direction[0]!.toUpperCase()+direction.slice(1)}`
  :action==='board'||action==='dismount'?`sAnim_GetOnOffSurf${direction[0]!.toUpperCase()+direction.slice(1)}`
  :action==='surf'?`sAnim_SurfFace${direction[0]!.toUpperCase()+direction.slice(1)}`
  :`sAnim_Go${['bike','turn'].includes(action)?'Fast':''}${direction[0]!.toUpperCase()+direction.slice(1)}`;
 const gfx=Object.values(data.gfx).find(g=>g.name===`OBJ_EVENT_GFX_${char==='red'?'RED':'GREEN'}_${['surf','board','dismount'].includes(action)?'SURF':action==='bike'?'BIKE':'NORMAL'}`)!;
 const animation=data.animTables[gfx.anims]!.indexOf(expected);
 assert.notEqual(animation,-1,expected);
 const allowed=data.anims[expected]!.filter(c=>c[0]==='F');
 const seen=new Set<number>();
 let first: ReturnType<AvatarAnimator["frame"]> | undefined;
 for(let tick=0;tick<64;tick++){
  const frame=avatar.frame(char,vehicle,direction,tick);
  assert.equal(data.animTables[gfx.anims]![frame.animation],expected);
  seen.add(frame.image);
  if(!first)first=frame;
  const elapsed=action==='bump'?Math.ceil(tick/2):tick;
  if(elapsed<=first.delay){ assert.equal(frame.image,first.image);assert.equal(frame.command,first.command);assert.equal(frame.delay,first.delay-elapsed); }
  assert.equal(frame.width,gfx.width);
  assert.equal(frame.height,gfx.height);
  assert.equal(frame.hFlip,direction==='east');
  const logical=allowed.find(c=>c[0]==='F'&&c[1]===frame.image);assert(logical);
  assert.equal(frame.url,`/fr/${gfx.frames[frame.image]![0]}`);
  assert.equal(frame.index,gfx.frames[frame.image]![1]);
  if(action==='run')assert(frame.index>=3&&frame.url.includes('surfrun'));
  frames++;
 }
 assert.deepEqual([...seen].sort((a,b)=>a-b),[...new Set(allowed.map(c=>c[1]))].sort((a,b)=>a-b));
 avatar.stop(char,vehicle,direction,64);
 const stopped=avatar.frame(char,vehicle,direction,64);
 assert.deepEqual(avatar.frame(char,vehicle,direction,100),stopped);cases++;
}
const avatar=new AvatarAnimator(data);
avatar.stop('red','walk','south',0);avatar.begin('red','walk','south','walk',0);
const first=avatar.frame('red','walk','south',0);assert.equal(first.image,4); // SetStepAnimHandleAlternation starts opposite the paused command 1.
avatar.stop('red','walk','south',16);avatar.begin('red','walk','south','walk',16);
assert.equal(avatar.frame('red','walk','south',16).image,3);
assert.deepEqual(['walk','run','bike','surf'].map(kind=>avatar.offsets(kind as AvatarAction).length),[16,8,6,8]);
for(const action of ['walk','run','bike','surf'] as AvatarAction[])assert.equal(avatar.offsets(action).at(-1),16);

avatar.stop('red','bike','west',100);avatar.begin('red','bike','west','bump',100);
assert.equal(data.animTables.sAnimTable_Standard![avatar.frame('red','bike','west',100).animation],'sAnim_GoWest');
console.log(`Avatar PASS: ${cases} source selections, ${frames} frame samples, pause, foot alternation and C speed tables`);
