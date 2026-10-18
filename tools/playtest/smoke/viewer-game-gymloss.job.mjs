// Run with PW_TIMEOUT_MS=300000 (the unprepared Lv5 lead needs more than the default budget).
// PREPARED: Pewter Gym URL start at the entrance with the unmodified Lv5 starter.
// Mashing the first move loses to the gym trainers; the engine's white-out must
// heal the party and move the viewer to the respawn point (Pallet Town by default).
export default async function run(ctx){
 const p=ctx.page;
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_PEWTER_CITY_GYM&px=6&py=13',process.env.PW_BASE??'http://localhost:5173').href);
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 await p.waitForTimeout(6000);
 const state=()=>p.evaluate(async()=>{const s=await import('/src/games/firered/save.ts');return {level:s.save.party[0].level,hp:s.save.party[0].hp,max:s.save.party[0].stats[0],money:s.save.money,loc:s.save.location,hash:location.hash.match(/mapa=([A-Z0-9_]+)/)?.[1]};});
 const hold=async(k,ms=130)=>{await p.keyboard.down(k);await p.waitForTimeout(ms);await p.keyboard.up(k);await p.waitForTimeout(520);};
 const visible=()=>p.locator('#engine-interaction').isVisible();
 await p.locator('#viewport').focus();
 const before=await state();
 let steps=0;
 for(;steps<6&&!await visible();steps++){await hold('ArrowUp',450);await p.waitForTimeout(500);}
 if(!await visible())throw Error('Camper did not engage');
 for(let i=0;i<500&&await visible();i++)await hold('z');
 await p.waitForTimeout(4000);
 const after=await state();
 await ctx.shot('after-loss');
 // The Lv5 starter may beat Liam; in that case Brock is next.
 if(after.hp===after.max&&after.loc.mapGroup===before.loc.mapGroup)throw Error('No defeat happened '+JSON.stringify(after));
 return {steps,before,after,errors:ctx.errors()};
}
