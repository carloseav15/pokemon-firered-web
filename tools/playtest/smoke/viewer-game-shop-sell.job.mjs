// PREPARED: source counter in Pewter Mart; the temporary start already holds the
// Poké Balls that are sold. Sale, price and persistence use the source scripts/menus.
export default async function run(ctx){
 const p=ctx.page;
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_PEWTER_CITY_MART&px=4&py=3',process.env.PW_BASE??'http://localhost:5173').href);
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 const read=()=>p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');const {tasks}=await import('/src/core/gba/tasks.ts');return {money:save.money,bag:save.bag,tasks:tasks.tasks.filter(t=>t.isActive).map(t=>t.func.name)};});
 const waitTask=async name=>{for(let i=0;i<150;i++){const s=await read();if(s.tasks.includes(name))return s;await p.waitForTimeout(150);}await ctx.shot('task-timeout');throw Error('Task timeout '+name+' '+JSON.stringify(await read()));};
 const tap=async key=>{await p.keyboard.press(key);await p.waitForTimeout(650);};
 await p.locator('#viewport').focus();await tap('ArrowLeft');await p.waitForTimeout(400);await tap('z');
 await p.locator('#engine-interaction').waitFor({state:'visible'});await waitTask('Task_ShopMenu');
 const before=await read();
 const {readFileSync}=await import('node:fs');
 const price=JSON.parse(readFileSync('public/fr/data/items.json','utf8')).items.find(i=>i.id===4).price;
 const qty0=before.bag.pokeBalls[0].quantity;
 await tap('ArrowDown');await tap('z');
 await waitTask('Task_BagMenu_HandleInput');
 await tap('ArrowRight');await tap('ArrowRight'); // Items -> Key items -> Poké Balls
 await tap('z');                       // choose Poké Ball -> SELL context
 await waitTask('Task_SelectQuantityToSell');
 await tap('ArrowUp');                 // 1 -> 2
 await ctx.shot('sell-quantity');
 await tap('z');await waitTask('Task_ShowSellYesNoMenu').catch(()=>{});
 await p.waitForTimeout(1500);await tap('z'); // YES
 await waitTask('Task_WaitPressAB_AfterSell');
 const sold=await read();
 await ctx.shot('sold');
 if(sold.money!==before.money+2*Math.floor(price/2)||sold.bag.pokeBalls[0].quantity!==qty0-2)throw Error('Sale mismatch '+JSON.stringify({before:before.money,sold:sold.money,qty0,qty:sold.bag.pokeBalls[0]?.quantity}));
 await tap('z');await waitTask('Task_BagMenu_HandleInput');
 await tap('x');
 for(let i=0;i<40;i++){if((await read()).tasks.includes('Task_ShopMenu'))break;await p.waitForTimeout(300);await tap('z');}
 await waitTask('Task_ShopMenu');await tap('x');
 for(let i=0;i<50;i++){if(await p.locator('#engine-interaction').getAttribute('data-script-active')==='false')break;await p.waitForTimeout(300);await tap('z');}
 await p.locator('#engine-interaction').waitFor({state:'hidden'});
 await p.getByRole('button',{name:'Menú · Esc'}).click();
 await p.locator('#explore-save').click();await p.keyboard.press('Escape');
 await p.reload();await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 const persisted=await read();
 if(persisted.money!==sold.money||persisted.bag.pokeBalls[0].quantity!==qty0-2)throw Error('Sale not persisted');
 return {price,sold:2,moneyGain:2*Math.floor(price/2),saveReload:'PASS',errors:ctx.errors()};
}
