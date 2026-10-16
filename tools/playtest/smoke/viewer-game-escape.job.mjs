// PREPARED: Route 4 start one tile south of the Mt. Moon door (map 19,5) with an
// Escape Rope (or Dig on the lead) as explicit precondition. The cave is entered by
// walking through the real warp, so the escape warp comes from that entry; the
// rope/Dig script and warp are the engine's.
// SCENARIO=rope|dig selects one (default both).
export default async function run(ctx){
 const p=ctx.page, only=process.env.SCENARIO?.split(','), results={};
 const state=()=>p.evaluate(async()=>{const {gMain}=await import('/src/core/hw/runtime.ts');const {tasks}=await import('/src/core/gba/tasks.ts');return {cb2:gMain.callback2?.name??'',tasks:tasks.tasks.filter(t=>t.isActive).map(t=>t.func.name),open:!document.querySelector('#engine-interaction').hidden};});
 const where=()=>p.evaluate(()=>{const h=location.hash;return (h.match(/mapa=([A-Z0-9_]+)/)?.[1]??'ext')+' '+(document.querySelector('#explore-location')?.textContent??'');});
 const tapKey=async(k,ms=100)=>{await p.keyboard.down(k);await p.waitForTimeout(ms);await p.keyboard.up(k);};
 const press=async k=>{await tapKey(k);await p.waitForTimeout(550);};
 const waitFor=async(label,pred)=>{for(let i=0;i<80;i++){const s=await state();if(pred(s)){await p.waitForTimeout(400);return s;}await p.waitForTimeout(300);}await ctx.shot('stuck-'+label);throw Error('stuck '+label+' '+JSON.stringify(await state()));};
 const enterCave=async(setup)=>{
  await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_ROUTE4&px=115&py=-204',process.env.PW_BASE??'http://localhost:5173').href);
  await p.reload();
  await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
  await p.evaluate(setup);
  await p.waitForTimeout(6000);await p.locator('#viewport').focus();
  await tapKey('ArrowUp',500);await p.waitForTimeout(500);await tapKey('ArrowUp',500);
  for(let i=0;i<40&&!(await where()).startsWith('MAP_MT_MOON_1F');i++)await p.waitForTimeout(400);
  await p.waitForTimeout(3000);
  const inside=await where();
  if(!inside.startsWith('MAP_MT_MOON_1F'))throw Error('did not enter Mt. Moon: '+inside);
  return inside;
 };
 const scenarios={
  async rope(){
   await enterCave(async()=>{const {addBagItem}=await import('/src/core/pokemon/items.ts');addBagItem(85,1);});
   await press('Enter');await waitFor('start',s=>s.tasks.includes('startInput'));
   await press('ArrowDown');await press('ArrowDown');await press('z');await waitFor('bag',s=>s.tasks.includes('Task_BagMenu_HandleInput'));
   await press('z');await p.waitForTimeout(500);await press('z');                    // ESCAPE ROPE -> USE
   for(let i=0;i<60&&(await state()).open;i++){await p.waitForTimeout(500);if(i%8===7)await press('z');}
   await p.waitForTimeout(3000);
   const after=await where();await ctx.shot('rope-after');
   if(after.startsWith('MAP_'))throw Error('Escape Rope did not leave the cave: '+after);
   return 'left the cave -> '+after;
  },
  async dig(){
   await enterCave(async()=>{const s=await import('/src/games/firered/save.ts');s.save.party[0].moves[1]=91;s.save.party[0].pp[1]=10;});
   await press('Enter');await waitFor('start',s=>s.tasks.includes('startInput'));
   await press('ArrowDown');await press('z');await waitFor('party',s=>s.tasks.includes('Task_HandleChooseMonInput'));
   await press('z');await waitFor('menu',s=>s.tasks.includes('Task_HandleSelectionMenuInput'));
   await press('ArrowDown');await press('z');                                          // DIG
   for(let i=0;i<60&&(await state()).open;i++){await p.waitForTimeout(500);if(i%6===5)await press('z');}
   await p.waitForTimeout(3000);
   const after=await where();await ctx.shot('dig-after');
   if(after.startsWith('MAP_'))throw Error('Dig did not leave the cave: '+after);
   return 'left the cave -> '+after;
  },
 };
 for(const name of ['rope','dig']){
  if(only&&!only.includes(name))continue;
  try{results[name]='PASS '+await scenarios[name]();}catch(e){results[name]='FAIL '+String(e).slice(0,200);await ctx.shot('fail-'+name);}
 }
 const failed=Object.entries(results).filter(([,v])=>!v.startsWith('PASS'));
 if(failed.length)throw Error('Escape failed '+JSON.stringify(results));
 return {results,errors:ctx.errors()};
}
