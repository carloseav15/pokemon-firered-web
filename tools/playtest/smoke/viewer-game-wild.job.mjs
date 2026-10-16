// PREPARED: URL start on Route 1 tall grass. The encounter itself is decided by
// the engine's CheckStandardWildEncounter on real steps; the battle is played
// with keys only (first move until it ends).
export default async function run(ctx){
 const p=ctx.page;
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_ROUTE1&px=14&py=-14',process.env.PW_BASE??'http://localhost:5173').href);
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 const snap=()=>p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');return JSON.parse(JSON.stringify({party:save.party.map(m=>({level:m.level,hp:m.hp,exp:m.exp,species:m.species})),bag:save.bag,money:save.money,seen:save.pokedexSeen,caught:save.pokedexCaught,loc:save.location}));});
 const before=await snap();
 await p.locator('#viewport').focus();
 const visible=()=>p.locator('#engine-interaction').isVisible();
 let steps=0;
 for(;steps<300&&!await visible();steps++){const k=(steps>>2)%2?'ArrowUp':'ArrowDown';await p.keyboard.down(k);await p.waitForTimeout(150);await p.keyboard.up(k);await p.waitForTimeout(320);}
 if(!await visible())throw Error('No wild encounter in '+steps+' steps');
 await ctx.shot('encounter');
 let presses=0;
 for(;presses<300&&await visible();presses++){await p.keyboard.press('z');await p.waitForTimeout(700);if(presses===25)await ctx.shot('battle');}
 if(await visible())throw Error('Battle did not end');
 await p.waitForTimeout(1500);await ctx.shot('returned');
 const after=await snap();
 // The viewer must walk again after the battle.
 const hashBefore=await p.evaluate(()=>location.hash);
 await p.locator('#viewport').focus();
 await p.keyboard.down('ArrowRight');await p.waitForTimeout(150);await p.keyboard.up('ArrowRight');await p.waitForTimeout(500);
 await p.keyboard.down('ArrowRight');await p.waitForTimeout(500);await p.keyboard.up('ArrowRight');await p.waitForTimeout(600);
 const moved=await p.evaluate(()=>location.hash)!==hashBefore;
 return {steps,presses,before:before.party[0],after:after.party[0],map:after.loc,movedAfterBattle:moved,errors:ctx.errors()};
}
