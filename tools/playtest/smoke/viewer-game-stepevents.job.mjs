// PREPARED: Route 1 path (no grass) start. Poison: the lead starts poisoned.
// Egg: an egg with 0 cycles is added and the daycare step counter starts at 250,
// so the hatch (stepCounter === 255) happens within a few real steps.
export default async function run(ctx){
 const p=ctx.page, out={};
 const hold=async(k,ms=420)=>{await p.keyboard.down(k);await p.waitForTimeout(ms);await p.keyboard.up(k);await p.waitForTimeout(150);};
 const open=async(setup)=>{
  await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_ROUTE1&px=14&py=-11',process.env.PW_BASE??'http://localhost:5173').href);
  await p.reload();
  await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
  await p.evaluate(setup);
  await p.waitForTimeout(6000);                    // engine warm-up
  await p.locator('#viewport').focus();
 };
 const visible=()=>p.locator('#engine-interaction').isVisible();
 // --- Poison ---
 await open(async()=>{const {save}=await import('/src/games/firered/save.ts');save.party[0].status=8;});
 const hp=()=>p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');return save.party[0].hp;});
 const before=await hp();
 for(let i=0;i<10;i++){await hold(i%2?'ArrowUp':'ArrowDown');if(await visible())break;}
 await p.waitForTimeout(1500);
 const after=await hp();
 out.poison={before,after};
 if(!(after<before))throw Error('Poison did not reduce HP '+JSON.stringify(out.poison));
 // --- Egg ---
 await open(async()=>{const {save}=await import('/src/games/firered/save.ts');const {createMon}=await import('/src/core/pokemon/pokemon.ts');
  const egg=createMon(16,5);egg.isEgg=true;egg.friendship=0;save.party.push(egg);const {daycare}=await import('/src/games/firered/pokemon/daycare.ts');daycare().stepCounter=250;});
 const party=()=>p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');return save.party.map(m=>m.isEgg);});
 let hatched=false;
 for(let i=0;i<14&&!hatched;i++){await hold(i%2?'ArrowUp':'ArrowDown');if(await visible()){hatched=true;}}
 if(!hatched)throw Error('Egg did not start hatching');
 await p.waitForTimeout(2000);await ctx.shot('egg-hatch');
 for(let i=0;i<60&&await visible();i++){await hold('z',100);await p.waitForTimeout(700);if(i%10===9)await ctx.shot('egg-'+i);}
 out.egg={visibleAfter:await visible(),party:await party()};
 if(out.egg.party[1]!==false||out.egg.visibleAfter)throw Error('Egg flow did not finish '+JSON.stringify(out.egg));
 return {...out,errors:ctx.errors()};
}
