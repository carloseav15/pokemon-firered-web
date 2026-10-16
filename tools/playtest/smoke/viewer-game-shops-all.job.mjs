// PREPARED: each shop URL starts near the counter; candidate tiles around the
// clerk are tried until the source script opens. Purchases are the source menus.
const SHOPS=[["MAP_CELADON_CITY_DEPARTMENT_STORE_4F",3,13],["MAP_CELADON_CITY_DEPARTMENT_STORE_5F",1,7],["MAP_CELADON_CITY_DEPARTMENT_STORE_5F",1,6],["MAP_TRAINER_TOWER_LOBBY",14,9],["MAP_THREE_ISLAND_MART",2,3],["MAP_FOUR_ISLAND_MART",2,3],["MAP_SIX_ISLAND_MART",2,3],["MAP_SEVEN_ISLAND_MART",2,3],["MAP_TWO_ISLAND",28,4]];
export default async function run(ctx){
 const p=ctx.page, only=process.env.SHOPS?.split(','), results={};
 const read=()=>p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');const {tasks}=await import('/src/core/gba/tasks.ts');return {money:save.money,items:JSON.stringify(save.bag),tasks:tasks.tasks.filter(t=>t.isActive).map(t=>t.func.name)};});
 const hold=async(k,ms=120)=>{await p.keyboard.down(k);await p.waitForTimeout(ms);await p.keyboard.up(k);await p.waitForTimeout(650);};
 const visible=()=>p.locator('#engine-interaction').isVisible();
 const cands=(x,y)=>[[x+2,y,'ArrowLeft'],[x-2,y,'ArrowRight'],[x,y+2,'ArrowUp'],[x,y-2,'ArrowDown'],[x+1,y,'ArrowLeft'],[x,y+1,'ArrowUp'],[x-1,y,'ArrowRight'],[x,y-1,'ArrowDown']];
 for(const [map,x,y] of SHOPS){
  const key=map+':'+x+','+y;
  if(only&&!only.includes(map))continue;
  let ok=false,note='';
  for(const [px,py,face] of cands(x,y)){
   try{
    await p.goto(new URL(`viewer.html#modo=explore&mapa=${map}&px=${px}&py=${py}`,process.env.PW_BASE??'http://localhost:5173').href);
    await p.reload();
    await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length,{timeout:20000});
    await p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');save.money=50000;}); // precondition: Vitamins cost more than the start money
    await p.waitForTimeout(1500);
    await p.locator('#viewport').focus();
    await hold(face);await hold(face,60);await hold('z');
    if(!await visible()){await p.waitForTimeout(800);if(!await visible())continue;}
    // Wait for the shop menu and buy the first item.
    let before;
    for(let i=0;i<60;i++){const s=await read();if(s.tasks.includes('Task_ShopMenu')){before=s;break;}await p.waitForTimeout(250);if(i%8===7)await hold('z');}
    if(!before){note='no shop menu at '+px+','+py;continue;}
    await hold('z');
    for(let i=0;i<40&&!(await read()).tasks.includes('Task_BuyMenu');i++)await p.waitForTimeout(250);
    await hold('z');
    for(let i=0;i<40&&!(await read()).tasks.includes('Task_BuyHowManyDialogueHandleInput');i++)await p.waitForTimeout(250);
    await hold('z');
    for(let i=0;i<40&&!(await read()).tasks.includes('Task_CallYesOrNoCallback');i++)await p.waitForTimeout(250);
    await hold('z');
    for(let i=0;i<40&&!(await read()).tasks.includes('Task_ReturnToItemListAfterItemPurchase');i++)await p.waitForTimeout(250);
    const after=await read();
    ok=after.money<before.money;
    note=(ok?'bought ':'money unchanged ')+(before.money-after.money)+' at '+px+','+py;
    break;
   }catch(e){note=String(e).slice(0,80);}
  }
  results[key]=(ok?'PASS ':'FAIL ')+note;
 }
 const failed=Object.entries(results).filter(([,v])=>!v.startsWith('PASS'));
 if(failed.length)throw Error('Shops failed '+JSON.stringify(results));
 return {results,errors:ctx.errors()};
}
