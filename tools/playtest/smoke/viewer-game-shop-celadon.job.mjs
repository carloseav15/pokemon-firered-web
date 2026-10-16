// PREPARED: source counter in Celadon Department Store 2F (TM clerk, 2 tiles
// over the counter). The purchase uses the source script, menu and prices.
export default async function run(ctx){
 const p=ctx.page;
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_CELADON_CITY_DEPARTMENT_STORE_2F&px=3&py=6',process.env.PW_BASE??'http://localhost:5173').href);
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 const read=()=>p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');const {tasks}=await import('/src/core/gba/tasks.ts');return {money:save.money,bag:save.bag,tasks:tasks.tasks.filter(t=>t.isActive).map(t=>t.func.name)};});
 const waitTask=async name=>{for(let i=0;i<150;i++){const s=await read();if(s.tasks.includes(name))return s;await p.waitForTimeout(150);}await ctx.shot('task-timeout');throw Error('Task timeout '+name+' '+JSON.stringify(await read()));};
 const tap=async key=>{await p.keyboard.press(key);await p.waitForTimeout(650);};
 await p.locator('#viewport').focus();await tap('ArrowLeft');await p.waitForTimeout(400);await tap('z');
 await p.locator('#engine-interaction').waitFor({state:'visible'});await waitTask('Task_ShopMenu');
 await tap('z');await waitTask('Task_BuyMenu');
 const before=await read();
 await tap('z');
 await waitTask('Task_BuyHowManyDialogueHandleInput').catch(async()=>{await waitTask('Task_CallYesOrNoCallback');});
 let s=await read();
 if(s.tasks.includes('Task_BuyHowManyDialogueHandleInput')){await tap('z');await waitTask('Task_CallYesOrNoCallback');}
 await tap('z');await waitTask('Task_ReturnToItemListAfterItemPurchase');
 const after=await read();
 await ctx.shot('tm-purchase');
 if(!(after.money<before.money)||after.bag.tmCase.length!==before.bag.tmCase.length+1)throw Error('TM purchase mismatch '+JSON.stringify({b:before.money,a:after.money,tm:after.bag.tmCase}));
 return {spent:before.money-after.money,tmCase:after.bag.tmCase,errors:ctx.errors()};
}
