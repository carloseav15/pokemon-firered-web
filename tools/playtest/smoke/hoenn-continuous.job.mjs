// PREPARED once: existing Kanto trainer at the ferry. No state/position/HP writes after departure.
// Source geometry plans paths; all travel, interaction, combat, saving and recovery use UI keys.
import { readFileSync } from 'node:fs';
const assert=(v,m)=>{if(!v)throw Error(m);};
export default async function run(ctx){
 const p=ctx.page,base=process.env.PW_BASE??'http://127.0.0.1:5174/';
 const missing=[];p.on('console',m=>{if(/not implemented|script command/i.test(m.text()))missing.push(m.text());});
 const state=()=>p.evaluate(async()=>{
  const {save}=await import('/src/games/firered/save.ts');const {gMain}=await import('/src/core/hw/runtime.ts');
  const {G,gBattlerControllerFuncs,gMoveSelectionCursor,gActionSelectionCursor}=await import('/src/core/battle/globals.ts');
  const h=new URLSearchParams(location.hash.slice(1));
  return {x:Number(h.get('px')),y:Number(h.get('py')),map:h.get('mapa'),busy:document.querySelector('#content')?.getAttribute('aria-busy')==='true',battle:gMain.inBattle,
   controller:gBattlerControllerFuncs[0]?.name??'',moveCursor:gMoveSelectionCursor[0],actionCursor:gActionSelectionCursor[0],outcome:G.gBattleOutcome,
   open:!!document.querySelector('#engine-interaction')&&!document.querySelector('#engine-interaction').hidden,
   save:JSON.parse(JSON.stringify(save))};
 });
 const ready=()=>p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length,null,{timeout:60000});
 const press=async(key)=>{await p.keyboard.press(key);await p.waitForTimeout(420);};
 const settle=async()=>{for(let i=0;i<150;i++){const s=await state();if(!s.open&&!s.busy)return s;if(s.battle)throw Error('Unexpected battle while settling');await press('z');}throw Error('Field did not unlock');};
 const save=async()=>{await settle();await p.getByRole('button',{name:'Menu · Esc',exact:true}).click();await p.getByRole('button',{name:'Save game',exact:true}).click();assert((await p.locator('#explore-save-result').innerText()).includes('saved'),'Saving failed');await p.keyboard.press('Escape');};
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
 const door=async(from,x,y,to)=>{await walk(from,x,y+1);await press('ArrowUp');await p.waitForFunction(dest=>new URLSearchParams(location.hash.slice(1)).get('mapa')===dest,to,{timeout:30000});await settle();};
 const exit=async(map,x,y)=>{await walk(map,x,y-1);await press('ArrowDown');await p.waitForFunction(()=>!new URLSearchParams(location.hash.slice(1)).has('mapa'),null,{timeout:30000});await settle();};
 const talk=async(key)=>{await press(key);await press('z');await p.locator('#engine-interaction').waitFor({state:'visible',timeout:10000});};
 const finish=async(max=150)=>{for(let i=0;i<max;i++){const s=await state();if(!s.open&&!s.busy&&!s.battle)return s;await press('z');}throw Error('Interaction did not finish');};
 const fixture=JSON.parse(readFileSync('tools/playtest/saves/pewter.json','utf8'));
 fixture.viewerStart='definitive-kanto-v1';fixture.viewerNavigation={mapId:'MAP_VERMILION_CITY',x:24,y:34,direction:'north',dynamic:null};
 await p.goto(base);await p.evaluate(s=>{localStorage.clear();localStorage.setItem('firered-save-v1',JSON.stringify(s));},fixture);
 await p.goto(new URL('world.html#modo=explore',base).href);await ready();await settle();await p.locator('#viewport').focus();await press('z');
 await p.getByRole('button',{name:'🚢 Sail to Hoenn!',exact:true}).click();await p.waitForURL('**/world.html?region=hoenn**');await ready();await settle();
 const arrival=(await state()).save;console.log('FERRY ARRIVAL PASS');
 await door('MAP_SLATEPORT_CITY',19,19,'MAP_SLATEPORT_CITY_POKEMON_CENTER_1F');
 await walk('MAP_SLATEPORT_CITY_POKEMON_CENTER_1F',7,4);await talk('ArrowUp');await finish();
 const healed=(await state()).save;assert(healed.party.every(m=>m.hp===m.stats[0]),'Nurse failed');await ctx.shot('continuous-center');console.log('CENTER PASS',healed.lastHealLocation);
 await exit('MAP_SLATEPORT_CITY_POKEMON_CENTER_1F',7,8);
 await door('MAP_SLATEPORT_CITY',13,26,'MAP_SLATEPORT_CITY_MART');await walk('MAP_SLATEPORT_CITY_MART',3,3);
 const beforeShop=(await state()).save;await talk('ArrowLeft');
 for(let i=0;i<130&&(await state()).save.money===beforeShop.money;i++)await press('z');
 for(let i=0;i<90&&(await state()).open;i++)await press('x');
 const bought=(await state()).save;assert(bought.money===beforeShop.money-200,'Poké Ball purchase price');
 const balls=d=>d.bag.pokeBalls.filter(i=>i.item===4).reduce((n,i)=>n+i.quantity,0);assert(balls(bought)===balls(beforeShop)+1,'Purchased ball missing');
 await ctx.shot('continuous-shop');console.log('SHOP PASS');await exit('MAP_SLATEPORT_CITY_MART',3,7);
 await save();const saved=(await state()).save;const raw=await p.evaluate(()=>localStorage.getItem('firered-save-v1'));
 // Leave the game page and resume through Home: no saved-state edits.
 await p.goto(base);await p.getByRole('link',{name:'▶ Continue',exact:true}).click();await ready();await settle();
 const resumed=(await state()).save;assert(JSON.stringify(resumed.party)===JSON.stringify(saved.party)&&resumed.money===saved.money&&JSON.stringify(resumed.bag)===JSON.stringify(saved.bag),'Continue lost earned state');
 assert(JSON.stringify(resumed.viewerNavigation)===JSON.stringify(saved.viewerNavigation),'Continue changed position');console.log('SAVE/CONTINUE PASS');
 await ctx.shot('continuous-resumed');
 // Find a source grass pair in the southern part of Route 110, reachable on foot from Slateport.
 const pairs=await p.evaluate(async()=>{const {rom}=await import('/src/core/rom.ts');const M=await import('/src/games/emerald/generated/metatileBehavior.ts');const h=await rom.loadMap('MAP_ROUTE110');const l=await rom.loadLayout(h.layout);const[a,b]=await Promise.all([rom.loadTileset(l.primary),rom.loadTileset(l.secondary)]);const attr=mt=>mt<512?a.attributes[mt]:b.attributes[mt-512];const pairs=[];for(let y=l.height-2;y>60;y--)for(let x=1;x<l.width-2;x++){if([x,x+1].every(i=>{const v=l.blocks[y*l.width+i];return !(v&0xc00)&&M.MetatileBehavior_IsLandWildEncounter(attr(v&1023)&255);}))pairs.push({x,y});}return pairs;});
 let chosen;for(const pair of pairs){try{await plan('MAP_ROUTE110',pair.x,pair.y);chosen=pair;break;}catch{}}
 assert(chosen,'No reachable grass pair');console.log('GRASS',chosen);
 await walk('MAP_ROUTE110',chosen.x,chosen.y);
 const encounter=async()=>{for(let i=0;i<450;i++){const s=await state();if(s.battle)return s;await press(i%2?'ArrowLeft':'ArrowRight');}throw Error('No wild encounter');};
 const fight=async(lose)=>{
  for(let i=0;i<4000;i++){
   const s=await state();if(!s.open&&!s.battle&&!s.busy)return s;
   if(i%140===0)console.log('BATTLE',lose?'loss':'win',i,s.controller,s.save.party.map(m=>m.hp),s.moveCursor,s.outcome);
   if(lose&&s.controller.includes('HandleInputChooseMove')){if(s.moveCursor!==1)await p.keyboard.press('ArrowRight');else await p.keyboard.press('z');}
   else await p.keyboard.press('z');
   await p.waitForTimeout(180);
  }
  await ctx.shot('battle-stuck');throw Error('Battle did not finish');
 };
 const exp=(await state()).save.party[0].exp;await encounter();await ctx.shot('continuous-battle');await fight(false);
 const won=(await state()).save;assert(won.party[0].exp>exp,'Battle did not grant experience');console.log('WILD WIN PASS');
 const beforeLoss=await encounter();console.log('LOSING NATURALLY',beforeLoss.save.party[0].hp,beforeLoss.save.money);
 await fight(true);await p.waitForTimeout(1500);await settle();
 const lost=await state();console.log('LOSS RESULT',JSON.stringify({map:lost.map,location:lost.save.location,heal:lost.save.lastHealLocation,money:lost.save.money,hp:lost.save.party.map(m=>m.hp),outcome:lost.outcome}));
 assert(lost.outcome===2,'Expected a natural defeat');assert(lost.save.money===Math.floor(beforeLoss.save.money/2),'Emerald white-out money rule');assert(lost.save.party.every(m=>m.hp===m.stats[0]&&m.status===0),'Defeat did not heal the team');
 await ctx.shot('continuous-after-defeat');
 // Emerald respawns at its saved outdoor heal warp, then the player can walk back to the ferry.
 await walk('MAP_SLATEPORT_CITY',36,41);await press('ArrowRight');await press('z');await p.getByRole('button',{name:'🚢 Return to Kanto!',exact:true}).click();await p.waitForURL('**/world.html?region=kanto**');await ready();await settle();
 const returned=(await state()).save;assert(JSON.stringify(returned.party)===JSON.stringify(lost.save.party)&&returned.money===lost.save.money&&JSON.stringify(returned.bag)===JSON.stringify(lost.save.bag),'Return lost earned state');
 assert(JSON.stringify(returned.flags)===JSON.stringify(JSON.parse(raw).flags),'Hoenn changed Kanto flags');
 assert(JSON.stringify(returned.vars)===JSON.stringify(JSON.parse(raw).vars),'Hoenn changed Kanto vars');
 await save();await ctx.shot('continuous-kanto-return');
 assert(!missing.length,'Unimplemented source commands: '+missing.join('; '));
 return {status:'PASS',scope:'PREPARED initial trainer only; continuous Slateport/Route 110 walking, original nurse/shop, earned battle EXP, natural defeat and Emerald respawn, save/Home Continue and ferry round trip',errors:ctx.errors()};
}
