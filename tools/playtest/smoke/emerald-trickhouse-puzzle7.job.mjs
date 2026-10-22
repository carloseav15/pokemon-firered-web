// PREPARED once: a stored Kanto trainer (lab-done) whose lead is raised to level 100 with Razor Leaf/Solar Beam
// (the six Puzzle 7 trainers are level 41), and, in the Hoenn bank, VAR_TRICK_HOUSE_LEVEL = 6 with the player on
// the tile Puzzle 7's warp 0 (the entrance from the Trick House Entrance) assigns. Everything after that is keys:
// the planned route (breadth-first search over player cell x puzzle-object cells, built from the map's own
// metatiles/collision/warps/coord events) steps on the four buttons, takes the source teleports (warp pairs),
// fights the trainers that see the player, reads the scroll, opens the exit door and walks out. The route planner only
// chooses keys; the result is whatever the engine does, and a mismatch replans from the live cell and templates.
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
 const fight=async()=>{for(let i=0;i<4000;i++){const s=await state();if(!s.battle)return;await p.keyboard.press('z');await p.waitForTimeout(180);}throw Error('Battle did not finish');};
 const settle=async()=>{for(let i=0;i<400;i++){const s=await state();if(s.battle){console.log('BATTLE at',s.x,s.y);await fight();continue;}if(!s.open&&!s.busy)return s;await press('z');}throw Error('Field did not unlock');};
 const mapIs=(m)=>p.waitForFunction(dest=>new URLSearchParams(location.hash.slice(1)).get('mapa')===dest,m,{timeout:30000});
 // Planner: runs in the page against the real map data and the live object templates.
 const plan=()=>p.evaluate(async()=>{
  const {rom}=await import('/src/core/rom.ts');const S=await import('/src/games/firered/save.ts');const EM=await import('/src/games/emerald/generated/constants.ts');
  const h=new URLSearchParams(location.hash.slice(1));
  const header=await rom.loadMap('MAP_ROUTE110_TRICK_HOUSE_PUZZLE7'),l=await rom.loadLayout(header.layout),W=l.width,H=l.height;
  const start=rom.c('METATILE_TrickHousePuzzle_Arrow_YellowOnWhite_Right'),thr=rom.c('METATILE_MossdeepGym_YellowArrow_Right');
  const mt=(x,y)=>l.blocks[y*W+x]&1023;
  const coll=(x,y)=>x<0||y<0||x>=W||y>=H||((l.blocks[y*W+x]>>10)&3)!==0;
  const D=[[1,0],[0,1],[-1,0],[0,-1]],keys=['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'];
  const objs=S.save.objectEventTemplates.length?S.save.objectEventTemplates.map(t=>({x:t.x,y:t.y})):header.objects.map(o=>({x:o.x,y:o.y}));
  const warpAt=new Map(header.warps.map((w,i)=>[w.x+','+w.y,i])),buttons=new Map(header.coords.map((c,i)=>[c.x+','+c.y,i]));
  const press=(m,row)=>m.map(o=>{const t=mt(o.x,o.y),r=Math.trunc((t-start)/8);if(t<thr||r>=5||r!==row||(t-start)%8>=4)return o;const d=D[(t-start)%8];return {x:o.x+d[0],y:o.y+d[1]};});
  const scrollRead=S.varGet(EM.VAR_TRICK_HOUSE_PUZZLE_7_STATE)>=1;
  const sx=Number(h.get('px')),sy=Number(h.get('py'));
  const k=(x,y,m,sc)=>x+','+y+'|'+m.map(o=>o.x+','+o.y).join(';')+'|'+sc;
  const init={x:sx,y:sy,m:objs,sc:scrollRead},seen=new Map([[k(sx,sy,objs,scrollRead),{prev:null,mv:''}]]),q=[init];
  for(let i=0;i<q.length;i++){const s=q[i],k0=k(s.x,s.y,s.m,s.sc);
   if(s.x===13&&s.y===2&&s.sc){const path=[];let kk=k0;while(kk){const e=seen.get(kk);if(e.mv)path.push(e.mv);kk=e.prev;}return path.reverse();}
   for(let d=0;d<4;d++){let nx=s.x+D[d][0],ny=s.y+D[d][1];
    if(coll(nx,ny)||s.m.some(o=>o.x===nx&&o.y===ny))continue;
    let m=s.m;const bi=buttons.get(nx+','+ny);if(bi!==undefined)m=press(m,bi);
    let mv=keys[d]+'@'+nx+','+ny;const wi=warpAt.get(nx+','+ny);
    if(wi!==undefined){const w=header.warps[wi];if(w.destMap!=='MAP_ROUTE110_TRICK_HOUSE_PUZZLE7')continue;const t=header.warps[w.destWarpId];nx=t.x;ny=t.y;mv=keys[d]+'@'+nx+','+ny+'*';}
    const sc=s.sc||(nx===5&&ny===17&&d===0);const nk=k(nx,ny,m,sc);
    if(!seen.has(nk)){seen.set(nk,{prev:k0,mv});q.push({x:nx,y:ny,m,sc});}}
  }
  throw Error('No route from '+sx+','+sy);
 });
 const planWalk=async(mapId,x,y,avoid=[])=>p.evaluate(async({mapId,x,y,avoid})=>{
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
  for(let retry=0;retry<120;retry++){
   await settle();const {path,target}=await planWalk(mapId,x,y,blocked);if(!path.length)return;
   console.log('WALK',mapId,x,y,'steps',path.length);
   let failed=false;
   for(const key of path){
    const before=await state();await press(key);let after=await state();
    if(after.battle){await fight();await settle();failed=true;break;}
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
 const finish=async(max=200)=>{for(let i=0;i<max;i++){const s=await state();if(s.battle){await fight();continue;}if(!s.open&&!s.busy)return s;await press('z');}throw Error('Interaction did not finish');};
 const trainer=JSON.parse(readFileSync('tools/playtest/saves/lab-done.json','utf8'));trainer.viewerStart='definitive-kanto-v1';
 // PREPARED: level 100 lead (exp for the medium-slow curve, stats, moves).
 Object.assign(trainer.party[0],{level:100,exp:1059860,moves:[75,76,33,22],pp:[25,10,35,10],stats:[300,200,200,200,200,200],hp:300});
 await p.goto(base);await p.evaluate(s=>{localStorage.clear();localStorage.setItem('firered-save-v1',JSON.stringify(s));},trainer);
 await p.goto(new URL('world.html?region=hoenn&ferry=1#modo=explore&mapa=MAP_SLATEPORT_CITY',base).href);await ready();
 await p.evaluate(async()=>{
  const {save,varSet,flagSet}=await import('/src/games/firered/save.ts');
  const EM=await import('/src/games/emerald/generated/constants.ts');
  const {syncViewerLocation}=await import('/src/viewer/session.ts');
  const {writeWorldSave}=await import('/src/viewer/regionSave.ts');
  syncViewerLocation({mapId:'MAP_ROUTE110_TRICK_HOUSE_PUZZLE7',x:0,y:21,direction:'north',dynamic:null});
  save.objectEventTemplates=[];delete save.viewerObjects;
  varSet(EM.VAR_TRICK_HOUSE_LEVEL,6);flagSet(EM.FLAG_HIDE_ROUTE_110_TEAM_AQUA); // Oceanic Museum 2F outcome (PREPARED story flag)
  if(!writeWorldSave())throw Error('Initial checkpoint failed');
 });
 await p.goto(base);await p.getByRole('link',{name:'▶ Continue',exact:true}).click();await ready();await settle();
 await p.locator('#viewport').focus();await ctx.shot('p7-start');
 let s=await state();console.log('START',s.map,s.x,s.y);
 let steps=0,replans=0,teleports=0,bumped=false;
 for(let round=0;round<12;round++){
  s=await settle();const route=await plan();console.log('ROUTE',route.length,'from',s.x,s.y);let off=false;
  for(const mv of route){
   const [key,at]=mv.split('@'),warp=at.endsWith('*'),[ex,ey]=at.replace('*','').split(',').map(Number);
   await press(key);
   for(let i=0;i<60;i++){const c=await state();if(c.battle||c.open)break;if(c.x===ex&&c.y===ey&&!c.busy)break;await p.waitForTimeout(100);}
   await settle();let c=await state();steps++;if(warp)teleports++;
   if(!bumped&&c.x===3&&c.y===20){await press('ArrowUp');const w=await state();assert(w.x===3&&w.y===20,'Walked into the collision tile above (3,20)');bumped=true;console.log('COLLISION BUMP held at',w.x,w.y);}
   if(c.x===5&&c.y===17&&key==='ArrowRight'&&!(await p.evaluate(async()=>{const S=await import('/src/games/firered/save.ts');const EM=await import('/src/games/emerald/generated/constants.ts');return S.varGet(EM.VAR_TRICK_HOUSE_PUZZLE_7_STATE);}))){
    await press('ArrowRight');await press('z');await p.locator('#engine-interaction').waitFor({state:'visible',timeout:10000});await finish();console.log('SCROLL READ');c=await state();
   }
   if(c.x!==ex||c.y!==ey){console.log('MISMATCH after',mv,'at',c.x,c.y);off=true;replans++;break;}
  }
  if(!off)break;
 }
 s=await settle();console.log('AT DOOR',s.x,s.y,'steps',steps,'replans',replans,'teleports',teleports);assert(teleports>=4&&bumped,'Route skipped the teleports or the collision check');assert(s.x===13&&s.y===2,'Did not reach the exit door');
 await ctx.shot('p7-door');
 await press('ArrowUp'); // the door metatile interaction
 await press('z');await p.locator('#engine-interaction').waitFor({state:'visible',timeout:10000});await finish();
 await press('ArrowUp');await mapIs('MAP_ROUTE110_TRICK_HOUSE_END');await settle();
 s=await state();console.log('END ROOM',s.x,s.y);await ctx.shot('p7-end');
 // Trick Master reward, then the Trick House's own doors back to Route 110.
 const bag=d=>JSON.stringify(d.bag),before=(await state()).save;
 await walk('MAP_ROUTE110_TRICK_HOUSE_END',4,4);await talk('ArrowDown');await finish();
 assert(bag((await state()).save)!==bag(before),'Trick Master reward did not change the bag');
 const level=await p.evaluate(async()=>{const S=await import('/src/games/firered/save.ts');const EM=await import('/src/games/emerald/generated/constants.ts');return S.varGet(EM.VAR_TRICK_HOUSE_LEVEL);});
 assert(level===7,'VAR_TRICK_HOUSE_LEVEL after puzzle 7 must be 7, got '+level);console.log('TRICK MASTER PASS',level);
 await through('MAP_ROUTE110_TRICK_HOUSE_END',2,2,'ArrowUp','MAP_ROUTE110_TRICK_HOUSE_CORRIDOR');
 await through('MAP_ROUTE110_TRICK_HOUSE_CORRIDOR',4,22,'ArrowDown','MAP_ROUTE110_TRICK_HOUSE_ENTRANCE');
 await walk('MAP_ROUTE110_TRICK_HOUSE_ENTRANCE',5,6);await press('ArrowDown');
 await p.waitForFunction(()=>!new URLSearchParams(location.hash.slice(1)).has('mapa'),null,{timeout:30000});await settle();
 s=await state();console.log('ROUTE 110',s.x,s.y);await ctx.shot('p7-route110');
 // On foot to the Slateport landing (its battles are fought with the level 100 lead), then the ferry.
 await walk('MAP_SLATEPORT_CITY',36,41);await ctx.shot('p7-slateport');
 const hoennBefore=(await state()).save;
 await save();const raw=await p.evaluate(()=>localStorage.getItem('firered-save-v1'));
 await p.goto(base);await p.getByRole('link',{name:'▶ Continue',exact:true}).click();await ready();await settle();
 const resumed=(await state()).save;
 assert(JSON.stringify(resumed.party)===JSON.stringify(hoennBefore.party)&&resumed.money===hoennBefore.money&&JSON.stringify(resumed.bag)===JSON.stringify(hoennBefore.bag),'Continue lost earned state');
 assert(JSON.stringify(resumed.vars)===JSON.stringify(hoennBefore.vars)&&JSON.stringify(resumed.flags)===JSON.stringify(hoennBefore.flags),'Continue changed the Hoenn bank');
 assert(await p.evaluate(()=>localStorage.getItem('firered-save-v1'))===raw,'Continue rewrote storage');
 await p.locator('#viewport').focus();await press('ArrowRight');await press('z');
 await p.getByRole('button',{name:'🚢 Return to Kanto!',exact:true}).click();await p.waitForURL('**/world.html?region=kanto**');await ready();await settle();
 const kanto=(await state()).save;
 assert(JSON.stringify(kanto.party)===JSON.stringify(hoennBefore.party)&&kanto.money===hoennBefore.money&&JSON.stringify(kanto.bag)===JSON.stringify(hoennBefore.bag),'Ferry to Kanto lost earned state');
 const hoennBank=JSON.stringify((await p.evaluate(()=>JSON.parse(localStorage.getItem('firered-save-v1')))).world.regions.hoenn);
 assert(hoennBank.includes('MAP_SLATEPORT_CITY'),'Hoenn bank lost its location');
 await ctx.shot('p7-kanto');console.log('FERRY TO KANTO PASS');
 await save();await p.goto(base);await p.getByRole('link',{name:'▶ Continue',exact:true}).click();await ready();await settle();
 await p.locator('#viewport').focus();await press('z');
 await p.getByRole('button',{name:'🚢 Sail to Hoenn!',exact:true}).click();await p.waitForURL('**/world.html?region=hoenn**');await ready();await settle();
 const back=(await state()).save;
 assert(JSON.stringify(back.party)===JSON.stringify(hoennBefore.party)&&back.money===hoennBefore.money&&JSON.stringify(back.bag)===JSON.stringify(hoennBefore.bag),'Ferry back lost earned state');
 assert(JSON.stringify(back.vars)===JSON.stringify(hoennBefore.vars)&&JSON.stringify(back.flags)===JSON.stringify(hoennBefore.flags),'Hoenn bank changed by the Kanto visit');
 await ctx.shot('p7-hoenn-again');console.log('FERRY BACK PASS');
 assert(missing.length===0,'Missing source behaviour: '+missing.join('; '));
 return {status:'PASS',scope:'PREPARED level-100 lead, Trick House level 6, the Puzzle 7 entry tile and FLAG_HIDE_ROUTE_110_TEAM_AQUA (Oceanic Museum event outcome); keys, buttons, teleports, scroll, door, End room, Trick Master, Route 110 on foot to Slateport, Save/Home Continue, ferry to Kanto and back',errors:ctx.errors()};
}
