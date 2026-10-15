import assert from 'node:assert/strict';
import { PaletteFade, RGB_BLACK, RGB_WHITE } from '../../src/core/gba/fade';
// palette.c BeginNormalPaletteFade applies BG immediately; UpdateNormalPaletteFade
// alternates BG/OBJ, then IsSoftwarePaletteFadeFinishing waits counter values 0..4.
for(const [delay,ticks] of [[0,22],[3,46],[-2,14]]) {
 const fade=new PaletteFade();assert.equal(fade.begin(delay,0,16,RGB_BLACK),true);
 assert.equal(fade.begin(delay,0,16,RGB_WHITE),false,'active fade rejects replacement');
 let count=0;const levels=new Set([fade.level]);
 while(fade.active&&count<100){fade.update();count++;levels.add(fade.level);}
 assert.equal(count,ticks,`C cadence delay ${delay}`);assert.equal(fade.level,16);
 assert.deepEqual([...levels],delay<0?[0,4,8,12,16]:[0,2,4,6,8,10,12,14,16]);
 assert.equal(fade.begin(delay,16,0,RGB_WHITE),true);count=0;
 while(fade.active&&count<100){fade.update();count++;}
 assert.equal(count,ticks);assert.equal(fade.level,0);
}
console.log('Palette BG/OBJ cadence and five finishing calls PASS (palette.c)');
