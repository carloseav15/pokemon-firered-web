// PREPARED: Route 1 start; the lead gets the field move (and the badge / visited
// flags Fly checks) as explicit preconditions. The party menu, field move
// script/animation and destination are the source ones; the viewer must follow
// the engine's warp.
// MOVE=teleport|fly selects one (default: both).
const MOVES={
 teleport:{move:100,prep:async()=>{}},
 fly:{move:19,prep:async()=>{const s=await import('/src/games/firered/save.ts');const C=await import('/src/games/firered/generated/constants.ts');s.flagSet(C.FLAG_BADGE03_GET);s.flagSet(C.FLAG_WORLD_MAP_PALLET_TOWN);s.flagSet(C.FLAG_WORLD_MAP_VIRIDIAN_CITY);s.flagSet(C.FLAG_WORLD_MAP_PEWTER_CITY);}},
};
export default async function run(ctx){
 const p=ctx.page, only=process.env.MOVE?.split(','), results={};
 const state=()=>p.evaluate(async()=>{const {gMain}=await import('/src/core/hw/runtime.ts');const {tasks}=await import('/src/core/gba/tasks.ts');return {cb2:gMain.callback2?.name??'',tasks:tasks.tasks.filter(t=>t.isActive).map(t=>t.func.name),open:!document.querySelector('#engine-interaction').hidden};});
 const map=()=>p.evaluate(()=>{const h=location.hash;return (h.match(/mapa=([A-Z0-9_]+)/)?.[1]??'ext')+' '+(h.match(/px=(-?\d+)/)?.[1])+','+(h.match(/py=(-?\d+)/)?.[1])+' '+(document.querySelector('#explore-location')?.textContent??'');});
 const tapKey=async(k,ms=100)=>{await p.keyboard.down(k);await p.waitForTimeout(ms);await p.keyboard.up(k);};
 let shots=0;
 const press=async k=>{await tapKey(k);await p.waitForTimeout(550);if(process.env.DEBUG_SHOTS)await ctx.shot('s'+String(++shots).padStart(2,'0')+'-'+k);};
 const waitFor=async(label,pred)=>{for(let i=0;i<80;i++){const s=await state();if(pred(s)){await p.waitForTimeout(400);return s;}await p.waitForTimeout(300);}await ctx.shot('stuck-'+label);throw Error('stuck '+label+' '+JSON.stringify(await state()));};
 for(const [name,cfg] of Object.entries(MOVES)){
  if(only&&!only.includes(name))continue;
  try{
   await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_ROUTE1&px=14&py=-11',process.env.PW_BASE??'http://localhost:5173').href);
   await p.reload();
   await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
   await p.evaluate(async(arg)=>{const s=await import('/src/games/firered/save.ts');s.save.party[0].moves[1]=arg.move;s.save.party[0].pp[1]=10;},{move:cfg.move});
   await p.evaluate(cfg.prep);
   await p.waitForTimeout(6000);await p.locator('#viewport').focus();
   const before=await map();
   await press('Enter');await waitFor('start',s=>s.tasks.includes('startInput'));
   await press('ArrowDown');await press('z');
   await waitFor('party',s=>s.tasks.includes('Task_HandleChooseMonInput'));
   await press('z');await waitFor('menu',s=>s.tasks.includes('Task_HandleSelectionMenuInput'));await ctx.shot(name+'-menu');
   await press('ArrowDown');await press('z');                           // second entry = the field move (after SUMMARY)
   if(name==='fly'){await waitFor('flymap',s=>s.cb2.includes('FlyMap')||s.tasks.some(t=>t.includes('FlyMap')||t.includes('RegionMap')));await p.waitForTimeout(1500);await ctx.shot('flymap');for(const k of (process.env.FLYKEYS??'ArrowDown').split(',')){await tapKey(k,30);await p.waitForTimeout(700);}await ctx.shot('flymap-cursor');await press('z');}
   for(let i=0;i<80;i++){const s=await state();if(!s.open)break;await p.waitForTimeout(500);if(i%6===5)await press('z');}
   await p.waitForTimeout(3000);
   const after=await map();
   await ctx.shot(name+'-after');
   results[name]=before!==after?`PASS ${before} -> ${after}`:`FAIL still ${after}`;
  }catch(e){results[name]='FAIL '+String(e).slice(0,160);await ctx.shot('fail-'+name);}
 }
 const failed=Object.entries(results).filter(([,v])=>!v.startsWith('PASS'));
 if(failed.length)throw Error('Field moves failed '+JSON.stringify(results));
 return {results,errors:ctx.errors()};
}
