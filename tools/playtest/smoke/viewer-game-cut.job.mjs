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
 const start=await pos();
 await hold('ArrowLeft',450);await hold('ArrowLeft',450);
 await p.waitForTimeout(800);await ctx.shot('walked');
 const end=await pos();
 const dbg=await p.evaluate(()=>({hidden:document.querySelector('#engine-interaction').hidden,dlg:!!document.querySelector('dialog[open]'),menu:document.querySelector('#explore-menu')?.open}));
 if(start===end)throw Error('Cut tree still blocks: '+start);
 return {start,end,errors:ctx.errors()};
}
