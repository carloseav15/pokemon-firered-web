// PREPARED: Route 1 tall grass URL start and a 1 HP lead (explicit precondition).
// Losing the wild battle must run the engine's white-out and continue the viewer
// at the respawn point with the party healed.
export default async function run(ctx){
 const p=ctx.page;
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_ROUTE1&px=14&py=-14',process.env.PW_BASE??'http://localhost:5173').href);
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 await p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');save.party[0].hp=1;});
 const snap=()=>p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');return JSON.parse(JSON.stringify({hp:save.party[0].hp,max:save.party[0].stats[0],money:save.money,loc:save.location,hash:location.hash}));});
 const hold=async k=>{await p.keyboard.down(k);await p.waitForTimeout(120);await p.keyboard.up(k);await p.waitForTimeout(450);};
 const visible=()=>p.locator('#engine-interaction').isVisible();
 const before=await snap();
 await p.locator('#viewport').focus();
 let steps=0,battles=0,after;
 for(;battles<8;battles++){
  for(;steps<400&&!await visible();steps++){const k=(steps>>2)%2?'ArrowUp':'ArrowDown';await p.keyboard.down(k);await p.waitForTimeout(150);await p.keyboard.up(k);await p.waitForTimeout(320);}
  if(!await visible())throw Error('No encounter');
  for(let i=0;i<400&&await visible();i++)await hold('z');
  if(await visible())throw Error('Battle/white-out did not end');
  await p.waitForTimeout(4000);
  after=await snap();
  if(after.hp===after.max)break; // fainted -> healed by the white-out
 }
 await ctx.shot('after-whiteout');
 if(after.hp!==after.max)throw Error('Party not healed '+JSON.stringify(after));
 const place=await p.locator('#explore-location').innerText();
 return {steps,battles,place,before,after,errors:ctx.errors()};
}
