// PREPARED: Pallet Town street start (no grass) and a Pidgey egg added to the party
// with 1 egg cycle left (explicit precondition). The daycare step counter is the
// save's own value and is NOT prepared: daycare.c TryProduceOrHatchEgg lowers the
// cycle when the counter reaches 255 and hatches the egg the next time, so the
// hatch must start after exactly 511 - counter real steps (GAME_STAT_STEPS).
// In the hatch scene the nickname question is answered YES and the naming
// screen gets "AAA" (A three times, START to OK, A). Run with PW_TIMEOUT_MS=580000.
const BASE=process.env.PW_BASE??'http://localhost:5173';
export default async function run(ctx){
 const p=ctx.page;
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_PALLET_TOWN&px=12&py=9',BASE).href);await p.reload();
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 await p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');const {createMon}=await import('/src/core/pokemon/pokemon.ts');
  const egg=createMon(16,5);egg.isEgg=true;egg.friendship=1;save.party.push(egg);});
 await p.waitForTimeout(6000);await p.locator('#viewport').focus();
 const info=()=>p.evaluate(async()=>{const s=await import('/src/games/firered/save.ts');const C=await import('/src/games/firered/generated/constants.ts');const {daycare}=await import('/src/games/firered/pokemon/daycare.ts');
  return {steps:s.GetGameStat(C.GAME_STAT_STEPS),counter:daycare().stepCounter,egg:s.save.party[1]?{isEgg:s.save.party[1].isEgg,cycles:s.save.party[1].friendship,species:s.save.party[1].species,nickname:s.save.party[1].nickname.slice(0,10)}:null};});
 // DoNamingScreen installs arrow callbacks: identify CB2_NamingScreen by its source.
 const engine=()=>p.evaluate(async()=>{const {gMain}=await import('/src/core/hw/runtime.ts');const cb=gMain.callback2;return cb?(/CB2_NamingScreen\(/.test(cb.toString())?'CB2_NamingScreen':cb.name):'';});
 const visible=()=>p.locator('#engine-interaction').isVisible();
 const start=await info();
 const expected=511-start.counter;
 let leg=0;
 for(;leg<120&&!await visible();leg++){const k=leg%2?'ArrowRight':'ArrowLeft';await p.keyboard.down(k);await p.waitForTimeout(2500);await p.keyboard.up(k);await p.waitForTimeout(80);}
 if(!await visible())throw Error('Egg did not hatch '+JSON.stringify(await info()));
 const atHatch=await info();
 const walked=atHatch.steps-start.steps;
 if(walked!==expected)throw Error(`Hatch after ${walked} steps, expected ${expected} `+JSON.stringify({start,atHatch}));
 // Hatch scene: A through the text until the naming screen opens (YES is the default).
 let named=false;
 for(let i=0;i<120;i++){
  if((await engine())==='CB2_NamingScreen'){named=true;break;}
  await p.keyboard.press('z');await p.waitForTimeout(700);
  if(i%3===0&&i<=15)await ctx.shot('hatch-scene-'+i);
 }
 if(!named){await ctx.shot('no-naming');throw Error('Naming screen did not open');}
 await p.waitForTimeout(1500);
 for(let i=0;i<3;i++){await p.keyboard.press('z');await p.waitForTimeout(500);}
 await ctx.shot('naming');
 await p.keyboard.press('Enter');await p.waitForTimeout(600);await p.keyboard.press('z');
 for(let i=0;i<80&&await visible();i++){await p.waitForTimeout(600);if((await engine())!=='CB2_NamingScreen')await p.keyboard.press('z');}
 if(await visible()){await ctx.shot('stuck');throw Error('Hatch flow did not finish '+await engine());}
 const end=await info();
 const aaa=[0xBB,0xBB,0xBB]; // 'A' in charmap.txt
 if(end.egg.isEgg||end.egg.species!==16)throw Error('Egg not hatched '+JSON.stringify(end));
 if(JSON.stringify(end.egg.nickname.slice(0,3))!==JSON.stringify(aaa)||end.egg.nickname[3]!==0xff)throw Error('Nickname not AAA '+JSON.stringify(end.egg.nickname));
 return {start,walked,expected,end,errors:ctx.errors()};
}
