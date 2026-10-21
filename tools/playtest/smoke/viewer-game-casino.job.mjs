// PREPARED: Game Corner / Prize Room URL starts in front of each counter or
// machine; the Coin Case (item + FLAG_GOT_COIN_CASE) and ₽12000 are explicit
// preconditions. Everything else is the source flow driven by keys:
// 1. Coin clerk: second option buys 500 coins for ₽10000.
// 2. Slot machine 0: YES, DOWN three times bets 3 coins (slot_machine.c
//    MainTask_SlotsGameLoop starts the reels at bet 3), A stops each reel,
//    B and YES leave; coins = before - 3 + payout.
// 3. Prize Room Pokémon clerk: Abra for 180 coins (FIRERED), no nickname.
// Run with PW_TIMEOUT_MS=580000.
const BASE=process.env.PW_BASE??'http://localhost:5173';
export default async function run(ctx){
 const p=ctx.page;
 const open=async(map,x,y,first)=>{
  await p.goto(new URL(`viewer.html#modo=explore&mapa=${map}&px=${x}&py=${y}`,BASE).href);await p.reload();
  await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
  if(first)await p.evaluate(async()=>{const s=await import('/src/games/firered/save.ts');const C=await import('/src/games/firered/generated/constants.ts');const {addBagItem}=await import('/src/core/pokemon/items.ts');
   s.flagSet(C.FLAG_GOT_COIN_CASE);addBagItem(C.ITEM_COIN_CASE,1);s.save.money=12000;});
  await p.waitForTimeout(6000);await p.locator('#viewport').focus();
 };
 const state=()=>p.evaluate(async()=>{const s=await import('/src/games/firered/save.ts');const {GetCoins}=await import('/src/core/pokemon/items.ts');return {coins:GetCoins(),money:s.save.money,party:s.save.party.map(m=>m.species)};});
 const engine=()=>p.evaluate(async()=>{const {gMain}=await import('/src/core/hw/runtime.ts');const {tasks}=await import('/src/core/gba/tasks.ts');return {cb2:gMain.callback2?.name??'',tasks:tasks.tasks.filter(t=>t.isActive).map(t=>t.func.name)};});
 const visible=()=>p.locator('#engine-interaction').isVisible();
 const press=async(k,ms=500)=>{await p.keyboard.press(k);await p.waitForTimeout(ms);};
 const waitFor=async(label,pred)=>{for(let i=0;i<80;i++){const e=await engine();if(pred(e))return e;await p.waitForTimeout(250);}await ctx.shot('stuck-'+label);throw Error('stuck '+label+' '+JSON.stringify(await engine()));};
 // A through message pages until a menu task opens; poll before each press so no choice is made.
 const advanceTo=async(label,task)=>{for(let i=0;i<40;i++){if((await engine()).tasks.includes(task)){await p.waitForTimeout(400);return;}await press('z',700);}await ctx.shot('stuck-'+label);throw Error('stuck '+label);};
 const talk=async(dir)=>{await press(dir,400);await press('z',300);await p.locator('#engine-interaction').waitFor({state:'visible',timeout:15000});await p.waitForFunction(()=>document.querySelector('#engine-interaction')?.dataset.scriptActive==='true',{timeout:20000});await p.waitForTimeout(2500);};
 const finish=async(label)=>{for(let i=0;i<80&&await visible();i++)await press('z',600);if(await visible()){await ctx.shot('stuck-'+label);throw Error(label+' did not end');}};

 // 1. Buy 500 coins.
 await open('MAP_CELADON_CITY_GAME_CORNER',6,4,true);
 const s0=await state();
 await talk('ArrowUp');
 await advanceTo('coin-choice','Task_MultichoiceMenu_HandleInput');
 await ctx.shot('coin-clerk');
 await press('ArrowDown');await press('z',1500);
 await finish('coin-clerk');
 const s1=await state();
 if(s1.coins!==s0.coins+500||s1.money!==s0.money-10000)throw Error('Coin purchase '+JSON.stringify({s0,s1}));
 await p.getByRole('button',{name:"Menu · Esc"}).click();await p.locator('#explore-save').click();await p.keyboard.press('Escape');

 // 2. Slot machine 0 (bg event at 0,7), player at 1,7 facing west.
 await open('MAP_CELADON_CITY_GAME_CORNER',1,7,false);
 const s2=await state();
 if(s2.coins!==s1.coins)throw Error('Coins not persisted '+JSON.stringify(s2));
 await talk('ArrowLeft');
 await advanceTo('play-yesno','Task_YesNoMenu_HandleInput');
 await press('z',1200);                                                  // YES to "play?"
 await waitFor('slots',e=>e.tasks.includes('MainTask_SlotsGameLoop'));
 await p.waitForTimeout(2500);
 for(let i=0;i<3;i++)await press('ArrowDown',700);
 await p.waitForTimeout(800);
 const betting=await state();
 if(betting.coins!==s2.coins-3)throw Error('Bet of 3 not removed '+JSON.stringify({s2,betting}));
 await ctx.shot('slots-spinning');
 for(let i=0;i<3;i++){await p.waitForTimeout(1200);await press('z',900);}
 await p.waitForTimeout(6000);                                          // payout animation
 await ctx.shot('slots-result');
 for(let i=0;i<6;i++)await press('z',900);                             // payout messages, if any
 await press('x',1200);await press('z',1500);                           // B, YES to quit
 await waitFor('slots-exit',e=>!e.tasks.includes('MainTask_SlotsGameLoop'));
 await finish('slots');
 const s3=await state();
 const payout=s3.coins-betting.coins;
 if(payout<0)throw Error('Coins lost after the spin '+JSON.stringify({betting,s3}));
 await p.getByRole('button',{name:"Menu · Esc"}).click();await p.locator('#explore-save').click();await p.keyboard.press('Escape');

 // 3. Prize Room Pokémon clerk (4,2): Abra for 180 coins.
 await open('MAP_CELADON_CITY_GAME_CORNER_PRIZE_ROOM',4,4,false);
 const s4=await state();
 await talk('ArrowUp');
 await advanceTo('prize-list','Task_MultichoiceMenu_HandleInput'); // "We exchange coins..."
 await press('z',1500);                                                  // ABRA
 await advanceTo('prize-yesno','Task_YesNoMenu_HandleInput');
 await press('z',1500);                                                  // YES
 // Received text, then the nickname question: NO.
 await advanceTo('nickname-yesno','Task_YesNoMenu_HandleInput');
 await press('x',900);
 await finish('prize');
 const s5=await state();
 if(s5.coins!==s4.coins-180||s5.party.at(-1)!==63)throw Error('Abra exchange '+JSON.stringify({s4,s5}));
 return {coins:{bought:s1.coins,bet:3,payout,afterPrize:s5.coins},money:[s0.money,s1.money],party:s5.party,errors:ctx.errors()};
}
