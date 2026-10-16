// PREPARED: Route 1 grass start with a Repel counter of 3 (the item effect itself
// is the source Repel use). Real steps must consume it and run "Repel wore off".
export default async function run(ctx){
 const p=ctx.page;
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_ROUTE1&px=14&py=-14',process.env.PW_BASE??'http://localhost:5173').href);
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 await p.waitForTimeout(6000); // engine warm-up
 const read=()=>p.evaluate(async()=>{const {varGet}=await import('/src/games/firered/save.ts');const {save}=await import('/src/games/firered/save.ts');return {repel:varGet(16416)};});
 await p.evaluate(async()=>{const s=await import('/src/games/firered/save.ts');s.varSet(16416,3);});
 const hold=async k=>{await p.keyboard.down(k);await p.waitForTimeout(150);await p.keyboard.up(k);await p.waitForTimeout(450);};
 await p.locator('#viewport').focus();
 const seen=[];
 for(let i=0;i<14;i++){await hold(i%8<4?'ArrowDown':'ArrowUp');seen.push((await read()).repel);if(await p.locator('#engine-interaction').isVisible())break;}
 await p.waitForTimeout(1500);await ctx.shot('repel');
 return {seen,errors:ctx.errors()};
}
