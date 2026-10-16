// PREPARED: Viridian Pokémon Center URL start; the temporary start grants the
// Pokédex flag. Everything else is the source start menu driven by keys.
export default async function run(ctx){
 const p=ctx.page;
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_VIRIDIAN_CITY_POKEMON_CENTER_1F&px=7&py=6',process.env.PW_BASE??'http://localhost:5173').href);
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 const names=()=>p.evaluate(async()=>{const {tasks}=await import('/src/core/gba/tasks.ts');return tasks.tasks.filter(t=>t.isActive).map(t=>t.func.name);});
 const tap=async k=>{await p.keyboard.press(k);await p.waitForTimeout(900);};
 const inputs=async()=>(await names()).filter(n=>n==='startInput').length;
 await p.locator('#viewport').focus();
 await tap('Enter');
 await p.locator('#engine-interaction').waitFor({state:'visible'});
 await p.waitForTimeout(1500);
 if(await inputs()!==1)throw Error('start menu input tasks '+await inputs());
 await ctx.shot('start-menu');
 const log={};
 // [name, key presses to reach it from the menu cursor]; the cursor persists.
 const entries=[['pokedex',[]],['party',['ArrowDown']],['bag',['ArrowDown']],['trainer-card',['ArrowDown']],['option',['ArrowDown','ArrowDown']]];
 for(const [name,moves] of entries){
  for(const k of moves)await tap(k);
  await tap('z');await p.waitForTimeout(2500);
  await ctx.shot(name);
  await tap('x');await p.waitForTimeout(3000);
  const n=await inputs();log[name]=n;
  if(n!==1){await ctx.shot('dup-'+name);throw Error('start menu input tasks after '+name+': '+n);}
 }
 await tap('x');
 await p.locator('#engine-interaction').waitFor({state:'hidden',timeout:15000});
 return {inputTasksAfterReturn:log,errors:ctx.errors()};
}
