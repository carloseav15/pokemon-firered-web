// PREPARED argument streams; original C command/helper bodies are the oracle.
// Exported source scripts are also executed up to their first non-text command, without render.
import './setupNodeGbaMock.ts';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { b64, RAM_SCRIPT_BASE, rom, setDataRoot } from '../../src/core/rom.ts';
import { ScriptRunner } from '../../src/core/script/context.ts';
import { COMMANDS } from '../../src/core/script/commands.ts';
import { encode, expandPlaceholders, stringVars } from '../../src/core/gba/charmap.ts';
import { newSaveData, setSave, varSet, varGet } from '../../src/games/firered/save.ts';
import { GetTrainerClassNameFromId, GetTrainerNameFromId } from '../../src/games/emerald/scriptText.ts';
import * as C from '../../src/games/emerald/generated/constants.ts';
import type { Overworld } from '../../src/core/field/overworld.ts';
const fetchFile=globalThis.fetch;
globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>String(input).startsWith('/')&&!existsSync('public'+String(input))?new Response('',{status:404}):fetchFile(input,init)) as typeof fetch;
setDataRoot('/emerald'); await rom.load(); setSave(newSaveData());
const decomp=process.env.POKEEMERALD??resolve('../refs-src/pokeemerald');
function body(file:string,name:string):string {
 const src=readFileSync(resolve(decomp,`src/${file}`),'utf8');
 const start=src.search(new RegExp(`^(?:const u8 \\*|bool8 |void )${name}\\(`,'m')); assert.ok(start>=0,name);
 let end=src.indexOf('{',start),depth=1;for(end++;depth;end++){if(src[end]==='{')depth++;else if(src[end]==='}')depth--;}
 return src.slice(start,end);
}
const dir='.decomp-build/checks/emerald-text';mkdirSync(dir,{recursive:true});
const arrays=(name:string,values:Uint8Array[])=>values.map((v,i)=>`static const u8 ${name}_${i}[]={${[...v]}};`).join('\n')+`\nstatic const u8 *${name}[]={${values.map((_,i)=>`${name}_${i}`).join(',')}};\n`;
const kinds=['buffertrainerclassname','buffertrainername','buffercontestname','bufferdecorationname','bufferstdstring','bufferitemnameplural'];
let source=`#include <stdint.h>\n#include <stdio.h>\n#include <string.h>\ntypedef uint8_t u8;typedef uint16_t u16;typedef uint32_t u32;typedef u8 bool8;\n#define FALSE 0\n#define CHAR_SPACE ${encode(' ')[0]}\n`;
for(const k of ['TRAINERS_COUNT','TRAINER_NONE','ITEM_POKE_BALL','FIRST_BERRY_INDEX','LAST_BERRY_INDEX'])source+=`#define ${k} ${(C as Record<string,number>)[k]}\n`;
source+=arrays('names',rom.trainers.map(t=>b64(t.name)))+arrays('gTrainerClassNames',rom.trainerClasses.map(b64));
source+=`struct {u16 trainerClass;const u8 *trainerName;} gTrainers[]={${rom.trainers.map((t,i)=>`{${t.class},names_${i}}`).join(',')}};\n`;
source+=arrays('contest',rom.scriptMenu.contestNames!.map(n=>rom.text(n)))+'#define sContestNames contest\n';
source+=arrays('decor',rom.scriptMenu.decorationNames!.map(b64))+`struct {const u8 *name;} gDecorations[]={${rom.scriptMenu.decorationNames!.map((_,i)=>`{decor_${i}}`).join(',')}};\n`;
source+=arrays('gStdStrings',rom.scriptMenu.stdStrings.map(n=>rom.text(n)))+arrays('items',rom.items.map(i=>b64(i.name)));
source+=arrays('berries',rom.scriptMenu.berryNames!.map(b64))+`struct {const u8 *name;} gBerries[]={${rom.scriptMenu.berryNames!.map((_,i)=>`{berries_${i}}`).join(',')}};\n`;
for(const k of ['gText_PokeBalls','gText_Berry','gText_Berries'])source+=`static const u8 ${k}[]={${[...rom.text(k)]}};\n`;
source+=`u8 *StringCopy(u8 *d,const u8 *s){while(*s!=255)*d++=*s++;*d=255;return d;}\nconst u8 *GetItemName(u16 id){return items[id<${rom.items.length}?id:0];}\nvoid GetBerryCountString(u8 *,const u8 *,u32);\nstruct ScriptContext {u8 *p;}; u8 ScriptReadByte(struct ScriptContext *c){return *c->p++;}\nu16 ScriptReadHalfword(struct ScriptContext *c){u16 n=c->p[0]|c->p[1]<<8;c->p+=2;return n;}\nu16 special;u16 VarGet(u16 n){return n==0x8004?special:n;}\nu8 buffers[3][256];u8 *sScriptStringVars[]={buffers[0],buffers[1],buffers[2]};\n`;
for(const n of ['GetTrainerClassNameFromId','GetTrainerNameFromId'])source+=body('pokemon.c',n);
source+=body('lilycove_lady.c','BufferContestName');
for(const n of ['CopyItemNameHandlePlural','GetBerryCountString'])source+=body('item.c',n);
for(const n of kinds)source+=body('scrcmd.c',`ScrCmd_${n}`);
source+=`int main(){int k,i,v,q,indirect;while(scanf("%d%d%d%d%d",&k,&i,&v,&q,&indirect)==5){memset(buffers,255,sizeof(buffers));special=v;u16 arg=indirect?0x8004:v;u8 args[]={i,arg&255,arg>>8,q&255,q>>8};struct ScriptContext c={args};switch(k){${kinds.map((n,i)=>`case ${i}:ScrCmd_${n}(&c);break;`).join('')}}printf("%ld",c.p-args);for(int j=0;j<3;j++){printf("|");for(int x=0;x<256;x++){printf("%02x",buffers[j][x]);if(buffers[j][x]==255)break;}}puts("");}}`;
writeFileSync(`${dir}/oracle.c`,source);
const cc=spawnSync('cc',['-std=c99','-w',`${dir}/oracle.c`,'-o',`${dir}/oracle`],{encoding:'utf8'});assert.equal(cc.status,0,cc.stderr);
const cases:number[][]=[];
for(let k=0;k<kinds.length;k++){
 const values=k<2?[...rom.trainers.keys(),C.TRAINERS_COUNT,65535]:k===2?[0,1,2,3,4,256,260]:k===3?[...rom.scriptMenu.decorationNames!.keys()]:k===4?[...rom.scriptMenu.stdStrings.keys()]:[0,rom.c('ITEM_POKE_BALL'),rom.c('ITEM_POTION'),...Array.from({length:C.LAST_BERRY_INDEX-C.FIRST_BERRY_INDEX+1},(_,i)=>C.FIRST_BERRY_INDEX+i)];
 for(const v of values)for(const indirect of [0,1])for(const q of k===5?[0,1,2,65535]:[0])cases.push([k,v%3,v,q,indirect]);
}
const c=spawnSync(`${dir}/oracle`,[],{input:cases.map(x=>x.join(' ')).join('\n'),encoding:'utf8',maxBuffer:4e6});assert.equal(c.status,0,c.stderr);const lines=c.stdout.trim().split('\n');assert.equal(lines.length,cases.length);
const opcode=(n:string)=>{const id=rom.scriptMeta.commands.indexOf(`ScrCmd_${n}`);assert.ok(id>=0,n);return id;};
const hex=(b:Uint8Array)=>Buffer.from(b).toString('hex');
for(let n=0;n<cases.length;n++){
 const [k,i,v,q,indirect]=cases[n]!;const arg=indirect?0x8004:v!;varSet(0x8004,v!);stringVars.var1=encode('');stringVars.var2=encode('');stringVars.var3=encode('');
 const args=[i!,arg!&255,arg!>>8];if(k===5)args.push(q!&255,q!>>8);
 // PREPARED RAM script includes a real trailing command: detects wrong argument length/alignment.
 rom.setRamScriptBytes(Uint8Array.from([opcode(kinds[k!]!),...args,opcode('setvar'),0x05,0x80,0x37,0x12,opcode('end')]));
 const ctx=new ScriptRunner({} as Overworld);ctx.SetupBytecodeScript(RAM_SCRIPT_BASE);ctx.RunScriptCommand();assert.equal(varGet(0x8005),0x1237);
 const actual=`${args.length}|${hex(stringVars.var1)}|${hex(stringVars.var2)}|${hex(stringVars.var3)}`;assert.equal(actual,lines[n],`C oracle ${cases[n]}`);
 varSet(0x8005,0); // PREPARED reset the sentinel before the next input; bytecode must change it.
}
// Trainer helpers narrow the u16 ABI before bounds checking.
assert.deepEqual(GetTrainerNameFromId(65536),GetTrainerNameFromId(0));assert.deepEqual(GetTrainerClassNameFromId(-1),GetTrainerClassNameFromId(0));
// Real source script consumers: execute the text prefix, then stop before unrelated UI/specials.
for(const [label,vars,commands] of [
 ['Std_RegisteredInMatchCall',[[0x8000,rom.c('TRAINER_ROXANNE_1')]],['buffertrainerclassname','buffertrainername']],
 ['ContestHall_EventScript_ContestGettingStarted',[[0x8008,4],[0x8009,8]],['buffercontestname','bufferstdstring']],
] as const){
 for(const [v,value] of vars)varSet(v,value);const ctx=new ScriptRunner({} as Overworld);ctx.SetupBytecodeScript(rom.label(label));
 for(const name of commands){assert.equal(rom.u8(ctx.scriptPtr++),opcode(name));assert.equal(COMMANDS[`ScrCmd_${name}`]!(ctx),false);}
 if(label.startsWith('Std_')){assert.deepEqual(stringVars.var1,GetTrainerClassNameFromId(vars[0][1]));assert.deepEqual(stringVars.var2,GetTrainerNameFromId(vars[0][1]));}
 else{assert.deepEqual(stringVars.var2,rom.text(rom.scriptMenu.contestNames![4]!));assert.deepEqual(stringVars.var3,rom.text(rom.scriptMenu.stdStrings[8]!));}
}
// Source decoration consumer: run its two setvar commands and name buffer, then stop before goto/UI.
for(const label of ['Route113_GlassWorkshop_EventScript_GivePrettyChair','Route113_GlassWorkshop_EventScript_GivePrettyDesk']){
 const ctx=new ScriptRunner({} as Overworld);ctx.SetupBytecodeScript(rom.label(label));
 for(const name of ['setvar','setvar','bufferdecorationname']){
  assert.equal(rom.u8(ctx.scriptPtr++),opcode(name));assert.equal(COMMANDS[`ScrCmd_${name}`]!(ctx),false);
 }
 assert.deepEqual(stringVars.var1,b64(rom.scriptMenu.decorationNames![varGet(0x8008)]!));
}
// vbuffermessage expands placeholders immediately; vbufferstring retains them. Both C bodies read a word.
const text=rom.label('gText_RegisteredTrainerinPokeNav');stringVars.var1=encode('CLASS');stringVars.var2=encode('NAME');
for(const name of ['vbuffermessage','vbufferstring']){
 const args=name==='vbufferstring'?[2]:[];args.push(text&255,(text>>>8)&255,(text>>>16)&255,text>>>24);
 rom.setRamScriptBytes(Uint8Array.from(args));const ctx=new ScriptRunner({} as Overworld);ctx.scriptPtr=RAM_SCRIPT_BASE;
 COMMANDS[`ScrCmd_${name}`]!(ctx);assert.equal(ctx.scriptPtr-RAM_SCRIPT_BASE,args.length);
 assert.deepEqual(name==='vbuffermessage'?stringVars.var4:stringVars.var3,name==='vbuffermessage'?expandPlaceholders(rom.stringAt(text)):rom.stringAt(text));
}
// A relocated virtual text pointer must subtract setvaddress's offset before reading ROM.
const delta=256,virtual=RAM_SCRIPT_BASE+delta,ptr=text+delta;
const word=(n:number)=>[n&255,(n>>>8)&255,(n>>>16)&255,n>>>24];
rom.setRamScriptBytes(Uint8Array.from([opcode('setvaddress'),...word(virtual),opcode('vbuffermessage'),...word(ptr),opcode('end')]));
const relocated=new ScriptRunner({} as Overworld);relocated.SetupBytecodeScript(RAM_SCRIPT_BASE);relocated.RunScriptCommand();
assert.deepEqual(stringVars.var4,expandPlaceholders(rom.stringAt(text)));
console.log(`check:emerald-script-text PASS: ${cases.length} PREPARED C-oracle command cases, four source script prefixes, virtual buffers; no render/campaign claim`);
