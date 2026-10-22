// PREPARED trainer and positions at each circuit stop. Keys drive all interactions and battles.
// Map-to-map walking is outside this focused check; ferry continuity has a separate browser job.
import { readFileSync } from 'node:fs';
const assert = (v, msg) => { if (!v) throw Error(msg); };
export default async function run(ctx) {
 const p=ctx.page, base=process.env.PW_BASE??'http://127.0.0.1:5173/';
 const ready=()=>p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length,null,{timeout:60000});
 const live=()=>p.evaluate(async()=>JSON.parse(JSON.stringify((await import('/src/games/firered/save.ts')).save)));
 const open=()=>p.locator('#engine-interaction').isVisible();
 const inBattle=()=>p.evaluate(async()=>(await import('/src/core/hw/runtime.ts')).gMain.inBattle);
 const advance=async(done,max=100)=>{for(let i=0;i<max;i++){if(await done())return;await p.keyboard.press('z');await p.waitForTimeout(350);}throw Error('Interaction did not finish');};
 const save=async()=>{await p.getByRole('button',{name:'Menu · Esc',exact:true}).click();await p.getByRole('button',{name:'Save game',exact:true}).click();assert((await p.locator('#explore-save-result').innerText()).includes('saved'),'Save failed');await p.keyboard.press('Escape');};
 const position=async(mapId,x,y,direction)=>{
  // PREPARED navigation only; keep the earned party, bag, money, flags and variables intact.
  await p.goto(base);
  await p.evaluate(({mapId,x,y,direction})=>{const d=JSON.parse(localStorage.getItem('firered-save-v1'));d.world.activeRegion='hoenn';d.world.regions.hoenn.viewerNavigation={mapId,x,y,direction,dynamic:null,region:'hoenn'};for(const k of ['firered-save-v1','firered-viewer-game-v1'])localStorage.setItem(k,JSON.stringify(d));},{mapId,x,y,direction});
  await p.goto(new URL('world.html?region=hoenn&continue=1#modo=explore',base).href);await ready();await p.waitForTimeout(1000);await p.locator('#viewport').focus();
 };
 const fixture=JSON.parse(readFileSync('tools/playtest/saves/pewter.json','utf8'));
 fixture.viewerStart='definitive-kanto-v1';
 await p.goto(base);await p.evaluate(s=>{localStorage.clear();localStorage.setItem('firered-save-v1',JSON.stringify(s));},fixture);
 // Establish a real Hoenn bank by the arrival path, then set up individual circuit stops.
 await p.goto(new URL('world.html?region=hoenn&ferry=1#modo=explore&mapa=MAP_SLATEPORT_CITY',base).href);await ready();
 await position('MAP_OLDALE_TOWN',16,12,'north');
 await p.keyboard.press('z');await p.locator('#engine-interaction').waitFor({state:'visible'});await p.waitForTimeout(1600);await ctx.shot('oldale-source-npc');await advance(async()=>!await open());
 await save();
 console.log('NPC PASS');
 await position('MAP_OLDALE_TOWN_MART',3,3,'west');
 const before=await live();
 await p.keyboard.press('z');await p.locator('#engine-interaction').waitFor({state:'visible'});
 await advance(async()=>(await live()).money<before.money);
 await ctx.shot('oldale-source-purchase');
 for(let i=0;i<70&&await open();i++){await p.keyboard.press('x');await p.waitForTimeout(350);}
 assert(!await open(),'Shop did not close');
 let s=await live();assert(s.money===before.money-300,'Potion price mismatch');
 const quantity=d=>d.bag.items.filter(i=>i.item===13).reduce((n,i)=>n+i.quantity,0);
 assert(quantity(s)===quantity(before)+1,'Potion missing');await save();console.log('SHOP PASS');
 await position('MAP_OLDALE_TOWN_POKEMON_CENTER_1F',7,4,'north');
 await p.evaluate(async()=>{const s=(await import('/src/games/firered/save.ts')).save;s.party[0].hp=1;s.party[0].pp[0]=0;});
 await p.keyboard.press('z');await p.locator('#engine-interaction').waitFor({state:'visible'});await advance(async()=>!await open(),160);
 s=await live();assert(s.party[0].hp===s.party[0].stats[0]&&s.party[0].pp[0]>0,'Nurse failed');await ctx.shot('oldale-source-heal');await save();console.log('HEAL PASS');
 // Find adjacent source grass tiles; only position is prepared, encounters still require real steps.
 const grass=await p.evaluate(async()=>{const {rom}=await import('/src/core/rom.ts');const M=await import('/src/games/emerald/generated/metatileBehavior.ts');const h=await rom.loadMap('MAP_ROUTE101');const l=await rom.loadLayout(h.layout);const [a,b]=await Promise.all([rom.loadTileset(l.primary),rom.loadTileset(l.secondary)]);const attr=(mt)=>mt<512?a.attributes[mt]:b.attributes[mt-512];for(let y=1;y<l.height-1;y++)for(let x=1;x<l.width-2;x++){const at=(x,y)=>l.blocks[y*l.width+x];if([at(x,y),at(x+1,y)].every(v=>(v&0xc00)===0&&M.MetatileBehavior_IsLandWildEncounter(attr(v&1023)&255)))return {x,y};}throw Error('No grass pair');});
 await position('MAP_ROUTE101',grass.x,grass.y,'east');
 if(await open())await advance(async()=>!await open());
 const exp=(await live()).party[0].exp;
 for(let i=0;i<250&&!await inBattle();i++){await p.keyboard.press(i%2?'ArrowLeft':'ArrowRight');await p.waitForTimeout(500);}
 assert(await inBattle(),'No encounter after grass steps');
 await p.waitForTimeout(2000);await ctx.shot('route101-source-battle');
 await advance(async()=>!await inBattle()&&!await open(),700);
 s=await live();assert(s.party[0].exp>exp,'No earned experience');await save();
 const earned=JSON.stringify(s.party),money=s.money,bag=JSON.stringify(s.bag);
 await p.goto(base);await p.getByRole('link',{name:'▶ Continue',exact:true}).click();await ready();s=await live();
 assert(JSON.stringify(s.party)===earned&&s.money===money&&JSON.stringify(s.bag)===bag,'Continue lost circuit results');
 console.log('BATTLE/SAVE/CONTINUE PASS');
 return {status:'PASS',scope:'PREPARED trainer and positions; visible source NPC, purchase, healing, real grass-step encounter, battle experience and save/Home Continue; no continuous map walking or full-campaign claim',errors:ctx.errors()};
}
