// PREPARED: Route 1 start with the Bicycle key item in the bag (the temporary
// start has none). Using it from the source bag must put the avatar on the bike.
export default async function run(ctx){
 const p=ctx.page;
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_ROUTE1&px=14&py=-8',process.env.PW_BASE??'http://localhost:5173').href);
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 await p.evaluate(async()=>{const {addBagItem}=await import('/src/core/pokemon/items.ts');addBagItem(360,1);});
 const hold=async k=>{await p.keyboard.down(k);await p.waitForTimeout(120);await p.keyboard.up(k);await p.waitForTimeout(700);};
 const bike=()=>p.evaluate(()=>document.getElementById('bike-btn')?.style.background||'');
 await p.locator('#viewport').focus();
 const before=await bike();
 await hold('Enter');await p.waitForTimeout(1200);
 await hold('ArrowDown');await hold('ArrowDown');await hold('z');await p.waitForTimeout(2500);
 await hold('ArrowRight');await p.waitForTimeout(500);await ctx.shot('keyitems');
 await hold('z');await ctx.shot('menu');await hold('z');await p.waitForTimeout(3000);
 for(let i=0;i<8&&await p.locator('#engine-interaction').isVisible();i++){await hold('z');await p.waitForTimeout(400);}
 await p.waitForTimeout(1000);
 const after=await bike();
 await ctx.shot('on-bike');
 return {before,after,errors:ctx.errors()};
}
