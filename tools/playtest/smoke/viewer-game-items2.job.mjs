// PREPARED: Viridian Center URL start; the items, status and HP of each scenario
// are explicit preconditions. Everything else is the source bag, case and party screens.
// SCENARIO=antidote|berry|tm|keyitems selects one scenario (default: all).
const SCENARIOS=['antidote','berry','tm','townmap','itemfinder','give','toss'];
export default async function run(ctx){
 const p=ctx.page, only=process.env.SCENARIO?.split(','), results={};
 const state=()=>p.evaluate(async()=>{const {gMain}=await import('/src/core/hw/runtime.ts');const {tasks}=await import('/src/core/gba/tasks.ts');return {cb2:gMain.callback2?.name??'',tasks:tasks.tasks.filter(t=>t.isActive).map(t=>t.func.name),open:!document.querySelector('#engine-interaction').hidden};});
 const lead=()=>p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');const m=save.party[0];return {held:m.heldItem,hp:m.hp,max:m.stats[0],status:m.status,moves:[...m.moves],items:JSON.stringify([save.bag.items,save.bag.berryPouch,save.bag.tmCase])};});
 const tapKey=async(k,ms=100)=>{await p.keyboard.down(k);await p.waitForTimeout(ms);await p.keyboard.up(k);};
 let shots=0;
 const press=async k=>{await tapKey(k);await p.waitForTimeout(550);if(process.env.DEBUG_SHOTS)await ctx.shot('step'+String(++shots).padStart(2,'0')+'-'+k);};
 const waitFor=async(label,pred)=>{for(let i=0;i<80;i++){const s=await state();if(pred(s)){await p.waitForTimeout(400);return s;}await p.waitForTimeout(300);}await ctx.shot('stuck-'+label);throw Error('stuck '+label+' '+JSON.stringify(await state()));};
 const has=n=>s=>s.tasks.includes(n);
 const until=async(pred)=>{for(let i=0;i<60;i++){if(await pred())return true;await p.waitForTimeout(400);if(i%5===4)await press('z');}return false;};
 const start=async(setup)=>{
  await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_VIRIDIAN_CITY_POKEMON_CENTER_1F&px=7&py=6',process.env.PW_BASE??'http://localhost:5173').href);
  await p.reload();
  await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
  await p.evaluate(setup);
  await p.locator('#viewport').focus();
  await press('Enter');await waitFor('start',has('startInput'));
  await press('ArrowDown');await press('ArrowDown');await press('z');await waitFor('bag',has('Task_BagMenu_HandleInput'));
 };
 const closeAll=async()=>{for(let i=0;i<14&&(await state()).open;i++){await press('x');await p.waitForTimeout(500);}};
 const scenarios={
  async antidote(){
   await start(async()=>{const {save}=await import('/src/games/firered/save.ts');const {addBagItem}=await import('/src/core/pokemon/items.ts');addBagItem(14,2);save.party[0].status=8;});
   await press('z');await p.waitForTimeout(400);await press('z');                    // ANTIDOTE -> USE
   await waitFor('party',has('Task_HandleChooseMonInput'));await press('z');
   await until(async()=>(await lead()).status===0);
   const after=await lead();await closeAll();
   if(after.status!==0)throw Error('status not cured '+JSON.stringify(after));
   return 'cured, '+after.items.slice(0,40);
  },
  async berry(){
   await start(async()=>{const {save}=await import('/src/games/firered/save.ts');const {addBagItem}=await import('/src/core/pokemon/items.ts');addBagItem(365,1);addBagItem(139,2);save.party[0].hp=2;});
   await press('ArrowRight');await p.waitForTimeout(400);await press('z');await p.waitForTimeout(400);await press('z'); // key items: BERRY POUCH -> USE
   await waitFor('pouch',s=>s.tasks.some(t=>t.includes('BerryPouch')));await p.waitForTimeout(800);await ctx.shot('pouch');
   await press('z');await p.waitForTimeout(500);await ctx.shot('pouch-menu');await press('z');             // ORAN BERRY -> USE
   await waitFor('party',has('Task_HandleChooseMonInput'));await press('z');
   await until(async()=>(await lead()).hp>2);
   const after=await lead();await closeAll();
   if(after.hp<=2)throw Error('Oran Berry did not heal '+JSON.stringify(after));
   return 'healed to '+after.hp;
  },
  async tm(){
   await start(async()=>{const {addBagItem}=await import('/src/core/pokemon/items.ts');addBagItem(364,1);addBagItem(332,1);});
   await press('ArrowRight');await p.waitForTimeout(400);await press('z');await p.waitForTimeout(400);await press('z'); // key items: TM CASE -> USE
   await waitFor('tmcase',has('Task_HandleListInput'));await p.waitForTimeout(800);await ctx.shot('tmcase');
   await press('z');await p.waitForTimeout(500);await ctx.shot('tm-menu');await press('z');                      // TM44 -> USE
   for(let i=0;i<30;i++){const s=await state();if(s.tasks.includes('Task_HandleChooseMonInput'))break;await press('z');}
   await press('z');                                                                                             // choose the lead
   for(let i=0;i<60&&!(await lead()).moves.includes(156);i++){await p.waitForTimeout(400);if(i%5===4)await press('z');}
   const after=await lead();await closeAll();
   if(!after.moves.includes(156))throw Error('TM44 not learned '+JSON.stringify(after));
   return 'learned Rest';
  },
  async give(){
   await start(async()=>{const {addBagItem}=await import('/src/core/pokemon/items.ts');addBagItem(14,2);});
   await press('z');await p.waitForTimeout(400);await press('ArrowDown');await press('z');             // ANTIDOTE -> GIVE
   await waitFor('party',has('Task_HandleChooseMonInput'));await press('z');
   await until(async()=>(await lead()).held===14);
   const after=await lead();await closeAll();
   if(after.held!==14)throw Error('item not given '+JSON.stringify(after));
   return 'given, bag '+after.items.slice(0,30);
  },
  async toss(){
   await start(async()=>{const {addBagItem}=await import('/src/core/pokemon/items.ts');addBagItem(14,3);});
   const qty=()=>p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');return save.bag.items.find(i=>i.item===14)?.quantity??0;});
   await press('z');await p.waitForTimeout(400);await press('ArrowDown');await press('ArrowDown');await press('z');   // ANTIDOTE -> TOSS
   await p.waitForTimeout(800);await press('ArrowUp');await p.waitForTimeout(400);await press('z');                   // quantity 2 -> confirm
   await p.waitForTimeout(800);await press('z');                                                                       // YES
   await until(async()=>(await qty())===1);
   const left=await qty();await closeAll();
   if(left!==1)throw Error('toss did not remove 2, left '+left);
   return 'tossed 2, left '+left;
  },
  async townmap(){
   await start(async()=>{const {addBagItem}=await import('/src/core/pokemon/items.ts');addBagItem(361,1);});
   await press('ArrowRight');await p.waitForTimeout(400);
   await press('z');await p.waitForTimeout(400);await press('z');                    // TOWN MAP -> USE
   await p.waitForTimeout(4000);await ctx.shot('townmap');
   const s=await state();
   if(!s.open)throw Error('Town Map closed immediately');
   await closeAll();
   return 'region map opened and closed';
  },
  async itemfinder(){
   await start(async()=>{const {addBagItem}=await import('/src/core/pokemon/items.ts');addBagItem(261,1);});
   await press('ArrowRight');await p.waitForTimeout(400);
   await press('z');await p.waitForTimeout(400);await press('z');                    // ITEMFINDER -> USE
   await p.waitForTimeout(3500);await ctx.shot('itemfinder');
   for(let i=0;i<30&&(await state()).open;i++){await p.waitForTimeout(400);if(i%4===3){await press('z');if(process.env.DEBUG_SHOTS)console.log(JSON.stringify(await state()));}}
   return (await state()).open?(()=>{throw Error('Itemfinder did not return');})():'Itemfinder message shown and closed';
  },
 };
 for(const name of SCENARIOS){
  if(only&&!only.includes(name))continue;
  try{results[name]='PASS '+await scenarios[name]();}catch(e){results[name]='FAIL '+String(e).slice(0,200);await ctx.shot('fail-'+name);}
 }
 const failed=Object.entries(results).filter(([,v])=>!v.startsWith('PASS'));
 if(failed.length)throw Error('Items failed '+JSON.stringify(results));
 return {results,errors:ctx.errors()};
}
