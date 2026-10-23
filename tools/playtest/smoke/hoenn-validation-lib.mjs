// Shared Chromium helpers for the Hoenn validation jobs: state readout, key presses, settle loop, Save/Continue and a
// PREPARED placement (stored Kanto trainer lab-done, then the trainer is put at a map-local tile of the Hoenn bank).
import { readFileSync } from 'node:fs';
export const assert=(v,m)=>{if(!v)throw Error(m);};
export function kit(ctx){
 const p=ctx.page,base=process.env.PW_BASE??'http://localhost:5174/';
 const missing=[];p.on('console',m=>{if(/not implemented|script command|Unsupported/i.test(m.text()))missing.push(m.text());});
 p.on('pageerror',e=>missing.push('pageerror '+String(e)));
 const state=()=>p.evaluate(async()=>{
  const S=await import('/src/games/firered/save.ts');const {gMain}=await import('/src/core/hw/runtime.ts');
  const T=await import('/src/core/gba/tasks.ts');
  const h=new URLSearchParams(location.hash.slice(1));
  return {x:Number(h.get('px')),y:Number(h.get('py')),map:h.get('mapa'),busy:document.querySelector('#content')?.getAttribute('aria-busy')==='true',battle:gMain.inBattle,
   tasks:T.tasks.tasks.filter(t=>t.isActive).map(t=>t.func.name),
   open:!!document.querySelector('#engine-interaction')&&!document.querySelector('#engine-interaction').hidden,save:JSON.parse(JSON.stringify(S.save))};
 });
 const ready=()=>p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length,null,{timeout:60000});
 const press=async(key,ms=420)=>{await p.keyboard.press(key);await p.waitForTimeout(ms);};
 const fight=async()=>{for(let i=0;i<4000;i++){const s=await state();if(!s.battle)return;await p.keyboard.press('z');await p.waitForTimeout(180);}throw Error('Battle did not finish');};
 const settle=async(max=400)=>{for(let i=0;i<max;i++){const s=await state();if(s.battle){await fight();continue;}if(!s.open&&!s.busy&&!s.tasks.length)return s;await press('z');}throw Error('Field did not unlock');};
 const save=async()=>{await settle();await p.getByRole('button',{name:'Menu · Esc',exact:true}).click();await p.getByRole('button',{name:'Save game',exact:true}).click();assert((await p.locator('#explore-save-result').innerText()).includes('saved'),'Saving failed');await p.keyboard.press('Escape');};
 const cont=async()=>{await p.goto(base);await p.getByRole('link',{name:'▶ Continue',exact:true}).click();await ready();await p.locator('#viewport').focus();};
 // PREPARED: Kanto trainer lab-done, placed at a map-local tile of a Hoenn map. `prep(S,EM)` may set legitimate preconditions.
 const place=async(mapId,x,y,direction='north',prep=null,patch=null)=>{
  const trainer=JSON.parse(readFileSync('tools/playtest/saves/lab-done.json','utf8'));trainer.viewerStart='definitive-kanto-v1';
  if(patch)patch(trainer);
  await p.goto(base);await p.evaluate(s=>{localStorage.clear();localStorage.setItem('firered-save-v1',JSON.stringify(s));},trainer);
  await p.goto(new URL('world.html?region=hoenn&ferry=1#modo=explore&mapa=MAP_SLATEPORT_CITY',base).href);await ready();
  await p.evaluate(async({mapId,x,y,direction,prep})=>{
   const S=await import('/src/games/firered/save.ts');const EM=await import('/src/games/emerald/generated/constants.ts');
   const {syncViewerLocation}=await import('/src/viewer/session.ts');const {writeWorldSave}=await import('/src/viewer/regionSave.ts');
   syncViewerLocation({mapId,x,y,direction,dynamic:null});S.save.objectEventTemplates=[];delete S.save.viewerObjects;
   if(prep)await (new Function('S','EM','return (async()=>{'+prep+'})()'))(S,EM);
   if(!writeWorldSave())throw Error('Initial checkpoint failed');
  },{mapId,x,y,direction,prep});
  await cont();
 };

 // Walking planner: breadth-first search over walkable metatiles of every Hoenn map within 45 tiles of the player (outdoor
 // world coordinates) or of the current indoor map; it only chooses keys. A bump replans around the blocked tile.
 const planWalk=(mapId,x,y,avoid=[])=>p.evaluate(async({mapId,x,y,avoid})=>{
  const {rom}=await import('/src/core/rom.ts');const M=await import('/src/games/emerald/generated/metatileBehavior.ts');const S=await import('/src/games/firered/save.ts');
  const h=new URLSearchParams(location.hash.slice(1)),indoor=h.get('mapa');
  const index=window.__vIndex??=await(await fetch('/viewer/hoenn.json')).json();
  const sx=Number(h.get('px')),sy=Number(h.get('py'));
  const ids=indoor?[indoor]:Object.entries(index.maps).filter(([,m])=>m.x<sx+45&&m.x+m.width>sx-45&&m.y<sy+45&&m.y+m.height>sy-45).map(([id])=>id);
  const cells=new Map(),walls=new Set(avoid),warps=new Set();let target;
  for(const id of ids){
   const origin=indoor?{x:0,y:0}:index.maps[id];const header=await rom.loadMap(id);const l=await rom.loadLayout(header.layout);
   const [a,b]=await Promise.all([rom.loadTileset(l.primary),rom.loadTileset(l.secondary)]);
   const attr=mt=>mt<512?a.attributes[mt]:b.attributes[mt-512];
   if(id===mapId)target=[origin.x+x,origin.y+y];
   for(let ly=0;ly<l.height;ly++)for(let lx=0;lx<l.width;lx++){
    const v=l.blocks[ly*l.width+lx],beh=attr(v&1023)&255;
    if((v&0xc00)||M.MetatileBehavior_IsSurfableWaterOrUnderwater(beh)||[M.MetatileBehavior_IsJumpEast,M.MetatileBehavior_IsJumpWest,M.MetatileBehavior_IsJumpNorth,M.MetatileBehavior_IsJumpSouth].some(f=>f(beh)))continue;
    cells.set(`${origin.x+lx},${origin.y+ly}`,1);
   }
   for(const w of header.warps)warps.add(`${origin.x+w.x},${origin.y+w.y}`);
   for(const o of header.objects){if(o.clone||o.flag&&S.flagGet(o.flag))continue;walls.add(`${origin.x+o.x},${origin.y+o.y}`);}
  }
  if(!target)throw Error('Target map unavailable '+mapId);
  const targetKey=target.join(','),startKey=sx+','+sy;warps.delete(targetKey);
  const queue=[[sx,sy]],prev=new Map([[startKey,null]]);
  for(let i=0;i<queue.length;i++){
   const at=queue[i],k=at.join(',');if(k===targetKey){const path=[];let key=k;while(prev.get(key)){const [parent,dir]=prev.get(key);path.push(dir);key=parent;}return {path:path.reverse(),target};}
   for(const [dx,dy,key]of [[0,-1,'ArrowUp'],[-1,0,'ArrowLeft'],[1,0,'ArrowRight'],[0,1,'ArrowDown']]){
    const next=[at[0]+dx,at[1]+dy],nk=next.join(',');if(prev.has(nk)||!cells.has(nk)||walls.has(nk)||(warps.has(nk)&&nk!==targetKey))continue;
    prev.set(nk,[k,key]);queue.push(next);
   }
  }
  throw Error('No walking path '+JSON.stringify({sx,sy,mapId,x,y}));
 },{mapId,x,y,avoid});
 const walk=async(mapId,x,y)=>{
  const blocked=[];
  for(let retry=0;retry<80;retry++){
   await settle();const {path,target}=await planWalk(mapId,x,y,blocked);if(!path.length)return;
   let failed=false;
   for(const key of path){
    const before=await state();await press(key);let after=await state();
    if(after.battle){await fight();await settle();failed=true;break;}
    if(after.open||after.busy||after.tasks.length){await settle();after=await state();}
    if(after.x===before.x&&after.y===before.y){
     const dx=key==='ArrowRight'?1:key==='ArrowLeft'?-1:0,dy=key==='ArrowDown'?1:key==='ArrowUp'?-1:0;
     blocked.push(`${before.x+dx},${before.y+dy}`);failed=true;break;
    }
   }
   const at=await state();if(at.x===target[0]&&at.y===target[1])return;
   if(!failed)throw Error('Walk ended away from target '+JSON.stringify({mapId,x,y,at:[at.x,at.y]}));
  }
  throw Error('Too many blocked walking steps');
 };
 // Face a direction without moving into the tile (a turn-only tap) then A.
 const talk=async(key)=>{await press(key);await press('z');};
 return {p,base,missing,state,ready,press,fight,settle,save,cont,place,walk,talk,planWalk};
}
// First tall-grass tile (IsLandWildEncounter) of a map with a walkable neighbour; used to PREPARE a position inside grass.
export const findGrass=(p,mapId)=>p.evaluate(async(mapId)=>{
 const {rom}=await import('/src/core/rom.ts');const M=await import('/src/games/emerald/generated/metatileBehavior.ts');
 const header=await rom.loadMap(mapId),l=await rom.loadLayout(header.layout);
 const [a,b]=await Promise.all([rom.loadTileset(l.primary),rom.loadTileset(l.secondary)]);
 const attr=mt=>mt<512?a.attributes[mt]:b.attributes[mt-512];
 const g=(x,y)=>x>=0&&y>=0&&x<l.width&&y<l.height&&!(l.blocks[y*l.width+x]&0xc00)&&M.MetatileBehavior_IsLandWildEncounter(attr(l.blocks[y*l.width+x]&1023)&255);
 for(let y=0;y<l.height;y++)for(let x=0;x<l.width;x++)if(g(x,y)&&g(x+1,y)&&g(x-1,y))return {x,y};
 return null;
},mapId);
