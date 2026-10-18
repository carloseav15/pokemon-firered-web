// PREPARED: Two Island URL start near the market clerk (28,4); for each story
// stage VAR_MAP_SCENE_TWO_ISLAND (0, 2, 3, 4) and ₽50000 are explicit
// preconditions, standing in for the Sevii story that advances it.
// TwoIsland_EventScript_Clerk picks the stage's list (scripts.inc
// TwoIsland_Items_Shop*), shows its intro once (FLAG_TWO_ISLAND_SHOP_*) and
// opens the source mart. Each stage buys an item that only exists at that list
// position, so a shorter list would leave the cursor on another item.
// Run with PW_TIMEOUT_MS=580000.
const BASE=process.env.PW_BASE??'http://localhost:5173';
// [VAR_MAP_SCENE_TWO_ISLAND, intro flag, list index, item]
const STAGES=[[0,'FLAG_TWO_ISLAND_SHOP_INTRODUCED',1,'ITEM_FRESH_WATER'],[2,'FLAG_TWO_ISLAND_SHOP_EXPANDED_1',2,'ITEM_SODA_POP'],
 [3,'FLAG_TWO_ISLAND_SHOP_EXPANDED_2',5,'ITEM_MOOMOO_MILK'],[4,'FLAG_TWO_ISLAND_SHOP_EXPANDED_3',7,'ITEM_LAVA_COOKIE']];
export default async function run(ctx){
 const p=ctx.page, results={};
 const read=(item)=>p.evaluate(async(it)=>{const s=await import('/src/games/firered/save.ts');const C=await import('/src/games/firered/generated/constants.ts');const {tasks}=await import('/src/core/gba/tasks.ts');
  return {money:s.save.money,count:Object.values(s.save.bag).flat().filter(e=>(e.itemId??e.item)===C[it]).reduce((a,e)=>a+e.quantity,0),tasks:tasks.tasks.filter(t=>t.isActive).map(t=>t.func.name)};},item);
 const hold=async(k,ms=120)=>{await p.keyboard.down(k);await p.waitForTimeout(ms);await p.keyboard.up(k);await p.waitForTimeout(650);};
 const until=async(item,task)=>{for(let i=0;i<60;i++){if((await read(item)).tasks.includes(task))return true;await p.waitForTimeout(250);}return false;};
 for(const [stage,flag,index,item] of STAGES){
  let note='clerk not reached';
  for(const [px,py,face] of [[28,6,'ArrowUp'],[28,5,'ArrowUp'],[30,4,'ArrowLeft'],[26,4,'ArrowRight']]){
   await p.goto(new URL(`viewer.html#modo=explore&mapa=MAP_TWO_ISLAND&px=${px}&py=${py}`,BASE).href);await p.reload();
   await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length,{timeout:20000});
   await p.evaluate(async(v)=>{const s=await import('/src/games/firered/save.ts');const C=await import('/src/games/firered/generated/constants.ts');s.varSet(C.VAR_MAP_SCENE_TWO_ISLAND,v);s.save.money=50000;},stage);
   await p.waitForTimeout(3000);await p.locator('#viewport').focus();
   await hold(face);await hold(face,60);await hold('z');
   if(!await p.locator('#engine-interaction').isVisible()){await p.waitForTimeout(800);if(!await p.locator('#engine-interaction').isVisible())continue;}
   // Intro message, then BUY/SELL/QUIT.
   let menu=false;for(let i=0;i<60;i++){const s=await read(item);if(s.tasks.includes('Task_ShopMenu')){menu=true;break;}await p.waitForTimeout(250);if(i%8===7)await hold('z');}
   if(!menu){note='no shop menu';break;}
   const before=await read(item);
   const introSet=await p.evaluate(async(f)=>{const s=await import('/src/games/firered/save.ts');const C=await import('/src/games/firered/generated/constants.ts');return s.flagGet(C[f]);},flag);
   await hold('z');
   if(!await until(item,'Task_BuyMenu')){note='no buy menu';break;}
   for(let i=0;i<index;i++)await hold('ArrowDown');
   await ctx.shot(`stage-${stage}-list`);
   await hold('z');
   if(!await until(item,'Task_BuyHowManyDialogueHandleInput')){note='no quantity';break;}
   await hold('z');
   if(!await until(item,'Task_CallYesOrNoCallback')){note='no confirm';break;}
   await hold('z');
   await until(item,'Task_ReturnToItemListAfterItemPurchase');
   const after=await read(item);
   note=after.count===before.count+1&&after.money<before.money&&introSet?'PASS':`FAIL bought ${after.count-before.count} ${item}, intro ${introSet}`;
   break;
  }
  results[stage]=note;
 }
 const failed=Object.entries(results).filter(([,v])=>v!=='PASS');
 if(failed.length)throw Error('Two Island stages failed '+JSON.stringify(results));
 return {results,errors:ctx.errors()};
}
