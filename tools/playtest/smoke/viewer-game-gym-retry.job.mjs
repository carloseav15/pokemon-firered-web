// PREPARED: Pewter Gym URL start at the entrance; a 1 HP lead for the first
// attempt and a Lv40 lead for the second are explicit preconditions.
// First attempt: Camper Liam's sight starts the battle and the loss runs the
// engine white-out. The game is saved where the player respawns and the gym is
// opened again by URL (the walk back is not part of this job). Second attempt:
// Liam must engage again (his defeat flag was never set), then Brock gives the
// badge. Run with PW_TIMEOUT_MS=580000.
const BASE=process.env.PW_BASE??'http://localhost:5173';
const LIAM=0x500+142, BADGE=2080; // TRAINER_CAMPER_LIAM, FLAG_BADGE01_GET
export default async function run(ctx){
 const p=ctx.page;
 const open=async()=>{await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_PEWTER_CITY_GYM&px=6&py=13',BASE).href);await p.reload();await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);await p.waitForTimeout(3000);};
 const state=()=>p.evaluate(async([l,b])=>{const s=await import('/src/games/firered/save.ts');return {liam:s.flagGet(l),badge:s.flagGet(b),hp:s.save.party[0].hp,max:s.save.party[0].stats[0],money:s.save.money,map:location.hash.match(/mapa=([A-Z0-9_]+)/)?.[1]};},[LIAM,BADGE]);
 const hold=async(k,ms=130)=>{await p.keyboard.down(k);await p.waitForTimeout(ms);await p.keyboard.up(k);await p.waitForTimeout(520);};
 const visible=()=>p.locator('#engine-interaction').isVisible();
 const engage=async()=>{await p.locator('#viewport').focus();let steps=0;for(;steps<6&&!await visible();steps++){await hold('ArrowUp',450);await p.waitForTimeout(500);}if(!await visible())throw Error('Camper did not engage');return steps;};
 const play=async()=>{for(let i=0;i<400&&await visible();i++)await hold('z');await p.waitForTimeout(1500);};

 await open();
 await p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');save.party[0].hp=1;});
 const first=await engage();
 await play();
 await p.waitForTimeout(3000);
 const lost=await state();
 if(lost.liam||lost.hp!==lost.max||lost.map==='MAP_PEWTER_CITY_GYM')throw Error('First attempt did not white out '+JSON.stringify(lost));
 await ctx.shot('after-loss');
 await p.getByRole('button',{name:"Menu · Esc"}).click();
 await p.locator('#explore-save').click();await p.keyboard.press('Escape');

 await open();
 const back=await state();
 if(back.liam||back.money!==lost.money)throw Error('Saved state after loss not restored '+JSON.stringify(back));
 await p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');const {createMon}=await import('/src/core/pokemon/pokemon.ts');save.party[0]=createMon(9,40);});
 const second=await engage();
 await ctx.shot('liam-again');
 await play();
 const afterLiam=await state();
 if(!afterLiam.liam)throw Error('Liam defeat flag not set on the second attempt');
 for(let i=0;i<6;i++)await hold('ArrowUp',450);
 await hold('z');await p.waitForTimeout(1500);
 if(!await visible()){await hold('ArrowUp',450);await hold('z');await p.waitForTimeout(1500);}
 await play();
 const end=await state();
 if(!end.badge)throw Error('Boulder Badge not obtained on the second attempt '+JSON.stringify(end));
 await ctx.shot('badge');
 return {first,second,lost,end,errors:ctx.errors()};
}
