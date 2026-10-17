// PREPARED: Route 9 start next to the cut tree (map 2,8) with the Cascade Badge
// flag and Cut as a move of the lead. Cutting is the source EventScript_CutTree.
export default async function run(ctx){
 const p=ctx.page;
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_ROUTE9&px=255&py=-202',process.env.PW_BASE??'http://localhost:5173').href);
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 await p.evaluate(async()=>{const s=await import('/src/games/firered/save.ts');s.flagSet(2081);s.save.party[0].moves[1]=15;s.save.party[0].pp[1]=30;});
 await p.waitForTimeout(5000);
 const pos=()=>p.evaluate(()=>location.hash.match(/px=(-?\d+)&py=(-?\d+)/)?.slice(1).join(','));
 const hold=async(k,ms=130)=>{await p.keyboard.down(k);await p.waitForTimeout(ms);await p.keyboard.up(k);await p.waitForTimeout(600);};
 await p.locator('#viewport').focus();
 await hold('ArrowLeft');                // turn / bump into the tree
 await hold('z');await p.waitForTimeout(2000);await ctx.shot('ask');
 for(let i=0;i<10&&await p.locator('#engine-interaction').isVisible();i++){await hold('z');await p.waitForTimeout(500);}
 await p.waitForTimeout(1000);await ctx.shot('cut');
 const cutState=await p.evaluate(async()=>{const s=await import('/src/games/firered/save.ts');const C=await import('/src/games/firered/generated/constants.ts');return {temporary:s.flagGet(C.FLAG_TEMP_12),badge:s.flagGet(C.FLAG_BADGE02_GET)};});
 if(!cutState.temporary)throw Error('Source Cut did not set its temporary flag');
 // Save/continue on this map must preserve the actual Cut result.
 await p.getByRole('button',{name:'Menú · Esc'}).click();await p.locator('#explore-save').click();await p.keyboard.press('Escape');
 // PREPARED: discard an unsaved flag edit; Continue must restore the saved
 // result of the real Cut script, rather than clear it as a new map transition.
 await p.evaluate(async()=>{const s=await import('/src/games/firered/save.ts');const C=await import('/src/games/firered/generated/constants.ts');s.flagClear(C.FLAG_TEMP_12);});
 await p.getByRole('button',{name:'Menú · Esc'}).click();await p.locator('#explore-continue').click();
 await p.waitForFunction(async()=>{const s=await import('/src/games/firered/save.ts');const C=await import('/src/games/firered/generated/constants.ts');return s.flagGet(C.FLAG_TEMP_12);});
 await p.waitForTimeout(1500);
 await p.reload();await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);await p.waitForTimeout(1000);
 const cutTree=p.locator('.world-npc[data-map="MAP_ROUTE9"][data-local-id="10"]');
 if(await cutTree.count())throw Error('Saved Cut obstacle reappeared before leaving the map');
 const start=await pos();
 for(let i=0;i<8;i++){
  const map=await p.evaluate(async()=>(await import('/src/viewer/mapEvents.ts')).viewerEventMap());
  if(map==='MAP_CERULEAN_CITY')break;
  await hold('ArrowLeft',200);
 }
 await p.waitForTimeout(800);await ctx.shot('walked');
 const end=await pos();
 const dbg=await p.evaluate(()=>({hidden:document.querySelector('#engine-interaction').hidden,dlg:!!document.querySelector('dialog[open]'),menu:document.querySelector('#explore-menu')?.open}));
 if(start===end)throw Error('Cut tree still blocks: '+start);
 // Westward input crosses the real Route9 -> Cerulean connection.
 const after=await p.evaluate(async()=>{const s=await import('/src/games/firered/save.ts');const C=await import('/src/games/firered/generated/constants.ts');const {viewerEventMap}=await import('/src/viewer/mapEvents.ts');return {map:viewerEventMap(),temporary:s.flagGet(C.FLAG_TEMP_12),badge:s.flagGet(C.FLAG_BADGE02_GET)};});
 if(after.map!=='MAP_CERULEAN_CITY'||after.temporary||!after.badge)throw Error('Map transition did not clear only temporary progress '+JSON.stringify(after));
 // event_object_movement.c:1400-1422 rejects a newly loaded obstacle clone
 // inside +/-8,+/-6 of the player, even after the old TEMP flag was cleared.
 await cutTree.waitFor({state:'hidden'});
 for(let i=0;i<6;i++)await hold('ArrowLeft',200);
 await cutTree.waitFor({state:'visible'});
 // Camera connections retain an existing clone instead of initializing it again.
 for(let i=0;i<7;i++)await hold('ArrowRight',200);
 await cutTree.waitFor({state:'visible'});
 const retained=await p.evaluate(async()=>{const S=await import('/src/games/firered/save.ts');const E=await import('/src/viewer/mapEvents.ts');return {map:E.viewerEventMap(),flag:S.flagGet(18)};});
 if(retained.map!=='MAP_ROUTE9'||retained.flag)throw Error('Connection lost active clone '+JSON.stringify(retained));
 return {start,end,cutState,after,retained,saveContinue:'cut retained',connection:'temporaries cleared; permanent badge retained; near clone suppressed; clone spawned beyond source exclusion',errors:ctx.errors()};
}
