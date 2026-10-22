// PREPARED once: existing trainer and the initial tile beside the yellow switch.
// Thereafter only keyboard/UI input; source geometry plans walks and predicted warps.
import { readFileSync } from 'node:fs';
const assert=(ok,message)=>{if(!ok)throw Error(message);};
export default async function run(ctx){
 const p=ctx.page,base=process.env.PW_BASE??'http://127.0.0.1:5174/',mapId='MAP_MOSSDEEP_CITY_GYM';
 const state=()=>p.evaluate(async()=>{const{save}=await import('/src/games/firered/save.ts');const{gMain}=await import('/src/core/hw/runtime.ts');const h=new URLSearchParams(location.hash.slice(1));return {x:Number(h.get('px')),y:Number(h.get('py')),map:h.get('mapa'),open:!document.querySelector('#engine-interaction')?.hidden,busy:document.querySelector('#content')?.getAttribute('aria-busy')==='true',battle:gMain.inBattle,save:JSON.parse(JSON.stringify(save))};});
 const ready=()=>p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length,null,{timeout:60000});
 const settle=async()=>{for(let i=0;i<180;i++){const s=await state();if(s.battle)throw Error('Trainer battle blocks the scoped puzzle route');if(!s.open&&!s.busy)return s;await p.waitForTimeout(100);}await ctx.shot('warp-stuck');throw Error('Mossdeep field did not unlock');};
 const press=async(key)=>{await p.locator('#viewport').focus();await p.keyboard.press(key);await p.waitForTimeout(420);return settle();};
 const poses=s=>s.objectEventTemplates.map(t=>[t.localId,t.x,t.y,t.movementType]);
 const trainer=JSON.parse(readFileSync('tools/playtest/saves/lab-done.json','utf8'));trainer.viewerStart='definitive-kanto-v1';
 await p.goto(base);await p.evaluate(s=>{localStorage.clear();localStorage.setItem('firered-save-v1',JSON.stringify(s));},trainer);
 await p.goto(new URL('world.html?region=hoenn&ferry=1#modo=explore&mapa=MAP_SLATEPORT_CITY',base).href);await ready();await settle();
 // PREPARED initial entry only. No puzzle result, trainer defeat or later location is written.
 await p.evaluate(async(mapId)=>{const{save}=await import('/src/games/firered/save.ts');const{syncViewerLocation}=await import('/src/viewer/session.ts');const{writeWorldSave}=await import('/src/viewer/regionSave.ts');syncViewerLocation({mapId,x:2,y:22,direction:'north',dynamic:null});save.objectEventTemplates=[];delete save.viewerObjects;if(!writeWorldSave())throw Error('Initial checkpoint failed');},mapId);
 await p.goto(base);await p.getByRole('link',{name:'▶ Continue',exact:true}).click();await ready();await settle();
 const before=await state();const switched=await press('ArrowUp');
 assert(JSON.stringify(poses(switched.save))!==JSON.stringify(poses(before.save)),'Source yellow switch did not move templates');
 await ctx.shot('source-switch');
 // Source static collision cells plus current source object/template poses. Avoid other
 // warp and coordinate-event cells, so this path cannot secretly execute another switch.
 const route=await p.evaluate(async(mapId)=>{const{rom}=await import('/src/core/rom.ts');const{save,flagGet}=await import('/src/games/firered/save.ts');const header=await rom.loadMap(mapId),l=await rom.loadLayout(header.layout);const start=[2,21],target=[1,23];
 const walls=new Set(),cells=new Set();for(let y=0;y<l.height;y++)for(let x=0;x<l.width;x++)if(!(l.blocks[y*l.width+x]&0xc00))cells.add(`${x},${y}`);
 for(const o of save.objectEventTemplates){if(o.flag&&flagGet(o.flag))continue;const live=save.viewerObjects?.states.find(s=>s.mapId===mapId&&s.localId===o.localId);if(!live?.removed)walls.add(`${live?.x??o.x},${live?.y??o.y}`);}
 for(const w of header.warps)if(w.x!==target[0]||w.y!==target[1])walls.add(`${w.x},${w.y}`);
 for(const e of header.coords)if(e.x!==start[0]||e.y!==start[1])walls.add(`${e.x},${e.y}`);
 const queue=[start],prev=new Map([[start.join(','),null]]);
 for(let i=0;i<queue.length;i++){const at=queue[i],k=at.join(',');if(k===target.join(',')){const path=[];let q=k;while(prev.get(q)){const [parent,key]=prev.get(q);path.push(key);q=parent;}return path.reverse();}for(const[dx,dy,key]of[[0,-1,'ArrowUp'],[-1,0,'ArrowLeft'],[1,0,'ArrowRight'],[0,1,'ArrowDown']]){const n=[at[0]+dx,at[1]+dy],nk=n.join(',');if(!prev.has(nk)&&cells.has(nk)&&!walls.has(nk)){prev.set(nk,[k,key]);queue.push(n);}}}
 throw Error('No source walking path from switch to first pad');},mapId);
 console.log('SOURCE WALK',route);
 const persistent=JSON.stringify(poses(switched.save));let landed;
 for(const key of route)landed=await press(key);
 assert(landed.x===3&&landed.y===28,'Source first pad must land at (3,28), got '+JSON.stringify({x:landed.x,y:landed.y}));
 assert(JSON.stringify(poses(landed.save))===persistent,'Warp reset source puzzle templates');
 assert(landed.save.facing===1,'Mossdeep source arrival direction must be south');
 assert(JSON.stringify(landed.save.party)===JSON.stringify(switched.save.party)&&landed.save.money===switched.save.money&&JSON.stringify(landed.save.bag)===JSON.stringify(switched.save.bag),'Warp changed shared trainer state');
 await ctx.shot('source-pad-arrival');
 // Find an adjacent source wall and verify one real blocked key leaves the player in place.
 const wall=await p.evaluate(async({mapId,x,y})=>{const{rom}=await import('/src/core/rom.ts');const h=await rom.loadMap(mapId),l=await rom.loadLayout(h.layout);for(const[dx,dy,key]of[[0,-1,'ArrowUp'],[-1,0,'ArrowLeft'],[1,0,'ArrowRight'],[0,1,'ArrowDown']])if(l.blocks[(y+dy)*l.width+x+dx]&0xc00)return key;return null;},{mapId,x:3,y:28});
 assert(wall,'Expected a source wall beside this pad');const blocked=await press(wall);assert(blocked.x===3&&blocked.y===28,'Source wall failed collision');
 await p.getByRole('button',{name:'Menu · Esc',exact:true}).click();await p.getByRole('button',{name:'Save game',exact:true}).click();assert((await p.locator('#explore-save-result').innerText()).includes('saved'),'Save failed');await p.keyboard.press('Escape');
 const saved=await state();await p.goto(base);await p.getByRole('link',{name:'▶ Continue',exact:true}).click();await ready();const resumed=await settle();
 assert(JSON.stringify(poses(resumed.save))===persistent,'Home Continue lost warped puzzle templates');
 console.log('CONTINUE NAV',JSON.stringify({saved:saved.save.viewerNavigation,resumed:resumed.save.viewerNavigation,locBefore:saved.save.location,locAfter:resumed.save.location,facingBefore:saved.save.facing,facingAfter:resumed.save.facing}));
 assert(JSON.stringify(resumed.save.viewerNavigation)===JSON.stringify(saved.save.viewerNavigation),'Home Continue changed warp location');
 await p.reload();await ready();const reloaded=await settle();assert(JSON.stringify(poses(reloaded.save))===persistent,'Reload lost warped puzzle templates');
 await ctx.shot('source-pad-continued');assert(ctx.errors().length===0,ctx.errors().join('\n'));
 return {status:'PASS',scope:'PREPARED trainer/initial tile only; keyboard source switch -> walk -> source pad -> real wall collision -> Save/Home Continue/reload; no full gym, travel or audiovisual parity claim',steps:route.length};
}
