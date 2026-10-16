// PREPARED: Viridian Center URL start with a second party member (explicit
// precondition). Summary, party switch and option changes use the source menus;
// every key waits for the engine task/callback that accepts it.
export default async function run(ctx){
 const p=ctx.page;
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_VIRIDIAN_CITY_POKEMON_CENTER_1F&px=7&py=6',process.env.PW_BASE??'http://localhost:5173').href);
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 await p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');const {createMon}=await import('/src/core/pokemon/pokemon.ts');save.party.push(createMon(16,7));});
 const species=()=>p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');return save.party.map(m=>m.species);});
 const opts=()=>p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');return JSON.parse(JSON.stringify(save.options));});
 const state=()=>p.evaluate(async()=>{const {gMain}=await import('/src/core/hw/runtime.ts');const {tasks}=await import('/src/core/gba/tasks.ts');return {cb2:gMain.callback2?.name??'',tasks:tasks.tasks.filter(t=>t.isActive).map(t=>t.func.name)};});
 const waitFor=async(label,pred,key)=>{for(let i=0;i<60;i++){const s=await state();if(pred(s)){await p.waitForTimeout(400);return s;}if(key&&i%6===5)await tapKey(key);await p.waitForTimeout(300);}await ctx.shot('stuck-'+label);throw Error('stuck '+label+' '+JSON.stringify(await state()));};
 const tapKey=async(k,ms=100)=>{await p.keyboard.down(k);await p.waitForTimeout(ms);await p.keyboard.up(k);};
 const press=async k=>{await tapKey(k);await p.waitForTimeout(500);};
 await p.locator('#viewport').focus();
 const first=await species();
 await press('Enter');
 await waitFor('start',s=>s.tasks.includes('startInput'));
 await press('ArrowDown');await press('z');
 await waitFor('party',s=>s.cb2==='CB2_UpdatePartyMenu'&&s.tasks.includes('Task_HandleChooseMonInput'));
 await press('z');await p.waitForTimeout(500);await ctx.shot('party-menu');
 await press('z');                                                        // SUMMARY
 await waitFor('summary',s=>s.cb2==='CB2_RunPokemonSummaryScreen');await p.waitForTimeout(1500);await ctx.shot('summary');
 await press('x');
 await waitFor('party2',s=>s.cb2==='CB2_UpdatePartyMenu'&&s.tasks.includes('Task_HandleSelectionMenuInput')); // back at SUMMARY/SWITCH menu
 await press('ArrowDown');await press('z');   // SWITCH
 await p.waitForTimeout(600);await press('ArrowDown');await press('z');await p.waitForTimeout(3000);await ctx.shot('switched');
 const swapped=await species();
 await waitFor('party3',s=>s.tasks.includes('Task_HandleChooseMonInput'));
 await press('x');
 await waitFor('start2',s=>s.tasks.includes('startInput'));
 for(let i=0;i<4;i++)await press('ArrowDown');
 await press('z');
 await waitFor('option',s=>s.cb2.includes('Option')||s.tasks.some(t=>t.includes('Option')));
 const optBefore=await opts();
 await p.waitForTimeout(800);await ctx.shot('option-open');
 await press('ArrowRight');await p.waitForTimeout(500);await ctx.shot('options');
 await press('x');
 await waitFor('start3',s=>s.tasks.includes('startInput'));
 const optAfter=await opts();
 await press('x');await p.locator('#engine-interaction').waitFor({state:'hidden',timeout:10000});
 await p.getByRole('button',{name:'Menú · Esc'}).click();await p.locator('#explore-save').click();await p.keyboard.press('Escape');
 await p.reload();await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 const persisted=await opts();
 const ok={switched:swapped[0]===first[1]&&swapped[1]===first[0],optionChanged:JSON.stringify(optBefore)!==JSON.stringify(optAfter),persisted:JSON.stringify(persisted)===JSON.stringify(optAfter)};
 if(!ok.switched||!ok.optionChanged||!ok.persisted)throw Error('Menu checks failed '+JSON.stringify({ok,first,swapped,optBefore,optAfter,persisted}));
 return {ok,first,swapped,optAfter,errors:ctx.errors()};
}
