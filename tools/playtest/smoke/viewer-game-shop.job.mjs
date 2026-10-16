// PREPARED: source counter in Pewter Mart, no story flags. Transactions and
// persistence use only the actual source NPC script, menus and keyboard.
export default async function run(ctx){
 const p=ctx.page;
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_PEWTER_CITY_MART&px=4&py=3',process.env.PW_BASE??'http://127.0.0.1:5173').href);
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 const read=()=>p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');const {tasks}=await import('/src/core/gba/tasks.ts');return {money:save.money,bag:save.bag,tasks:tasks.tasks.filter(t=>t.isActive).map(t=>t.func.name)};});
 const waitTask=async name=>{for(let i=0;i<150;i++){const state=await read();if(state.tasks.includes(name))return;await p.waitForTimeout(150);}await ctx.shot('task-timeout');throw Error('Task timeout '+name+' '+JSON.stringify(await read()));};
 const tap=async key=>{await p.keyboard.press(key);await p.waitForTimeout(650);};
 await p.locator('#viewport').focus();await tap('ArrowLeft');await p.waitForTimeout(400);await tap('z');
 await p.locator('#engine-interaction').waitFor({state:'visible'});await waitTask('Task_ShopMenu');
 await tap('z');await waitTask('Task_BuyMenu');
 // Source stock/prices read from exported ROM: select first item, buy three.
 const before=await read();
 await tap('z');await waitTask('Task_BuyHowManyDialogueHandleInput');
 await tap('ArrowUp');await tap('ArrowUp');await tap('z');await waitTask('Task_CallYesOrNoCallback');
 await tap('z');await waitTask('Task_ReturnToItemListAfterItemPurchase');
 await ctx.shot('purchase-result');const bought=await read();
 const {readFileSync}=await import('node:fs');
 const items=JSON.parse(readFileSync('public/fr/data/items.json','utf8')).items;
 const price=items.find(i=>i.id===4).price;
 if(bought.money!==before.money-3*price||bought.bag.pokeBalls[0].quantity!==8)throw Error('Purchase mismatch '+JSON.stringify(bought));
 await ctx.shot('purchase');
 await tap('z');await waitTask('Task_BuyMenu');
 // Spend the actual remaining balance; the quantity cap derives from source price.
 await tap('z');await waitTask('Task_BuyHowManyDialogueHandleInput');
 await tap('ArrowRight');await tap('ArrowUp');await tap('z');await waitTask('Task_CallYesOrNoCallback');
 await tap('z');await waitTask('Task_ReturnToItemListAfterItemPurchase');
 const depleted=await read();if(depleted.money!==0||depleted.bag.pokeBalls[0].quantity!==20)throw Error('Quantity/balance mismatch '+JSON.stringify(depleted));
 await tap('z');await waitTask('Task_BuyMenu');await tap('z');
 // Insufficient funds must return to the list without changing money or inventory.
 await p.waitForTimeout(3000);await ctx.shot('insufficient-funds');await tap('z');await waitTask('Task_BuyMenu');
 const rejected=await read();if(rejected.money!==0||rejected.bag.pokeBalls[0].quantity!==20)throw Error('Insufficient-money branch mutated bag');
 await tap('x');
 // Return to shop prompt requires acknowledging text; observe state after each key.
 for(let i=0;i<40;i++){if((await read()).tasks.includes('Task_ShopMenu'))break;await p.waitForTimeout(300);await tap('z');}
 await waitTask('Task_ShopMenu');await tap('x');
 for(let i=0;i<50;i++){if(await p.locator('#engine-interaction').getAttribute('data-script-active')==='false')break;await p.waitForTimeout(300);await tap('z');}
 await p.locator('#engine-interaction').waitFor({state:'hidden'});
 await p.getByRole('button',{name:'Menú · Esc'}).click();
 if(!await p.locator('#explore-party').innerText().then(t=>t.includes('×20')))throw Error('Bag UI not updated');
 await p.locator('#explore-save').click();await p.keyboard.press('Escape');
 await p.reload();await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 const persisted=await read();if(persisted.money!==0||persisted.bag.pokeBalls[0].quantity!==20)throw Error('Purchase not persisted');
 return {prepared:'source counter URL only',price,quantities:[3,12],money:persisted.money,balls:20,insufficientFunds:'PASS',sourceScript:'PewterCity_Mart_EventScript_Clerk',saveReload:'PASS',errors:ctx.errors()};
}
