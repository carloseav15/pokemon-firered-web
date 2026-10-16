// PREPARED: each URL starts at the source nurse counter and the injury is an
// Run with PW_TIMEOUT_MS=580000; CENTERS=MAP_A,MAP_B limits the list.
// explicit precondition. Healing is the source nurse script; keys only.
const CENTERS=[["MAP_CELADON_CITY_POKEMON_CENTER_1F",7,2],["MAP_CERULEAN_CITY_POKEMON_CENTER_1F",7,2],["MAP_CINNABAR_ISLAND_POKEMON_CENTER_1F",7,2],["MAP_FIVE_ISLAND_POKEMON_CENTER_1F",7,2],["MAP_FOUR_ISLAND_POKEMON_CENTER_1F",7,2],["MAP_FUCHSIA_CITY_POKEMON_CENTER_1F",7,2],["MAP_INDIGO_PLATEAU_POKEMON_CENTER_1F",13,10],["MAP_LAVENDER_TOWN_POKEMON_CENTER_1F",7,2],["MAP_ONE_ISLAND_POKEMON_CENTER_1F",5,2],["MAP_PEWTER_CITY_POKEMON_CENTER_1F",7,2],["MAP_ROUTE10_POKEMON_CENTER_1F",7,2],["MAP_ROUTE4_POKEMON_CENTER_1F",7,2],["MAP_SAFFRON_CITY_POKEMON_CENTER_1F",7,2],["MAP_SEVEN_ISLAND_POKEMON_CENTER_1F",7,2],["MAP_SIX_ISLAND_POKEMON_CENTER_1F",7,2],["MAP_THREE_ISLAND_POKEMON_CENTER_1F",7,2],["MAP_TWO_ISLAND_POKEMON_CENTER_1F",7,2],["MAP_VERMILION_CITY_POKEMON_CENTER_1F",7,2],["MAP_VIRIDIAN_CITY_POKEMON_CENTER_1F",7,2]];
import {readFileSync} from 'node:fs';
const HEAL=JSON.parse(readFileSync('public/fr/data/heal_locations.json','utf8')).heal_locations;
export default async function run(ctx){
 const p=ctx.page, only=process.env.CENTERS?.split(','), results={};
 const snapshot=()=>p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');return JSON.parse(JSON.stringify(save));});
 for(const [map,nx,ny] of CENTERS){
  if(only&&!only.includes(map))continue;
  try{
   await p.goto(new URL(`viewer.html#modo=explore&mapa=${map}&px=${nx}&py=${ny+2}`,process.env.PW_BASE??'http://localhost:5173').href);
   await p.reload();
   await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
   await p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');save.party[0].hp=1;save.party[0].status=8;});
   await p.locator('#viewport').focus();await p.keyboard.press('ArrowUp');await p.waitForTimeout(400);await p.keyboard.press('z');
   await p.locator('#engine-interaction').waitFor({state:'visible',timeout:15000});
   await p.waitForFunction(()=>document.querySelector('#engine-interaction')?.dataset.scriptActive==='true',{timeout:20000});
   await p.waitForTimeout(3000);await p.keyboard.press('z');await p.waitForTimeout(1000);await p.keyboard.press('z');
   let s;
   for(let i=0;i<20;i++){await p.waitForTimeout(700);await p.keyboard.press('z');s=await snapshot();if(s.party[0].hp>1)break;}
   for(let i=0;i<60;i++){if(await p.locator('#engine-interaction').getAttribute('data-script-active')==='false')break;await p.keyboard.press('z');await p.waitForTimeout(400);}
   await p.locator('#engine-interaction').waitFor({state:'hidden',timeout:15000});
   s=await snapshot();
   // setrespawn stores the heal location whose respawn_map is this center (heal_location.c).
   const expected=HEAL.find(h=>(h.respawn_map??h.map)===map);
   const respawn=!!expected&&await p.evaluate(async(e)=>{const {save}=await import('/src/games/firered/save.ts');return save.lastHealLocation.x===e.x&&save.lastHealLocation.y===e.y;},expected);
   results[map]=s.party[0].hp===s.party[0].stats[0]&&s.party[0].status===0?(respawn?'PASS':'FAIL respawn point not this center'):'FAIL hp '+s.party[0].hp;
  }catch(e){results[map]='FAIL '+String(e).slice(0,100);await ctx.shot('fail-'+map);}
 }
 const failed=Object.entries(results).filter(([,v])=>v!=='PASS');
 if(failed.length)throw Error('Centers failed '+JSON.stringify(failed));
 return {centers:Object.keys(results).length,errors:ctx.errors()};
}
