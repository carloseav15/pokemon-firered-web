// PREPARED trainer and starting tile beside each source switch only.
// A real key step runs the puzzle; Save and Home Continue use the visible UI.
import { readFileSync } from 'node:fs';
const assert=(ok,message)=>{if(!ok)throw Error(message);};
export default async function run(ctx){
 const p=ctx.page,base=process.env.PW_BASE??'http://127.0.0.1:5174/';
 const missing=[];p.on('console',m=>{if(/not implemented|script command/i.test(m.text()))missing.push(m.text());});
 const ready=async()=>{await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length,null,{timeout:60000});await p.waitForFunction(()=>document.querySelector('#content')?.getAttribute('aria-busy')!=='true'&&document.querySelector('#engine-interaction')?.hidden);await p.waitForTimeout(1000);};
 const live=()=>p.evaluate(async()=>JSON.parse(JSON.stringify((await import('/src/games/firered/save.ts')).save)));
 const save=async()=>{await p.getByRole('button',{name:'Menu · Esc',exact:true}).click();await p.getByRole('button',{name:'Save game',exact:true}).click();assert((await p.locator('#explore-save-result').innerText()).includes('saved'),'Save failed');await p.keyboard.press('Escape');};
 const poses=s=>s.objectEventTemplates.map(t=>[t.localId,t.x,t.y,t.movementType]);
 for(const [mapId,x,y] of [['MAP_MOSSDEEP_CITY_GYM',2,22],['MAP_ROUTE110_TRICK_HOUSE_PUZZLE7',8,20]]){
  const trainer=JSON.parse(readFileSync('tools/playtest/saves/lab-done.json','utf8'));trainer.viewerStart='definitive-kanto-v1';
  await p.goto(base);await p.evaluate(s=>{localStorage.clear();localStorage.setItem('firered-save-v1',JSON.stringify(s));},trainer);
  await p.goto(new URL('world.html?region=hoenn&ferry=1#modo=explore&mapa=MAP_SLATEPORT_CITY',base).href);await ready();
  // PREPARED initial puzzle entry only: no puzzle object positions/orientations are supplied.
  await p.evaluate(async({mapId,x,y})=>{
   const {save}=await import('/src/games/firered/save.ts');
   const {syncViewerLocation}=await import('/src/viewer/session.ts');
   const {writeWorldSave}=await import('/src/viewer/regionSave.ts');
   syncViewerLocation({mapId,x,y,direction:'north',dynamic:null});
   save.objectEventTemplates=[];delete save.viewerObjects;
   if(!writeWorldSave())throw Error('Initial checkpoint failed');
  },{mapId,x,y});
  await p.goto(base);await p.getByRole('link',{name:'▶ Continue',exact:true}).click();await ready();
  const before=await live();await ctx.shot(mapId+'-start');
  await p.locator('#viewport').focus();await p.keyboard.press('ArrowUp');await p.waitForTimeout(1800);await ready();
  const after=await live();console.log('STEP',mapId,after.viewerNavigation);
  assert(JSON.stringify(poses(after))!==JSON.stringify(poses(before)),mapId+' source switch did not move templates');
  await save();const saved=await live();
  assert(saved.viewerObjects.states.some(o=>o.mapId===mapId),'No saved live projection');
  const raw=await p.evaluate(()=>localStorage.getItem('firered-save-v1'));
  await ctx.shot(mapId+'-saved');
  await p.goto(base);await p.getByRole('link',{name:'▶ Continue',exact:true}).click();await ready();
  const continued=await live();
  assert(JSON.stringify(poses(continued))===JSON.stringify(poses(saved)),mapId+' template poses lost on Home Continue');
  assert(JSON.stringify(continued.party)===JSON.stringify(saved.party)&&JSON.stringify(continued.bag)===JSON.stringify(saved.bag)&&continued.money===saved.money,'Shared trainer changed');
  assert(JSON.stringify(continued.viewerObjects)===JSON.stringify(saved.viewerObjects),'Saved projection changed during Continue');
  assert(await p.evaluate(()=>localStorage.getItem('firered-save-v1'))===raw,'Continue rewrote storage');
  await save();const resaved=await live();
  // A second UI Save captures restored entities. Source LOOK_AROUND (1) may face a new
  // direction during elapsed UI time; check its position/type and fixed-facing objects exactly.
  const sort=states=>states.filter(o=>o.mapId===mapId).sort((a,b)=>a.localId-b.localId).map(o=>[o.localId,o.x,o.y,o.movementType===1?'LOOK_AROUND':o.direction,o.movementType]);
  assert(JSON.stringify(sort(resaved.viewerObjects.states))===JSON.stringify(sort(saved.viewerObjects.states)),mapId+' restored viewer poses lost on second Save');
  await p.getByRole('button',{name:'Menu · Esc',exact:true}).click();
  await p.getByRole('button',{name:'Load saved game',exact:true}).click();await ready();
  assert(JSON.stringify(poses(await live()))===JSON.stringify(poses(resaved)),mapId+' same-map menu Continue lost templates');
  await p.reload();await ready();
  assert(JSON.stringify(poses(await live()))===JSON.stringify(poses(resaved)),mapId+' reload lost templates');
  await ctx.shot(mapId+'-continued');
  console.log(mapId+' key switch / Save / Home Continue / second Save / menu Continue / reload PASS');
 }
 assert(missing.length===0,missing.join('\n'));
 return {status:'PASS',scope:'PREPARED trainer and adjacent starting tiles; real source coordinate switches, UI Save/Home Continue/second Save/menu Continue/reload in Mossdeep and Trick House 7; no full puzzle walk or audiovisual parity',errors:ctx.errors()};
}
