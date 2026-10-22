// PREPARED once: a stored Kanto trainer (lab-done) and the tile below the Route 102 Oran tree. The tree state comes from
// EventScript_ResetAllBerries (first Hoenn map entry); picking uses the source BerryTreeScript through real keys, then
// Save and Home Continue must keep the picked tree empty and the berries in the bag.
import { readFileSync } from 'node:fs';
const assert=(v,m)=>{if(!v)throw Error(m);};
export default async function run(ctx){
 const p=ctx.page,base=process.env.PW_BASE??'http://127.0.0.1:5174/';
 const missing=[];p.on('console',m=>{if(/not implemented|script command|Unsupported/i.test(m.text()))missing.push(m.text());});
 p.on('pageerror',e=>missing.push('pageerror '+String(e)));
 const state=()=>p.evaluate(async()=>{
  const {save}=await import('/src/games/firered/save.ts');
  return {busy:document.querySelector('#content')?.getAttribute('aria-busy')==='true',open:!!document.querySelector('#engine-interaction')&&!document.querySelector('#engine-interaction').hidden,save:JSON.parse(JSON.stringify(save))};
 });
 const ready=()=>p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length,null,{timeout:60000});
 const press=async(key)=>{await p.keyboard.press(key);await p.waitForTimeout(420);};
 const settle=async()=>{for(let i=0;i<200;i++){const s=await state();if(!s.open&&!s.busy)return s;await press('z');}throw Error('Field did not unlock');};
 const save=async()=>{await settle();await p.getByRole('button',{name:'Menu · Esc',exact:true}).click();await p.getByRole('button',{name:'Save game',exact:true}).click();assert((await p.locator('#explore-save-result').innerText()).includes('saved'),'Saving failed');await p.keyboard.press('Escape');};
 const trainer=JSON.parse(readFileSync('tools/playtest/saves/lab-done.json','utf8'));trainer.viewerStart='definitive-kanto-v1';
 await p.goto(base);await p.evaluate(s=>{localStorage.clear();localStorage.setItem('firered-save-v1',JSON.stringify(s));},trainer);
 await p.goto(new URL('world.html?region=hoenn&ferry=1#modo=explore&mapa=MAP_SLATEPORT_CITY',base).href);await ready();
 const tree=await p.evaluate(async()=>{
  const {rom}=await import('/src/core/rom.ts');const EM=await import('/src/games/emerald/generated/constants.ts');
  const {save}=await import('/src/games/firered/save.ts');const {syncViewerLocation}=await import('/src/viewer/session.ts');const {writeWorldSave}=await import('/src/viewer/regionSave.ts');
  const header=await rom.loadMap('MAP_ROUTE102');
  const o=header.objects.find(o=>!o.clone&&o.scriptName==='BerryTreeScript'&&o.trainerRange===EM.BERRY_TREE_ROUTE_102_ORAN);
  syncViewerLocation({mapId:'MAP_ROUTE102',x:o.x,y:o.y+1,direction:'north',dynamic:null});
  save.objectEventTemplates=[];delete save.viewerObjects;
  if(!writeWorldSave())throw Error('Initial checkpoint failed');
  return {x:o.x,y:o.y,localId:o.localId};
 });
 await p.goto(base);await p.getByRole('link',{name:'▶ Continue',exact:true}).click();await ready();await settle();await p.locator('#viewport').focus();
 const berries=d=>(d.bag.berryPouch.find(s=>s.item===139)?.quantity??0);
 const trees=async()=>p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');return JSON.parse(JSON.stringify(save.berryTrees??null));});
 const before=await trees();assert(before&&before.length===128,'EventScript_ResetAllBerries did not create the trees');
 const oran=before[2];assert(oran.stage===5&&oran.berryYield>0,'Oran tree is not fully grown: '+JSON.stringify(oran));
 const beforeState=await state();
 await press('z');await p.locator('#engine-interaction').waitFor({state:'visible',timeout:10000});await ctx.shot('berry-tree-prompt');
 await settle();
 const after=await state();const afterTrees=await trees();
 console.log('PICK',berries(beforeState.save),'->',berries(after.save),JSON.stringify(afterTrees[2]));
 assert(berries(after.save)===berries(beforeState.save)+oran.berryYield,'Berries were not added');
 assert(afterTrees[2].stage===0&&afterTrees[2].berry===0,'The picked tree is not empty');
 await save();const saved=await state();
 await p.goto(base);await p.getByRole('link',{name:'▶ Continue',exact:true}).click();await ready();await settle();
 const resumed=await state();
 assert(JSON.stringify((await trees()))===JSON.stringify(saved.save.berryTrees),'Berry trees changed across Home Continue');
 assert(berries(resumed.save)===berries(saved.save),'Berries lost across Continue');
 await ctx.shot('berry-tree-continued');
 assert(missing.length===0,'Missing source behaviour: '+missing.join('; '));
 return {status:'PASS',scope:'PREPARED trainer and the tile below the Route 102 Oran tree; source BerryTreeScript pick through keys, Save and Home Continue keep the empty tree and the bag. Planting/watering and tree sprites are not covered',errors:ctx.errors()};
}
