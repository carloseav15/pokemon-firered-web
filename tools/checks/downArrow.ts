// Run from the repository root:
// npm run check:arrow

import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { TextPrinter, textFlags } from '../../src/fr/gba/textPrinter.ts';
import { rom } from '../../src/fr/rom.ts';
const root=process.cwd()+'/public/fr/';
rom.fonts=JSON.parse(readFileSync(root+'gfx/fonts.json','utf8'));
const index=JSON.parse(readFileSync(root+'incbin/index.json','utf8'));
const table=Object.values(index).find((v:any)=>v.sDownArrowTiles) as any;
const [pack,offset,size]=table.sDownArrowTiles;
const tiles=readFileSync(root+'incbin/'+pack+'.bin').subarray(offset,offset+size);
let compared=0;
for(const alternate of [false,true]) for(let frame=0;frame<4;frame++){
 const pixels=new Uint8Array(120);
 const surface:any={fillRect:(c:number)=>pixels.fill(c),blit:(src:any,width:number,sx:number,sy:number,dx:number,dy:number,w:number,h:number,transparent:boolean)=>{
 for(let y=0;y<h;y++)for(let x=0;x<w;x++) {const v=src[(sy+y)*width+sx+x];assert.notEqual(v,undefined);if(!transparent||v!==0)pixels[y*10+x]=v;}
 }};
 const printer:any=new TextPrinter(surface,1,[255],{speed:1,bg:1});
 printer.downArrowIndex=frame;textFlags.useAlternateDownArrow=alternate;printer.drawDownArrow();
 for(let y=0;y<12;y++)for(let x=0;x<10;x++){
 const sx=[0,16,32,16][frame]+x;
 const address=(alternate?256:0)+(Math.floor(y/8)*16+Math.floor(sx/8))*32+(y%8)*4+Math.floor((sx%8)/2);
 const v=(tiles[address]>>((sx&1)*4))&15;
 assert.equal(pixels[y*10+x],v||1);compared++;
 }
 assert.ok(pixels.some(v=>v!==1));
 const before=pixels.slice();for(let i=0;i<8;i++)printer.drawDownArrow();assert.deepEqual(pixels,before);
}
console.log(`PASS: ${compared} pixels match C tile addressing; both variants, four frames, eight delay ticks.`);
