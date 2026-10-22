// PREPARED text streams; compile the original Emerald braille command as geometry oracle.
// No raster/audio claim: Window rendering is mocked by setupNodeGbaMock.
import './setupNodeGbaMock.ts';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { rom, setDataRoot, RAM_SCRIPT_BASE, ROM_BASE } from '../../src/core/rom.ts';
import { preloadPacks, loadCData } from '../../src/core/hw/assets.ts';
import { COMMANDS } from '../../src/core/script/commands.ts';
import { ScriptRunner } from '../../src/core/script/context.ts';
import { Window, WindowLayer } from '../../src/core/gba/window.ts';
import { FONT_BRAILLE, GetStringWidth } from '../../src/core/gba/font.ts';
import { encode, stringVars } from '../../src/core/gba/charmap.ts';
import { save, SV, varGet, varSet } from '../../src/games/firered/save.ts';
import { createMon } from '../../src/core/pokemon/pokemon.ts';
import type { Overworld } from '../../src/core/field/overworld.ts';
const originalFetch=globalThis.fetch;
globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>String(input).startsWith('/')&&!existsSync('public'+String(input))?new Response('',{status:404}):originalFetch(input,init)) as typeof fetch;
const source=readFileSync(resolve(process.env.POKEEMERALD??'../refs-src/pokeemerald','src/scrcmd.c'),'utf8');
function body(name:string, src=source):string {
 const m=new RegExp(`^(?:static )?(?:bool8|void) ${name}\\([^;]*?\\)\\s*\\{`,'m').exec(src);assert.ok(m,name);
 let pos=src.indexOf('{',m.index)+1,depth=1;
 while(depth){const c=src[pos++];if(c==='{')depth++;else if(c==='}')depth--;}
 return src.slice(m.index,pos);
}
const dir='.decomp-build/checks/emerald-contracts';mkdirSync(dir,{recursive:true});
writeFileSync(`${dir}/braille.c`,`#include <stdint.h>
#include <stdio.h>
#include <string.h>
typedef uint8_t u8;typedef int32_t s32;typedef u8 bool8;
#define FALSE 0
#define TRUE 1
#define FONT_BRAILLE 6
#define EOS 255
#define CHAR_NEWLINE 254
#define TEXT_SKIP_DRAW 255
#define COPYWIN_FULL 3
#define BG_PLTT_ID(n) ((n)*16)
#define PIXEL_FILL(n) ((n)*17)
struct ScriptContext { int unused; }; struct WindowTemplate {int x,y,w,h;};
u8 input[4096], gStringVar4[4096], sBrailleWindowId;int measuredWidth, tx,ty,closed;
struct WindowTemplate geometry;
uintptr_t ScriptReadWord(struct ScriptContext *ctx){return (uintptr_t)input;}
void StringExpandPlaceholders(u8 *out,const u8 *in){while(*in!=255)*out++=*in++;*out=255;}
int GetStringWidth(int font,const u8 *str,int spacing){return measuredWidth;}
struct WindowTemplate CreateWindowTemplate(int bg,int x,int y,int w,int h,int pal,int base){return (struct WindowTemplate){x,y,w,h};}
u8 AddWindow(const struct WindowTemplate *t){geometry=*t;return 7;}
void LoadUserWindowBorderGfx(int a,int b,int c){} void DrawStdWindowFrame(int a,int b){}
void PutWindowTilemap(int a){} void FillWindowPixelBuffer(int a,int b){}
void AddTextPrinterParameterized(int id,int font,const u8 *str,int x,int y,int speed,void *cb){tx=x;ty=y;}
void CopyWindowToVram(int a,int b){} void ClearStdWindowAndFrame(int id,int copy){closed|=id==7?1:0;}
void RemoveWindow(int id){closed|=id==7?2:0;}
static void CloseBrailleWindow(void);
${body('ScrCmd_braillemessage')}
${body('CloseBrailleWindow')}
${body('ScrCmd_closebraillemessage')}
int main(){int len,v;while(scanf("%d%d",&measuredWidth,&len)==2){for(int i=0;i<len;i++){scanf("%d",&v);input[i]=v;}struct ScriptContext ctx;closed=0;
int result=ScrCmd_braillemessage(&ctx);ScrCmd_closebraillemessage(&ctx);
printf("%d %d %d %d %d %d %d %d\\n",geometry.x,geometry.y,geometry.w,geometry.h,tx,ty,result,closed);}}
`);
const cc=spawnSync('cc',[`${dir}/braille.c`,'-o',`${dir}/braille`],{encoding:'utf8'});assert.equal(cc.status,0,cc.stderr);
setDataRoot('/emerald');await rom.load(); await preloadPacks(['graphics_fonts']); await loadCData('text_printer');
const texts=['', 'A', 'ABC', 'A\nB', 'A\nB\nC\nD\nE\nF', 'A'.repeat(96), Array(87).fill('A').join('\n')];
const exportedScripts=rom.scripts;
const cases=texts.map(text=>{const bytes=encode(text);return {bytes,width:GetStringWidth(FONT_BRAILLE,bytes,-1)};});
const oracle=spawnSync(`${dir}/braille`,[],{encoding:'utf8',input:cases.map(c=>{const bytes=[1,2,3,4,5,6,...c.bytes];return `${c.width} ${bytes.length} ${bytes.join(' ')}`;}).join('\n')});assert.equal(oracle.status,0,oracle.stderr);
const rows=oracle.stdout.trim().split('\n').map(row=>row.split(' ').map(Number));
for(let i=0;i<cases.length;i++){
 const layer=new WindowLayer(); const normal=new Window(0,0,2,2);layer.add(normal);
 const ow={windows:layer} as unknown as Overworld;
 const bytes=new Uint8Array(4096),ptr=ROM_BASE+32;
 bytes.set([ptr&255,(ptr>>>8)&255,(ptr>>>16)&255,ptr>>>24]);
 bytes.set([1,2,3,4,5,6,...cases[i]!.bytes],32);rom.setRamScriptBytes(bytes); rom.scripts = bytes;
 const ctx=new ScriptRunner(ow);ctx.scriptPtr=RAM_SCRIPT_BASE;
 assert.equal(COMMANDS.ScrCmd_braillemessage!(ctx),false);assert.equal(ctx.scriptPtr,RAM_SCRIPT_BASE+4);
 const w=layer.windows[1]!;const expected=rows[i]!;
 assert.deepEqual([w.x,w.y,w.width,w.height],expected.slice(0,4));
 assert.deepEqual(expected.slice(4),[3,8,0,3]);
 assert.deepEqual(stringVars.var4,cases[i]!.bytes);assert.equal(w.frameType,save.options.frameType);
 assert.equal(COMMANDS.ScrCmd_closebraillemessage!(ctx),false);
 assert.deepEqual(layer.windows,[normal]);
}
// Source-exported Island Cave message: locate its actual command+text operand,
// execute it unchanged and close through the exported close-message command.
rom.scripts=exportedScripts;
{
 const start=rom.label('IslandCave_EventScript_CaveEntranceSide'),end=rom.label('IslandCave_EventScript_CloseBrailleMsg');
 const message=rom.label('IslandCave_Braille_RunLapAroundWall');
 const candidates:number[]=[];
 for(let p=start;p<end-4;p++) if(rom.u8(p)===rom.scriptMeta.commands.indexOf('ScrCmd_braillemessage')&&rom.u32(p+1)===message)candidates.push(p);
 assert.equal(candidates.length,1);
 const layer=new WindowLayer(),normal=new Window(0,0,2,2);layer.add(normal);
 const ctx=new ScriptRunner({windows:layer} as unknown as Overworld);ctx.scriptPtr=candidates[0]!+1;
 COMMANDS.ScrCmd_braillemessage!(ctx);
 assert.deepEqual(stringVars.var4,rom.stringAt(message+6));assert.equal(layer.windows.length,2);
 const close=end+1;assert.equal(rom.scriptMeta.commands[rom.u8(close)],'ScrCmd_closebraillemessage');
 ctx.scriptPtr=close+1;COMMANDS.ScrCmd_closebraillemessage!(ctx);assert.deepEqual(layer.windows,[normal]);
}
// Both modern-fateful bodies match FireRed after only the command name changes.
const fr=readFileSync('pokefirered/src/scrcmd.c','utf8');
for(const kind of ['set','check']){
 const normalize=(s:string)=>s.slice(s.indexOf('{')).replace(/\s+/g,'');
 assert.equal(normalize(body(`ScrCmd_${kind}modernfatefulencounter`)),normalize(body(`ScrCmd_${kind}monmodernfatefulencounter`,fr)));
}
save.party=[createMon(1,5),createMon(4,5)];
varSet(SV.x8004,1);
for(const [kind,expected] of [['check',0],['set',0],['check',1]] as const){
 rom.setRamScriptBytes(Uint8Array.from([SV.x8004&255,SV.x8004>>>8]));
 const ctx=new ScriptRunner({} as Overworld);ctx.scriptPtr=RAM_SCRIPT_BASE;
 assert.equal(COMMANDS[`ScrCmd_${kind}modernfatefulencounter`]!(ctx),false);
 assert.equal(ctx.scriptPtr,RAM_SCRIPT_BASE+2);
 if(kind==='check')assert.equal(varGet(SV.RESULT),expected);
}
assert.equal(save.party[0]!.modernFatefulEncounter,undefined);assert.equal(save.party[1]!.modernFatefulEncounter,true);
console.log(`PASS Emerald braille: ${cases.length} cases against original C, isolated close; two fateful aliases source-identical and party selection (PREPARED; no render)`);
