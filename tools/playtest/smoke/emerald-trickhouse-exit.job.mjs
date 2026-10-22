// PREPARED once: a stored Kanto trainer (lab-done) and, in the Hoenn bank, VAR_TRICK_HOUSE_LEVEL = 6 with the
// VAR_TRICK_HOUSE_PUZZLE_7_STATE = 1 (the scroll's FoundScroll state) with the player on the tile below Trick House Puzzle 7's exit door. The puzzle itself is not solved here (it has six
// trainers). Everything after that tile uses keys: warp to the End room, Trick Master reward script, Corridor,
// Entrance and the door back to Route 110, then Save and Home Continue. The leg to the Slateport ferry is blocked by the
// Route 110 story state (see below), not attempted.
import { readFileSync } from 'node:fs';
const assert=(v,m)=>{if(!v)throw Error(m);};
export default async function run(ctx){
 const p=ctx.page,base=process.env.PW_BASE??'http://127.0.0.1:5174/';
 const missing=[];p.on('console',m=>{if(/not implemented|script command|Unsupported/i.test(m.text()))missing.push(m.text());});
 p.on('pageerror',e=>missing.push('pageerror '+String(e)));
 const state=()=>p.evaluate(async()=>{
  const {save}=await import('/src/games/firered/save.ts');const {gMain}=await import('/src/core/hw/runtime.ts');
  const h=new URLSearchParams(location.hash.slice(1));
  return {x:Number(h.get('px')),y:Number(h.get('py')),map:h.get('mapa'),busy:document.querySelector('#content')?.getAttribute('aria-busy')==='true',battle:gMain.inBattle,
   open:!!document.querySelector('#engine-interaction')&&!document.querySelector('#engine-interaction').hidden,save:JSON.parse(JSON.stringify(save))};
 });
 const ready=()=>p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length,null,{timeout:60000});
 const press=async(key)=>{await p.keyboard.press(key);await p.waitForTimeout(420);};
 const settle=async()=>{for(let i=0;i<200;i++){const s=await state();if(!s.open&&!s.busy)return s;if(s.battle)throw Error('Unexpected battle while settling');await press('z');}throw Error('Field did not unlock');};
 const mapIs=(m)=>p.waitForFunction(dest=>new URLSearchParams(location.hash.slice(1)).get('mapa')===dest,m,{timeout:30000});
 const plan=async(mapId,x,y,avoid=[])=>p.evaluate(async({mapId,x,y,avoid})=>{
  const {rom}=await import('/src/core/rom.ts');const M=await import('/src/games/emerald/generated/metatileBehavior.ts');const S=await import('/src/games/firered/save.ts');
  const h=new URLSearchParams(location.hash.slice(1)),indoor=h.get('mapa');
  const index=window.__continuousIndex??=await(await fetch('/viewer/hoenn.json')).json();
  const ids=indoor?[indoor]:['MAP_SLATEPORT_CITY','MAP_ROUTE110'];
  const cells=new Map(),walls=new Set(avoid),warps=new Set();let target;
  for(const id of ids){
   const origin=indoor?{x:0,y:0}:index.maps[id];const header=await rom.loadMap(id);const l=await rom.loadLayout(header.layout);
   const [a,b]=await Promise.all([rom.loadTileset(l.primary),rom.loadTileset(l.secondary)]);
   const attr=mt=>mt<512?a.attributes[mt]:b.attributes[mt-512];
   if(id===mapId)target=[origin.x+x,origin.y+y];
   for(let ly=0;ly<l.height;ly++)for(let lx=0;lx<l.width;lx++){
    const v=l.blocks[ly*l.width+lx],beh=attr(v&1023)&255;
    if((v&0xc00)||M.MetatileBehavior_IsSurfableWaterOrUnderwater(beh)||[M.MetatileBehavior_IsJumpEast,M.MetatileBehavior_IsJumpWest,M.MetatileBehavior_IsJumpNorth,M.MetatileBehavior_IsJumpSouth].some(f=>f(beh)))continue;
    cells.set(`${origin.x+lx},${origin.y+ly}`,{grass:M.MetatileBehavior_IsLandWildEncounter(beh)});
   }
   for(const w of header.warps)warps.add(`${origin.x+w.x},${origin.y+w.y}`);
   for(const o of header.objects){if(o.clone||o.flag&&S.flagGet(o.flag))continue;walls.add(`${origin.x+o.x},${origin.y+o.y}`);}
  }
  if(!target)throw Error('Target map unavailable '+mapId);
  const start=[Number(h.get('px')),Number(h.get('py'))],targetKey=target.join(','),startKey=start.join(',');
  const queue=[start],prev=new Map([[startKey,null]]);
  for(let i=0;i<queue.length;i++){
   const at=queue[i],k=at.join(',');if(k===targetKey){const path=[];let key=k;while(prev.get(key)){const [parent,dir]=prev.get(key);path.push(dir);key=parent;}return {path:path.reverse(),target};}
   for(const [dx,dy,key]of [[0,-1,'ArrowUp'],[-1,0,'ArrowLeft'],[1,0,'ArrowRight'],[0,1,'ArrowDown']]){
    const next=[at[0]+dx,at[1]+dy],nk=next.join(',');if(prev.has(nk)||!cells.has(nk)||walls.has(nk)||warps.has(nk))continue;
    prev.set(nk,[k,key]);queue.push(next);
   }
  }
  throw Error('No walking path '+JSON.stringify({start,mapId,x,y}));
 },{mapId,x,y,avoid});
 const walk=async(mapId,x,y)=>{
  const blocked=[];let steps=0;
  for(let retry=0;retry<20;retry++){
   await settle();const {path,target}=await plan(mapId,x,y,blocked);if(!path.length)return;
   console.log('WALK',mapId,x,y,'steps',path.length);
   let failed=false;
   for(const key of path){
    const before=await state();await press(key);let after=await state();
    if(after.battle)throw Error('Unexpected battle on planned path');
    if(after.open||after.busy){await settle();after=await state();}
    if(after.x===before.x&&after.y===before.y){
     const dx=key==='ArrowRight'?1:key==='ArrowLeft'?-1:0,dy=key==='ArrowDown'?1:key==='ArrowUp'?-1:0;
     blocked.push(`${before.x+dx},${before.y+dy}`);failed=true;break;
    }
    steps++;
   }
   const at=await state();if(at.x===target[0]&&at.y===target[1])return;
   if(!failed)throw Error('Walk ended away from target '+JSON.stringify({mapId,x,y,at:[at.x,at.y]}));
  }
  throw Error('Too many blocked walking steps');
 };
 const save=async()=>{await settle();await p.getByRole('button',{name:'Menu · Esc',exact:true}).click();await p.getByRole('button',{name:'Save game',exact:true}).click();assert((await p.locator('#explore-save-result').innerText()).includes('saved'),'Saving failed');await p.keyboard.press('Escape');};
 const through=async(from,x,y,key,to)=>{await walk(from,x,y);await press(key);await mapIs(to);await settle();};
 const talk=async(key)=>{await press(key);await press('z');await p.locator('#engine-interaction').waitFor({state:'visible',timeout:10000});};
 const finish=async(max=200)=>{for(let i=0;i<max;i++){const s=await state();if(!s.open&&!s.busy&&!s.battle)return s;await press('z');}throw Error('Interaction did not finish');};
 const trainer=JSON.parse(readFileSync('tools/playtest/saves/lab-done.json','utf8'));trainer.viewerStart='definitive-kanto-v1';
 await p.goto(base);await p.evaluate(s=>{localStorage.clear();localStorage.setItem('firered-save-v1',JSON.stringify(s));},trainer);
 await p.goto(new URL('world.html?region=hoenn&ferry=1#modo=explore&mapa=MAP_SLATEPORT_CITY',base).href);await ready();
 await p.evaluate(async()=>{
  const {save,varSet}=await import('/src/games/firered/save.ts');
  const EM=await import('/src/games/emerald/generated/constants.ts');
  const {syncViewerLocation}=await import('/src/viewer/session.ts');
  const {writeWorldSave}=await import('/src/viewer/regionSave.ts');
  syncViewerLocation({mapId:'MAP_ROUTE110_TRICK_HOUSE_PUZZLE7',x:13,y:2,direction:'north',dynamic:null});
  save.objectEventTemplates=[];delete save.viewerObjects;
  varSet(EM.VAR_TRICK_HOUSE_LEVEL,6);varSet(EM.VAR_TRICK_HOUSE_PUZZLE_7_STATE,1); // scroll read inside the puzzle (PREPARED)
  if(!writeWorldSave())throw Error('Initial checkpoint failed');
 });
 await p.goto(base);await p.getByRole('link',{name:'▶ Continue',exact:true}).click();await ready();await settle();
 await p.locator('#viewport').focus();await ctx.shot('th-start');
 let s=await state();console.log('START',s.map,s.x,s.y);
 await press('z');await p.locator('#engine-interaction').waitFor({state:'visible',timeout:10000});await settle();
 s=await state();console.log('AFTER DOOR SCRIPT',s.map,s.x,s.y,'state7',s.save.vars[16384+0]??'', await p.evaluate(async()=>{const {varGet}=await import('/src/games/firered/save.ts');const EM=await import('/src/games/emerald/generated/constants.ts');return varGet(EM.VAR_TRICK_HOUSE_PUZZLE_7_STATE);}));await ctx.shot('th-door-open');
 await press('ArrowUp');await p.waitForTimeout(1500);s=await state();console.log('AFTER UP',s.map,s.x,s.y);await mapIs('MAP_ROUTE110_TRICK_HOUSE_END');await settle();await ctx.shot('th-end');
 s=await state();console.log('END ROOM',s.x,s.y);
 const before=s.save;
 await walk('MAP_ROUTE110_TRICK_HOUSE_END',4,4);await talk('ArrowDown');await finish();
 const rewarded=(await state()).save;
 const bagItems=d=>JSON.stringify(d.bag);
 assert(bagItems(rewarded)!==bagItems(before),'Trick Master reward did not change the bag');
 const level=await p.evaluate(async()=>{const {varGet}=await import('/src/games/firered/save.ts');const EM=await import('/src/games/emerald/generated/constants.ts');return varGet(EM.VAR_TRICK_HOUSE_LEVEL);});
 assert(level===7,'VAR_TRICK_HOUSE_LEVEL after puzzle 7 must be 7, got '+level);
 await ctx.shot('th-end-reward');console.log('TRICK MASTER PASS',level);
 await through('MAP_ROUTE110_TRICK_HOUSE_END',2,2,'ArrowUp','MAP_ROUTE110_TRICK_HOUSE_CORRIDOR');console.log('CORRIDOR');
 await through('MAP_ROUTE110_TRICK_HOUSE_CORRIDOR',4,22,'ArrowDown','MAP_ROUTE110_TRICK_HOUSE_ENTRANCE');console.log('ENTRANCE');
 await walk('MAP_ROUTE110_TRICK_HOUSE_ENTRANCE',5,6);await press('ArrowDown');
 await p.waitForFunction(()=>!new URLSearchParams(location.hash.slice(1)).has('mapa'),null,{timeout:30000});await settle();
 s=await state();console.log('ROUTE 110',s.x,s.y);await ctx.shot('th-route110');
 // Route 110 south of the Trick House is blocked by the Team Aqua grunts (FLAG_HIDE_ROUTE_110_TEAM_AQUA is set by
 // the Oceanic Museum event, which this save has not reached) and by its trainers: the ferry stays out of reach here.
 const route=(await state()).save;
 await save();const saved=(await state()).save;const raw=await p.evaluate(()=>localStorage.getItem('firered-save-v1'));
 await p.goto(base);await p.getByRole('link',{name:'▶ Continue',exact:true}).click();await ready();await settle();
 const resumed=(await state()).save;
 assert(JSON.stringify(resumed.party)===JSON.stringify(saved.party)&&resumed.money===saved.money&&JSON.stringify(resumed.bag)===JSON.stringify(saved.bag),'Continue lost earned state');
 assert(JSON.stringify(resumed.viewerNavigation)===JSON.stringify(saved.viewerNavigation),'Continue changed position');
 assert(JSON.stringify(resumed.vars)===JSON.stringify(saved.vars)&&JSON.stringify(resumed.flags)===JSON.stringify(saved.flags),'Continue changed the Hoenn bank');
 assert(await p.evaluate(()=>localStorage.getItem('firered-save-v1'))===raw,'Continue rewrote storage');
 await ctx.shot('th-route110-continued');console.log('SAVE/CONTINUE PASS',resumed.viewerNavigation.mapId??'Route 110');
 assert(missing.length===0,'Missing source behaviour: '+missing.join('; '));
 return {status:'PASS',scope:'PREPARED trainer, Trick House level 6, puzzle-7 scroll state and the tile below the exit door; real door interaction, End room, Trick Master reward, Corridor, Entrance, Route 110, Save and Home Continue. Puzzle 7 itself (six trainers) and the walk to the Slateport ferry are not covered',errors:ctx.errors()};
}
