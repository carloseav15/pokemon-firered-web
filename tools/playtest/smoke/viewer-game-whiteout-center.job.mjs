// PREPARED: URL starts at Viridian's nurse counter, then Route 1 grass and the
// Mt. Moon 1F entrance; the 1 HP lead before each walk is an explicit
// precondition. The respawn point is set by the source nurse script
// (setrespawn HEAL_LOCATION_VIRIDIAN_CITY) and kept by the viewer save, never
// written by this job. Each loss must run the engine white-out, put the player
// in Viridian's Pokémon Center and heal the party there (EventScript_AfterWhiteOutHeal).
// Run with PW_TIMEOUT_MS=580000.
const BASE=process.env.PW_BASE??'http://localhost:5173';
export default async function run(ctx){
 const p=ctx.page;
 const snap=()=>p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');return JSON.parse(JSON.stringify({hp:save.party[0].hp,max:save.party[0].stats[0],status:save.party[0].status,money:save.money,loc:save.location,heal:save.lastHealLocation,map:location.hash.match(/mapa=([A-Z0-9_]+)/)?.[1]}));});
 const visible=()=>p.locator('#engine-interaction').isVisible();
 const open=async(hash)=>{await p.goto(new URL('viewer.html#modo=explore&'+hash,BASE).href);await p.reload();await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);await p.waitForTimeout(1500);};
 const saveGame=async()=>{await p.getByRole('button',{name:"Menu · Esc"}).click();await p.getByRole('button',{name:"Save game",exact:true}).click();if(!await p.locator('#explore-save-result').innerText().then(t=>t.includes("saved")))throw Error('Save failed');await p.keyboard.press('Escape');};

 // 1. Source nurse heal registers Viridian as the respawn point.
 await open('mapa=MAP_VIRIDIAN_CITY_POKEMON_CENTER_1F&px=7&py=4');
 await p.locator('#viewport').focus();await p.keyboard.press('ArrowUp');await p.waitForTimeout(400);await p.keyboard.press('z');
 await p.waitForFunction(()=>document.querySelector('#engine-interaction')?.dataset.scriptActive==='true',{timeout:20000});
 await p.waitForTimeout(3000);await p.keyboard.press('z');await p.waitForTimeout(1000);await p.keyboard.press('z');
 for(let i=0;i<60;i++){if(await p.locator('#engine-interaction').getAttribute('data-script-active')==='false')break;await p.keyboard.press('z');await p.waitForTimeout(500);}
 await p.locator('#engine-interaction').waitFor({state:'hidden',timeout:15000});
 const registered=(await snap()).heal;
 await saveGame();

 const lose=async(label,hash,keys)=>{
  await open(hash);
  const restored=(await snap()).heal;
  if(JSON.stringify(restored)!==JSON.stringify(registered))throw Error(label+': respawn not restored '+JSON.stringify(restored));
  await p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');save.party[0].hp=1;});
  await p.locator('#viewport').focus();
  let steps=0,after;
  for(let battle=0;battle<8;battle++){
   for(;steps<400&&!await visible();steps++){const k=keys[(steps>>2)%2];await p.keyboard.down(k);await p.waitForTimeout(150);await p.keyboard.up(k);await p.waitForTimeout(320);}
   if(!await visible())throw Error(label+': no encounter');
   for(let i=0;i<500&&await visible();i++){await p.keyboard.press('z');await p.waitForTimeout(380);}
   if(await visible())throw Error(label+': battle/white-out did not end');
   await p.waitForTimeout(4000);
   after=await snap();
   if(after.hp===after.max)break;
  }
  await ctx.shot('after-'+label);
  const place=await p.locator('#explore-location').innerText();
  if(after.hp!==after.max||after.status!==0)throw Error(label+': party not healed '+JSON.stringify(after));
  if(after.map!=='MAP_VIRIDIAN_CITY_POKEMON_CENTER_1F')throw Error(label+': respawned at '+after.map+' '+place);
  return {steps,place,after};
 };
 const grass=await lose('route1','mapa=MAP_ROUTE1&px=14&py=-14',['ArrowUp','ArrowDown']);
 const cave=await lose('mtmoon','mapa=MAP_MT_MOON_1F&px=18&py=34',['ArrowUp','ArrowDown']);
 return {registered,grass,cave,errors:ctx.errors()};
}
