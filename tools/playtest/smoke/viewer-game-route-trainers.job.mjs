// PREPARED: each URL starts a few tiles outside a route trainer's line of sight
// and the Lv40 lead is an explicit precondition so the first move wins.
// Sight, approach, trainerbattle_single, prize money and the defeat flag are the
// engine's; after save/reload the flag must persist and walking back in sight
// must not start another battle. Run with PW_TIMEOUT_MS=580000; TRAINERS=Greg limits the list.
const BASE=process.env.PW_BASE??'http://localhost:5173';
// [name, map, start x, start y, key towards sight, trainer id from opponents.h]
const TRAINERS=[
 ['Greg','MAP_ROUTE3',22,5,'ArrowRight',106],
 ['Ben','MAP_ROUTE3',14,5,'ArrowRight',89],
 ['Rick','MAP_VIRIDIAN_FOREST',44,48,'ArrowUp',102],
];
const TRAINER_FLAGS_START=0x500;
import {readFileSync} from 'node:fs';
// Exterior maps take world coordinates in the URL (public/viewer/kanto.json).
const WORLD=JSON.parse(readFileSync('public/viewer/kanto.json','utf8')).maps;
export default async function run(ctx){
 const p=ctx.page, only=process.env.TRAINERS?.split(','), results={};
 const visible=()=>p.locator('#engine-interaction').isVisible();
 const hold=async(k,ms=130)=>{await p.keyboard.down(k);await p.waitForTimeout(ms);await p.keyboard.up(k);await p.waitForTimeout(520);};
 const state=(flag)=>p.evaluate(async(f)=>{const s=await import('/src/games/firered/save.ts');return {flag:s.flagGet(f),money:s.save.money,x:s.save.location.x,y:s.save.location.y,map:location.hash.match(/mapa=([A-Z0-9_]+)/)?.[1]};},flag);
 const approach=async(key)=>{let steps=0;for(;steps<6&&!await visible();steps++){await hold(key,450);await p.waitForTimeout(500);}return steps;};
 for(const [name,map,x,y,key,id] of TRAINERS){
  if(only&&!only.includes(name))continue;
  const flag=TRAINER_FLAGS_START+id, o=WORLD[map]??{x:0,y:0};
  try{
   await p.goto(new URL(`viewer.html#modo=explore&mapa=${map}&px=${x+o.x}&py=${y+o.y}`,BASE).href);
   await p.reload();
   await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
   await p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');const {createMon}=await import('/src/core/pokemon/pokemon.ts');save.party[0]=createMon(9,40);});
   await p.waitForTimeout(3000);
   const before=await state(flag);
   if(before.flag)throw Error('defeat flag already set');
   await p.locator('#viewport').focus();
   const steps=await approach(key);
   if(!await visible())throw Error('trainer did not engage after '+steps+' steps');
   for(let i=0;i<300&&await visible();i++)await hold('z');
   await p.waitForTimeout(1500);
   const after=await state(flag);
   if(!after.flag)throw Error('defeat flag not set '+JSON.stringify(after));
   if(after.money<=before.money)throw Error('no prize money '+before.money+'→'+after.money);
   await p.getByRole('button',{name:"Menu · Esc"}).click();
   await p.locator('#explore-save').click();await p.keyboard.press('Escape');
   await p.reload();await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
   await p.waitForTimeout(3000);
   const persisted=await state(flag);
   if(!persisted.flag||persisted.money!==after.money)throw Error('not persisted '+JSON.stringify(persisted));
   // Back and forth across the sight line: a defeated trainer must not engage.
   await p.locator('#viewport').focus();
   const back=key==='ArrowUp'?'ArrowDown':key==='ArrowDown'?'ArrowUp':key==='ArrowLeft'?'ArrowRight':'ArrowLeft';
   await hold(back,450);await hold(key,450);await p.waitForTimeout(1500);
   if(await visible()){await ctx.shot('reengage-'+name);throw Error('defeated trainer engaged again');}
   results[name]={pass:true,steps,prize:after.money-before.money};
  }catch(e){results[name]='FAIL '+String(e).slice(0,160);await ctx.shot('fail-'+name);}
 }
 const failed=Object.entries(results).filter(([,v])=>v.pass!==true);
 if(failed.length)throw Error('Route trainers failed '+JSON.stringify(failed));
 return {results,errors:ctx.errors()};
}
