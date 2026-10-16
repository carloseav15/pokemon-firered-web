// PREPARED: Pewter Gym URL start at the entrance and a Lv40 lead (explicit
// precondition so the source trainers can be beaten with the first move).
// Camper Liam's sight, Brock's script, badge flag and TM39 are the engine's.
export default async function run(ctx){
 const p=ctx.page;
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_PEWTER_CITY_GYM&px=6&py=13',process.env.PW_BASE??'http://localhost:5173').href);
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 await p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');const {createMon}=await import('/src/core/pokemon/pokemon.ts');save.party[0]=createMon(9,40);});
 await p.waitForTimeout(6000);
 const state=()=>p.evaluate(async()=>{const s=await import('/src/games/firered/save.ts');return {badge:s.flagGet(2080),brock:s.flagGet(1200),tm39:s.flagGet(596),tm:JSON.stringify(s.save.bag.tmCase),fame:JSON.stringify(s.save.fameChecker?.[2]??null),money:s.save.money,party:s.save.party[0].level};});
 const hold=async(k,ms=130)=>{await p.keyboard.down(k);await p.waitForTimeout(ms);await p.keyboard.up(k);await p.waitForTimeout(520);};
 const visible=()=>p.locator('#engine-interaction').isVisible();
 const play=async(label)=>{for(let i=0;i<300&&await visible();i++)await hold('z');await p.waitForTimeout(800);};
 await p.locator('#viewport').focus();
 // Walk north until Camper Liam sees the player.
 let steps=0;
 for(;steps<6&&!await visible();steps++){await hold('ArrowUp',450);await p.waitForTimeout(500);}
 if(!await visible())throw Error('Camper did not engage');
 await ctx.shot('liam-sight');
 await play('liam');
 const beforeBrock=await state();
 const afterLiam=beforeBrock;
 // Up to Brock and talk.
 for(let i=0;i<6;i++)await hold('ArrowUp',450);
 await hold('z');await p.waitForTimeout(1500);
 if(!await visible()){await hold('ArrowUp',450);await hold('z');await p.waitForTimeout(1500);}
 await ctx.shot('brock');
 await play('brock');
 await ctx.shot('after-brock');
 const end=await state();
 if(!end.badge)throw Error('Boulder Badge flag not set '+JSON.stringify(end));
 // famechecker FAMECHECKER_BROCK in the source script updates his Fame Checker entry.
 if(end.fame===afterLiam.fame)throw Error('Fame Checker entry unchanged '+end.fame);
 // Save from the DOM menu and reload: badge, TM and defeat flags must persist.
 await p.getByRole('button',{name:'Menú · Esc'}).click();
 await p.locator('#explore-save').click();await p.keyboard.press('Escape');
 await p.reload();await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 const persisted=await state();
 if(!persisted.badge||!persisted.brock||!persisted.tm39||persisted.tm.indexOf('327')<0)throw Error('Badge/TM not persisted '+JSON.stringify(persisted));
 return {steps,afterLiam,end,fame:{before:afterLiam.fame,after:end.fame},persisted:'PASS',errors:ctx.errors()};
}
