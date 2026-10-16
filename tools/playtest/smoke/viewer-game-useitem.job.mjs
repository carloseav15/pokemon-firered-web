// PREPARED: Viridian Center URL start; a Potion and a damaged lead are explicit
// preconditions. The bag, item menu and party selection are the source screens.
export default async function run(ctx){
 const p=ctx.page;
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_VIRIDIAN_CITY_POKEMON_CENTER_1F&px=7&py=6',process.env.PW_BASE??'http://localhost:5173').href);
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 await p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');const {addBagItem}=await import('/src/core/pokemon/items.ts');addBagItem(13,3);save.party[0].hp=3;});
 const hp=()=>p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');return {hp:save.party[0].hp,max:save.party[0].stats[0],potions:save.bag.items.find(i=>i.item===13)?.quantity??0};});
 const tasks=()=>p.evaluate(async()=>{const {tasks}=await import('/src/core/gba/tasks.ts');return tasks.tasks.filter(t=>t.isActive).map(t=>t.func.name);});
 const hold=async k=>{await p.keyboard.down(k);await p.waitForTimeout(120);await p.keyboard.up(k);await p.waitForTimeout(700);};
 const before=await hp();
 await p.locator('#viewport').focus();
 await hold('Enter');await p.waitForTimeout(1200);
 await hold('ArrowDown');await hold('ArrowDown');await hold('z');await p.waitForTimeout(2500);
 await ctx.shot('bag');
 await hold('z');await ctx.shot('item-menu');          // POTION -> USE/TOSS/CANCEL
 await hold('z');await p.waitForTimeout(2500);await ctx.shot('party-select');
 await hold('z');
 const dbg=[];for(let i=0;i<4;i++){await p.waitForTimeout(700);await ctx.shot('use-'+i);dbg.push(await tasks());}
 for(let i=0;i<8;i++){await hold('z');}
 await p.waitForTimeout(1500);await ctx.shot('end');
 const after=await hp();
 const t=await tasks();
 return {before,after,dbg,tasks:t,errors:ctx.errors()};
}
