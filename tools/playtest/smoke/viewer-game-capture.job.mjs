// PREPARED: Route 1 tall grass URL start. The encounter is the engine's own;
// the player throws Poke Balls from the battle bag with keys until the battle ends.
export default async function run(ctx){
 const p=ctx.page;
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_ROUTE1&px=14&py=-14',process.env.PW_BASE??'http://localhost:5173').href);
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 const snap=()=>p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');return JSON.parse(JSON.stringify({party:save.party.length,balls:save.bag.pokeBalls[0]?.quantity??0,caught:save.pokedexCaught.reduce((a,b)=>a+b.toString(2).replace(/0/g,'').length,0),boxes:JSON.stringify(save.boxes??save.pcBoxes??[]).length}));});
 const ctrl=()=>p.evaluate(()=>document.querySelector('#engine-interaction').dataset.battle+'|'+document.querySelector('#engine-interaction').dataset.script);
 const hold=async k=>{await p.keyboard.down(k);await p.waitForTimeout(120);await p.keyboard.up(k);await p.waitForTimeout(450);};
 const visible=()=>p.locator('#engine-interaction').isVisible();
 const before=await snap();
 await p.locator('#viewport').focus();
 let steps=0;
 for(;steps<300&&!await visible();steps++){const k=(steps>>2)%2?'ArrowUp':'ArrowDown';await p.keyboard.down(k);await p.waitForTimeout(150);await p.keyboard.up(k);await p.waitForTimeout(320);}
 if(!await visible())throw Error('No encounter');
 let throws=0;
 for(let i=0;i<400&&await visible();i++){
  const c=await ctrl();
  if(c.startsWith('HandleInputChooseAction')){
   await hold('ArrowRight');await hold('z');
   await p.waitForFunction(()=>document.querySelector('#engine-interaction').dataset.battle==='CompleteWhenChoseItem',{timeout:10000});
   await p.waitForTimeout(800);await hold('ArrowRight');await hold('ArrowRight');await hold('z');await p.waitForTimeout(500);await hold('z');
   throws++;await p.waitForTimeout(3000);
  } else await hold('z');
 }
 if(await visible())throw Error('Battle did not end after '+throws+' throws');
 await p.waitForTimeout(1500);
 const after=await snap();
 await ctx.shot('after-capture');
 return {steps,throws,before,after,errors:ctx.errors()};
}
