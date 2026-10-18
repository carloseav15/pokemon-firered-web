// PREPARED: Viridian Center URL start; six species registered seen+caught and
// three seen only (HandleSetPokedexFlag, as catching/seeing would) are explicit
// preconditions. The source Pokédex (pokedex_screen.c) is driven by keys:
// top menu → NUMERICAL MODE list → Bulbasaur page → area/size page → back to
// the list and the top menu → close. The seen/owned counts come from the
// engine's dex flags. Screenshots of each page are for review: the size
// silhouettes and area markers are sprites that stay hidden in the viewer (see
// TAREAS-FINALES.md, DISPCNT without OBJ_ON). Run with PW_TIMEOUT_MS=300000.
const BASE=process.env.PW_BASE??'http://localhost:5173';
const CAUGHT=[1,10,13,16,19,74], SEEN=[21,25,41];
export default async function run(ctx){
 const p=ctx.page;
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_VIRIDIAN_CITY_POKEMON_CENTER_1F&px=7&py=6',BASE).href);await p.reload();
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 await p.evaluate(async([caught,seen])=>{const C=await import('/src/games/firered/generated/constants.ts');const {HandleSetPokedexFlag}=await import('/src/core/pokemon/mon_extra.ts');
  for(const sp of caught){HandleSetPokedexFlag(sp,C.FLAG_SET_SEEN,0);HandleSetPokedexFlag(sp,C.FLAG_SET_CAUGHT,0);}
  for(const sp of seen)HandleSetPokedexFlag(sp,C.FLAG_SET_SEEN,0);},[CAUGHT,SEEN]);
 await p.waitForTimeout(6000);await p.locator('#viewport').focus();
 const tasks=()=>p.evaluate(async()=>{const {tasks}=await import('/src/core/gba/tasks.ts');return tasks.tasks.filter(t=>t.isActive).map(t=>t.func.name);});
 const counts=()=>p.evaluate(async()=>{const C=await import('/src/games/firered/generated/constants.ts');const {GetKantoPokedexCount}=await import('/src/core/pokemon/pokemon.ts');return {seen:GetKantoPokedexCount(C.FLAG_GET_SEEN),caught:GetKantoPokedexCount(C.FLAG_GET_CAUGHT)};});
 const step=async(key,label,want,wait=2500)=>{await p.keyboard.press(key);for(let i=0;i<20;i++){await p.waitForTimeout(wait/10);const t=await tasks();if(want(t)){await p.waitForTimeout(500);await ctx.shot(label);return t;}}await ctx.shot('stuck-'+label);throw Error('stuck '+label+' '+JSON.stringify(await tasks()));};
 const c=await counts();
 // The temporary start registers its random starter as caught; count it once.
 const starter=await p.evaluate(async()=>(await import('/src/games/firered/save.ts')).save.party[0].species);
 const caught=new Set([...CAUGHT,starter]), seen=new Set([...caught,...SEEN]);
 if(c.caught!==caught.size||c.seen!==seen.size)throw Error('Unexpected dex counts '+JSON.stringify({c,starter}));
 await step('Enter','start',t=>t.includes('startInput'),1500);
 await step('z','top-menu',t=>t.includes('Task_PokedexScreen'));
 await step('z','numerical-list',t=>t.includes('Task_DexScreen_NumericalOrder'));
 await step('z','mon-page',t=>t.includes('Task_DexScreen_ShowMonPage')&&!t.includes('Task_ShowAreaMarkers'));
 await step('z','area-size-page',t=>t.includes('Task_ShowAreaMarkers'));
 await step('x','mon-page-again',t=>t.includes('Task_DexScreen_ShowMonPage')&&!t.includes('Task_ShowAreaMarkers'));
 await step('x','list-again',t=>t.includes('Task_DexScreen_NumericalOrder'));
 // Scroll down to No010 (Caterpie) and open it too.
 for(let i=0;i<9;i++){await p.keyboard.press('ArrowDown');await p.waitForTimeout(250);}
 await step('z','caterpie-page',t=>t.includes('Task_DexScreen_ShowMonPage'));
 await step('x','list-third',t=>t.includes('Task_DexScreen_NumericalOrder'));
 await step('x','top-again',t=>t.includes('Task_PokedexScreen'));
 await step('x','start-again',t=>t.includes('startInput'));
 await p.keyboard.press('x');await p.locator('#engine-interaction').waitFor({state:'hidden',timeout:10000});
 return {counts:c,errors:ctx.errors()};
}
