// load_save.c fixed-slot copy, compared with the source struct's complete field list.
import './setupNodeGbaMock.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gObjectEvents, ObjectEvent } from '../../src/fr/field/objectEvents.ts';
import { save } from '../../src/fr/save.ts';
import { SaveObjectEvents, LoadObjectEvents, HasSavedObjectEvents } from '../../src/fr/loadSave.ts';
import * as C from '../../src/fr/generated/constants.ts';

const header=readFileSync('pokefirered/include/global.fieldmap.h','utf8');
const body=header.split('struct ObjectEvent\n{')[1].split('\n};')[0];
const fields=[...body.matchAll(/\b(?:u32|u16|u8|struct Coords16)\s+(\w+)(?:\s*:\s*\d+)?\s*;/g)].map(m=>m[1]);
const alias:Record<string,string>={trainerRange_berryTreeId:'trainerRange'};
for(let i=0;i<C.OBJECT_EVENTS_COUNT;i++) {
  const o=gObjectEvents[i]=new ObjectEvent();
  o.active=i===3; o.movementType=i===3?C.MOVEMENT_TYPE_PLAYER:C.MOVEMENT_TYPE_NONE;
  o.localId=i; o.currentCoords={x:i-8,y:300+i}; o.previousCoords={x:-32768,y:32767};
  o.initialCoords={x:4,y:9}; o.hideReflection=true; o.invisible=true; o.heldMovementActive=true;
  o.trainerRange=255; o.directionSequenceIndex=17;
}
SaveObjectEvents();
assert.equal(save.objectEvents?.length,C.OBJECT_EVENTS_COUNT);
for(const field of fields) assert.ok(Object.hasOwn(save.objectEvents![3],alias[field]??field),'missing C field '+field);
assert.ok(HasSavedObjectEvents());
const original=JSON.stringify(save.objectEvents);
gObjectEvents[3].currentCoords.x=99;gObjectEvents[3].active=false;
assert.equal(JSON.stringify(save.objectEvents),original,'snapshot aliases live state');
LoadObjectEvents();
assert.equal(gObjectEvents[3].currentCoords.x,-5);
assert.deepEqual(gObjectEvents[0].previousCoords,{x:-32768,y:32767},'inactive slot lost signed coordinates');
assert.equal(gObjectEvents[3].hideReflection,true);
assert.equal(gObjectEvents[3].heldMovementActive,true,'LoadObjectEvents must not apply field-return resets');
gObjectEvents[3].previousCoords.x=42;
assert.equal(JSON.stringify(save.objectEvents),original,'restoration aliases saved state');
save.objectEvents![3].rangeX=16;
assert.equal(HasSavedObjectEvents(),false,"out-of-domain GBA nibble accepted");
save.objectEvents![3].rangeX=0;
save.objectEventsVersion=undefined;
assert.equal(HasSavedObjectEvents(),false,'legacy partial snapshots must not be restored');
assert.throws(()=>LoadObjectEvents(),/no complete/);
console.log('PASS: all '+fields.length+' C fields, 16 slots, detached save/load, signed coords and legacy rejection');
