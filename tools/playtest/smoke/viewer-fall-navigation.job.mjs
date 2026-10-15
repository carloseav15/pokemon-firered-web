// PREPARED adjacent entry URLs. Source holes, keyboard, production landing flags and camera.
export default async function run(ctx){
 const p=ctx.page,character=process.env.PW_CHARACTER??'red';await p.setViewportSize({width:1280,height:720});
 await p.addInitScript(()=>{
  window.fallProbe={positions:[],frames:[],effects:[],visibility:[],grids:[],waits:[]};
  new MutationObserver(records=>{for(const r of records){const raw=r.target.dataset.warpMotion??r.oldValue;if(raw)window.fallProbe.frames.push({...JSON.parse(raw),map:document.querySelector('#content')?.dataset.navigationMap});}}).observe(document,{subtree:true,attributes:true,attributeOldValue:true,attributeFilter:['data-warp-motion']});
  if(!/^https?:$/.test(location.protocol))return;
  void Promise.all([import('/src/viewer/fieldEffects.ts'),import('/src/viewer/clock.ts')]).then(([{ViewerFieldEffects},{viewerClock}])=>{
   const on=ViewerFieldEffects.prototype.onGroundStep;
   ViewerFieldEffects.prototype.onGroundStep=function(phase,a){const probe=window.fallProbe;probe.grid=this.grid;
    if(!probe.grids.includes(this.grid))probe.grids.push(this.grid);
    if(!this.fallObserved){this.fallObserved=true;this.subscribe(e=>{if(e.type==='spawn')probe.effects.push({name:e.template.name,map:document.querySelector('#content')?.dataset.navigationMap,tick:viewerClock.tick});});}
    if(phase==='spawn'||phase==='finish')probe.positions.push({...a,phase,tick:viewerClock.tick,map:document.querySelector('#content')?.dataset.navigationMap});
    return on.call(this,phase,a);
   };
   const sample=()=>{const el=document.querySelector('#player-sprite');if(el){const value={map:document.querySelector('#content')?.dataset.navigationMap,visible:el.style.visibility!=='hidden',tick:viewerClock.tick};
    const last=window.fallProbe.visibility.at(-1);if(last?.map!==value.map||last?.visible!==value.visible)window.fallProbe.visibility.push(value);}
    requestAnimationFrame(sample);
   };requestAnimationFrame(sample);
  });
 });
 const idle=()=>p.waitForFunction(()=>window.fallProbe?.positions.length&&!document.body.hasAttribute('aria-busy')&&document.querySelector('#content').getAttribute('aria-busy')!=='true'&&!JSON.parse(document.querySelector('#player-sprite').dataset.animation).moving);
 const enter=async(map,point)=>{await p.goto('about:blank');await p.goto(new URL(`viewer.html#modo=explore&mapa=${map}${point?`&px=${point.x}&py=${point.y}`:''}`,process.env.PW_BASE).href);await idle();
  if(await p.locator('#player-char').inputValue()!==character){await p.getByRole('button',{name:'Menú · Esc'}).click();await p.locator('#explore-character').selectOption(character);await p.keyboard.press('Escape');await idle();}
 };
 const results=[];
 for(const map of ['MAP_SEAFOAM_ISLANDS_1F','MAP_SEAFOAM_ISLANDS_B2F']){
  await enter(map);
  const fixture=await p.evaluate(async map=>{
   const {Rom}=await import('/src/core/rom.ts'),{planStep}=await import('/src/viewer/movement.ts'),MB=await import('/src/games/firered/generated/metatileBehavior.ts');
   const data=new Rom(),h=await data.loadMap(map),g=window.fallProbe.grid,warps=new Set(h.warps.map(w=>`${w.x},${w.y}`));
   for(const w of h.warps){if(!MB.MetatileBehavior_IsFallWarp(g.behaviorAt(w.x,w.y)))continue;
    for(const [key,dx,dy,dir]of [['ArrowRight',1,0,'east'],['ArrowDown',0,1,'south'],['ArrowLeft',-1,0,'west'],['ArrowUp',0,-1,'north']]){
     const x=w.x-dx,y=w.y-dy;if(warps.has(`${x},${y}`)||!g.isWalkable(x,y,'walk'))continue;
     const step=planStep(g,x,y,dir,'walk',g.elevationAt(x,y));if(step.status!=='ready'||step.jump||step.x!==w.x||step.y!==w.y)continue;
     const dest=await data.loadMap(w.destMap);return{x,y,key,direction:dir,warp:w,arrival:dest.warps[w.destWarpId]};
    }
   }throw Error('No traversable source fall hole '+map);
  },map);
  await enter(map,fixture);
  await p.evaluate(async()=>{
   const load=async path=>import(performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname===path)?.name??path);
   const [{ViewerWarpVisuals},{viewerClock}]=await Promise.all([load('/src/viewer/render/warpVisuals.ts'),load('/src/viewer/clock.ts')]);
   const wait=ViewerWarpVisuals.prototype.wait;
   ViewerWarpVisuals.prototype.wait=function(ticks){const entry={ticks,start:viewerClock.tick};window.fallProbe.waits.push(entry);
    const result=wait.call(this,ticks);void result.then(()=>{entry.end=viewerClock.tick;});return result;
   };
  });
  if(await p.locator('#player-sprite').evaluate((el,d)=>JSON.parse(el.dataset.animation).direction!==d,fixture.direction)){await p.keyboard.press(fixture.key);await idle();}
  const flight=(async()=>{await p.waitForFunction(()=>{const raw=document.querySelector('#player-sprite')?.dataset.warpMotion;if(!raw)return false;const m=JSON.parse(raw);return m.phase==='fall-in'&&!m.invisible&&m.y<0;});await ctx.shot(`fall-flight-${map}-${character}`);})();
  await p.keyboard.down(fixture.key);await p.waitForTimeout(25);await p.keyboard.up(fixture.key);
  await p.waitForFunction(dest=>{const a=window.fallProbe.positions.at(-1);return a?.phase==='spawn'&&a.map===dest;},fixture.warp.destMap);await idle();await flight;
  const observed=await p.evaluate(()=>({at:window.fallProbe.positions.at(-1),positions:window.fallProbe.positions,frames:window.fallProbe.frames,effects:window.fallProbe.effects,
   visibility:window.fallProbe.visibility,waits:window.fallProbe.waits,oldBytes:window.fallProbe.grids[0].retainedBytes,offset:document.querySelector('#player-sprite').dataset.warpMotion,
   priority:document.querySelector('#player-sprite').style.zIndex,hidden:document.querySelector('#player-sprite').style.visibility==='hidden',water:window.fallProbe.grid.isWaterTile(window.fallProbe.positions.at(-1).x,window.fallProbe.positions.at(-1).y)}));
  if(observed.at.x!==fixture.arrival.x||observed.at.y!==fixture.arrival.y||observed.hidden||observed.offset||observed.oldBytes!==0||observed.priority!=='25')throw Error('Fall arrival/cleanup differs '+JSON.stringify({fixture,observed}));
  const landing=observed.positions.filter(a=>a.map===fixture.warp.destMap&&a.landingJump);
  if(landing.length!==1)throw Error('Native landing flags missing or repeated');
  const effects=observed.effects.filter(e=>e.map===fixture.warp.destMap).map(e=>e.name),effect=observed.water?'JumpBigSplash':'GroundImpactDust';
  if(!effects.includes(effect))throw Error('No native landing effect '+JSON.stringify({effect,effects}));
  if(observed.at.vehicle!==(observed.water?'surf':'walk'))throw Error('Seafoam landing vehicle incorrect');
  if(!observed.frames.some(f=>f.invisible)||!observed.frames.some(f=>f.y<0&&!f.invisible)||!observed.frames.some(f=>f.y>=-16&&f.priority===2)||!observed.frames.some(f=>f.pan===4)||!observed.frames.some(f=>f.pan===-4)||observed.frames.at(-1).pan!==0)throw Error('Fall stages/priority/shake missing '+JSON.stringify({stages:[...new Set(observed.frames.map(f=>f.stage))],priorities:[...new Set(observed.frames.map(f=>f.priority))],pans:[...new Set(observed.frames.map(f=>f.pan))],first:observed.frames[0],last:observed.frames.at(-1)}));
  const departed=observed.positions.find(a=>a.phase==='finish'&&a.map===map),hidden=observed.visibility.find(v=>!v.visible&&v.map===map);
  // PISTA INCORRECTA: step-finish→hide need not be 21 ticks: destination loading precedes the wait, and RAF observation may lag.
  // Observe the actual source waits and their shared-clock completions instead of fabricating a timing result.
  if(JSON.stringify(observed.waits.map(w=>w.ticks))!==JSON.stringify([21,3,61])||observed.waits.some(w=>w.end<w.start+w.ticks)||!hidden||hidden.tick<observed.waits[0].end)throw Error('Source waits/visibility differ '+JSON.stringify({departed,hidden,waits:observed.waits}));
  await ctx.shot(`fall-arrival-${map}-${character}`);
  await p.waitForTimeout(350);
  if(await p.evaluate(()=>window.fallProbe.positions.filter(a=>a.phase==='spawn').length)!==2)throw Error('Fall arrival rebounded');
  results.push({map,fixture,at:observed.at,frames:observed.frames.length,effects,visibility:observed.visibility,waits:observed.waits,landing:landing[0],oldBytes:observed.oldBytes});
 }
 return{character,results,note:'PREPARED adjacent URL; actual source holes, keyboard, seven landing stages, priority/landing effects/shake and Seafoam Surf. Departure uses the hole.inc waits in a navigation adapter; the story script VM remains outside this scope. Native C task comparison is separate.'};
}
