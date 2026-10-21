// PREPARED: Pallet Town URL start, a Lv50 lead with Repel steps left (no wild
// battles in the Route 1 grass) and an active roamer (roamer.c InitRoamer, which
// the story starts after the National Pokédex). Walking across the Pallet ↔
// Route 1 connection is a camera transition: overworld.c runs
// UpdateLocationHistoryForRoamer + RoamerMove, so the roamer's map changes and
// the location history records the maps the player entered. Save/reload
// (Overworld_ResetStateOnContinue) places the roamer again.
// Run with PW_TIMEOUT_MS=300000.
const BASE=process.env.PW_BASE??'http://localhost:5173';
export default async function run(ctx){
 const p=ctx.page;
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_PALLET_TOWN&px=12&py=3',BASE).href);await p.reload();
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 const roamer=()=>p.evaluate(async()=>{const r=await import('/src/core/pokemon/roamer.ts');const {save}=await import('/src/games/firered/save.ts');return {loc:r.GetRoamerLocation().join(':'),here:save.location.mapGroup+':'+save.location.mapNum,pos:location.hash.match(/px=(-?\d+)&py=(-?\d+)/)?.slice(1).join(',')};});
 await p.evaluate(async()=>{const r=await import('/src/core/pokemon/roamer.ts');r.InitRoamer();const s=await import('/src/games/firered/save.ts');const C=await import('/src/games/firered/generated/constants.ts');const {createMon}=await import('/src/core/pokemon/pokemon.ts');s.save.party[0]=createMon(s.save.party[0].species,50);s.varSet(C.VAR_REPEL_STEP_COUNT,250);});
 await p.waitForTimeout(5000);await p.locator('#viewport').focus();
 const start=await roamer();
 const crossings=[];
 for(let i=0;i<6;i++){
  const k=i%2?'ArrowDown':'ArrowUp';
  await p.keyboard.down(k);await p.waitForTimeout(1300);await p.keyboard.up(k);await p.waitForTimeout(900);
  crossings.push(await roamer());
 }
 const maps=new Set(crossings.map(c=>c.here));
 if(maps.size<2)throw Error('Did not cross the connection '+JSON.stringify(crossings));
 const moved=crossings.filter((c,i)=>c.loc!==(i?crossings[i-1].loc:start.loc)).length;
 // RoamerMove always picks another map of the set (or another set 1/16 of the time).
 if(moved<5)throw Error('Roamer did not move on map changes '+JSON.stringify({start,crossings}));
 await p.getByRole('button',{name:"Menu · Esc"}).click();await p.locator('#explore-save').click();await p.keyboard.press('Escape');
 await p.reload();await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);await p.waitForTimeout(2000);
 const reloaded=await roamer();
 if(reloaded.loc.endsWith(':0')&&reloaded.loc.startsWith('0'))throw Error('Roamer not placed after reload '+JSON.stringify(reloaded));
 return {start,crossings,moved,reloaded,errors:ctx.errors()};
}
