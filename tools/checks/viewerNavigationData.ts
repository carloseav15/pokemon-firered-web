// Source-export census for the Kanto navigation review. No map or save is modified.
import { readFileSync } from "node:fs";
import * as MB from "../../src/games/firered/generated/metatileBehavior";
import type { MapHeader } from "../../src/core/rom";
const root=process.cwd()+"/public/fr/";
const read=(path:string)=>JSON.parse(readFileSync(root+path,"utf8"));
const exterior=JSON.parse(readFileSync(process.cwd()+"/public/viewer/kanto.json","utf8"));
const queue=Object.keys(exterior.maps),seen=new Set<string>(),unresolved:unknown[]=[];
const attrs=new Map<string,Uint32Array>();
function attributes(id:string):Uint32Array{
 let a=attrs.get(id);if(a)return a;
 const b=Buffer.from(read(`tilesets/${id}.json`).attributes,"base64");a=Uint32Array.from({length:b.length/4},(_,i)=>b.readUInt32LE(i*4));attrs.set(id,a);return a;
}
const predicates={grass:MB.MetatileBehavior_IsTallGrass,sand:MB.MetatileBehavior_IsSand,
 ripple:MB.MetatileBehavior_HasRipples,puddle:MB.MetatileBehavior_IsPuddle,flowing:MB.MetatileBehavior_IsShallowFlowingWater,
 ice:MB.MetatileBehavior_IsIce,reflective:MB.MetatileBehavior_IsReflective,
 southBlocked:MB.MetatileBehavior_IsSouthBlocked,northBlocked:MB.MetatileBehavior_IsNorthBlocked,
 eastBlocked:MB.MetatileBehavior_IsEastBlocked,westBlocked:MB.MetatileBehavior_IsWestBlocked};
const forced=read("cdata/field_player_avatar.json").defs.sForcedMovementFuncs.value as Array<[{$sym?:string}|number,{$sym?:string}]>;
const all=Object.entries(predicates).concat(forced.flatMap(f=>{
   const name=typeof f[0]==='object'?f[0].$sym:undefined;
   const fn=name?(MB as Record<string,unknown>)[name]:null;
   if(name&&typeof fn!=='function')throw Error(`Missing native metatile predicate ${name}`);
   return typeof fn==='function'?[[f[1].$sym!,fn as (b:number)=>boolean]]:[];
  }));
const features:Record<string,{count:number;walkable:number;walkableExample:unknown;maps:Set<string>;example:unknown}>={};
const elevations:Record<number,number>={},layers:Record<number,number>={};let warps=0;
while(queue.length){
 const id=queue.shift()!;if(seen.has(id))continue;seen.add(id);
 const map=read(`maps/${id}.json`) as MapHeader,l=read(`layouts/${map.layout}.json`),b=Buffer.from(l.blocks,"base64"),pa=attributes(l.primary),sa=attributes(l.secondary);
 for(let i=0;i<b.length/2;i++){
  const block=b.readUInt16LE(i*2),mt=block&1023,attribute=mt<640?pa[mt]:sa[mt-640],behavior=attribute&511;
  for(const [name,fn]of all)if(fn(behavior)){
   const row=features[name]??={count:0,walkable:0,walkableExample:null,maps:new Set(),example:{map:id,x:i%l.width,y:Math.floor(i/l.width),behavior,metatile:mt}};
   row.count++;row.maps.add(id);
   if((block&0xc00)===0){row.walkable++;row.walkableExample??={map:id,x:i%l.width,y:Math.floor(i/l.width),behavior,metatile:mt};}
  }
  if((block&0xc00)===0)elevations[block>>>12]=(elevations[block>>>12]??0)+1;
  layers[(attribute>>>29)&3]=(layers[(attribute>>>29)&3]??0)+1;
 }
 map.warps.forEach((w,i)=>{
  warps++;
  if(!w.destMap.startsWith('MAP_')||w.destMap==='MAP_UNDEFINED'||w.destMap==='MAP_DYNAMIC'){unresolved.push({map:id,warp:i,...w});return;}
  queue.push(w.destMap);
 });
 for(const c of map.connections)queue.push(c.map);
}
console.log(JSON.stringify({maps:seen.size,interiors:seen.size-Object.keys(exterior.maps).length,warps,elevations,layers,
 features:Object.fromEntries(Object.entries(features).map(([k,v])=>[k,{...v,maps:[...v.maps]}])),unresolved},null,2));
