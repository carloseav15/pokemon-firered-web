// PREPARED: Viridian Center URL start in front of the PC (11,1). The script is
// the source EventScript_PC reached through the metatile behavior lookup.
export default async function run(ctx){
 const p=ctx.page;
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_VIRIDIAN_CITY_POKEMON_CENTER_1F&px=11&py=2',process.env.PW_BASE??'http://localhost:5173').href);
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 await p.waitForTimeout(3000);
 const hold=async(k,ms=120)=>{await p.keyboard.down(k);await p.waitForTimeout(ms);await p.keyboard.up(k);await p.waitForTimeout(700);};
 await p.locator('#viewport').focus();
 await hold('ArrowUp');await hold('ArrowUp',60);
 await hold('z');
 await p.locator('#engine-interaction').waitFor({state:'visible',timeout:15000});
 await p.waitForTimeout(3500);await ctx.shot('pc-boot');
 const entry=await p.locator('#engine-interaction').getAttribute('data-script');
 await hold('z');await p.waitForTimeout(1500);await ctx.shot('pc-menu');
 // Someone's PC -> storage; then back out with B until the script ends.
 await hold('z');await p.waitForTimeout(3000);await hold('z');await p.waitForTimeout(4000);await ctx.shot('pc-storage');
 await hold('z');await p.waitForTimeout(5000);await ctx.shot('storage-ui');
 for(let i=0;i<12&&await p.locator('#engine-interaction').isVisible();i++){await hold('x');await p.waitForTimeout(500);}
 const closed=!await p.locator('#engine-interaction').isVisible();
 return {entry,closed,errors:ctx.errors()};
}
