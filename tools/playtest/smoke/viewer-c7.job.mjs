export default async function run(ctx) {
 const p=ctx.page;
 await p.addInitScript(()=>{window.c7Import=path=>{const entry=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname===path);if(!entry)throw Error('Unloaded module '+path);return import(entry.name);};});
 await p.goto(new URL('viewer.html',process.env.PW_BASE).href);
 await p.locator('#loading-overlay').waitFor({state:'hidden'});
 const templates=await p.evaluate(async()=>{
  const {loadEffectTemplate}=await window.c7Import('/src/viewer/data/fieldFxTemplates.ts');
  const out=[];for(const name of ['TallGrass','GroundImpactDust','Ripple']){const a=loadEffectTemplate(name),b=loadEffectTemplate(name);if(a!==b)throw Error('inflight cache identity');const t=await a;out.push({name,frames:t.frames.length,ticks:t.anims[0].filter(c=>c[0]==='F').reduce((s,c)=>s+c[2],0),first:t.anims[0][0],packing:t.frames.map(f=>[f.sourceX,f.sourceY,f.width,f.height])});}
  try{await loadEffectTemplate('SurfBlob');throw Error('Unsupported template accepted');}catch(e){if(!String(e).includes('unsupported template'))throw e;}
  // Observation only: no events, terrains or results are fabricated.
  const {ViewerFieldEffects}=await window.c7Import('/src/viewer/fieldEffects.ts');const original=ViewerFieldEffects.prototype.onGroundStep;
  window.c7Events=[];ViewerFieldEffects.prototype.onGroundStep=function(phase,actor){window.c7Grid=this.grid;if(!this.observed){this.observed=true;this.subscribe(e=>window.c7Events.push(e.type==='spawn'?{type:e.type,name:e.template.name,generation:e.generation,id:e.id,position:e.position,phase:e.phase,direction:e.direction,priority:e.priority}:e));}return original.call(this,phase,actor);};
  return out;
 });
 await p.locator('#mode-explore-btn').click();
 await p.waitForFunction(()=>window.c7Grid);
 const start=await p.evaluate(()=>{const g=window.c7Grid;for(let y=g.minY;y<g.minY+g.height;y++)for(let x=g.minX;x<g.minX+g.width;x++)if(g.isGrassTile(x,y)&&g.isWalkable(x,y,'walk')&&g.isWalkable(x-1,y,'walk')&&g.behaviors[g.idx(x,y)]!==0)return {x:x-1,y,grassX:x};throw Error('no grass step');});
 await p.locator('#mode-viewer-btn').click();
 // PREPARED starting coordinates through the public viewer URL; subsequent key movement is real.
 await p.goto('about:blank');await p.goto(new URL(`viewer.html#modo=explore&px=${start.x}&py=${start.y}`,process.env.PW_BASE).href);
 await p.locator('#loading-overlay').waitFor({state:'hidden'});
 await p.waitForFunction(()=>document.getElementById('mode-explore-btn').classList.contains('active-mode'));
 await p.evaluate(async()=>{const {ViewerFieldEffects}=await window.c7Import('/src/viewer/fieldEffects.ts');window.c7Events=[];const o=ViewerFieldEffects.prototype.onGroundStep;ViewerFieldEffects.prototype.onGroundStep=function(phase,actor){if(!this.observed){this.observed=true;this.subscribe(e=>window.c7Events.push(e.type==='spawn'?{type:e.type,name:e.template.name,generation:e.generation,position:e.position,phase:e.phase,direction:e.direction,priority:e.priority}:e));}return o.call(this,phase,actor);};});
 await p.keyboard.press('ArrowRight');await p.waitForTimeout(250);
 const events=await p.evaluate(()=>window.c7Events);
 const grass=events.find(e=>e.type==='spawn'&&e.name==='TallGrass');
 if(!grass||grass.phase!=='begin'||grass.position.tileX!==start.grassX||grass.direction!=='east')throw Error('grass activation '+JSON.stringify(events));
 const {tick:before,count}=await p.evaluate(async()=>{const {viewerClock}=await window.c7Import('/src/viewer/clock.ts');const before=viewerClock.tick;viewerClock.pause('PREPARED-check');return {tick:before,count:viewerClock.subscriberCount};});
 await p.waitForTimeout(250);
 const paused=await p.evaluate(async()=>{const {viewerClock}=await window.c7Import('/src/viewer/clock.ts');return viewerClock.tick;});if(paused!==before)throw Error('paused timeline advanced');
 await p.evaluate(async()=>{const {viewerClock}=await window.c7Import('/src/viewer/clock.ts');viewerClock.resume('PREPARED-check');});
 await p.locator('#mode-viewer-btn').click();await p.waitForTimeout(60);
 if(await p.locator('.field-fx').count())throw Error('session reset retained effects');
 if(!await p.evaluate(()=>window.c7Events.some(e=>e.type==='clear')))throw Error('session clear missing');
 // Tile switch remains off: clock still advances for simulation/audio.
 const t1=await p.evaluate(async()=> (await window.c7Import('/src/viewer/clock.ts')).viewerClock.tick);await p.waitForTimeout(80);
 const t2=await p.evaluate(async()=> (await window.c7Import('/src/viewer/clock.ts')).viewerClock.tick);if(t2<=t1)throw Error('clock dependent on tiles');
 const fixtures=await p.evaluate(async()=>{
  const {WorldGrid}=await import('/src/viewer/data/worldGrid.ts');
  const {ViewerFieldEffects}=await window.c7Import('/src/viewer/fieldEffects.ts');
  const {ViewerClock}=await window.c7Import('/src/viewer/clock.ts');
  const C=await import('/src/fr/generated/constants.ts');
  const g=new WorldGrid(4,1,-2,0);g.behaviors[0]=C.MB_TALL_GRASS;g.behaviors[1]=C.MB_POND_WATER;
  const fx=await ViewerFieldEffects.create(g,new ViewerClock({request:()=>1,cancel:()=>{}}));let events=[];const off=fx.subscribe(e=>events.push(e));
  const actor={x:-2,y:0,previousX:-2,previousY:0,direction:'east',previousDirection:'north',landingJump:false};
  fx.resetSession();fx.onGroundStep('spawn',actor);fx.onGroundStep('begin',actor);
  if(events.filter(e=>e.type==='spawn').length!==1||events[1].startCommand!==4||events[1].initialExtraTicks!==1||!events[1].retainUntilLeave)throw Error('grass dedup/seek');
  fx.onGroundStep('finish',{...actor,x:-1,previousX:-2});
  const ripple=events.find(e=>e.type==='spawn'&&e.template.name==='Ripple');if(!ripple||ripple.position.yPx!==-2||ripple.priority.oamPriority!==3||ripple.priority.subpriority!==151)throw Error('ripple contract');
  fx.onGroundStep('finish',{...actor,x:0,previousX:-1,landingJump:true});
  if(!events.some(e=>e.type==='release')||!events.some(e=>e.type==='spawn'&&e.template.name==='GroundImpactDust'&&e.position.yPx===8))throw Error('retire/dust');
  fx.resetSession();const generation=fx.generation;if(events.at(-1).type!=='clear'||generation!==2)throw Error('generation clear');off();const n=events.length;fx.resetSession();if(events.length!==n)throw Error('bus cancellation');
  // PREPARED HTTP failure then retry, actual assets on retry; isolated module cache.
  const isolated=await import('/src/viewer/data/fieldFxTemplates.ts?retry-check');const original=window.fetch;
  window.fetch=(input,...args)=>String(input)==='/fr/fieldfx.json'?Promise.resolve(new Response('',{status:503})):original(input,...args);
  try{await isolated.loadEffectTemplate('TallGrass');throw Error('HTTP failure accepted');}catch(e){if(!String(e).includes('HTTP 503'))throw e;}finally{window.fetch=original;}
  const retried=await isolated.loadEffectTemplate('TallGrass');if(retried.frames.length!==5)throw Error('failed promise poisoned cache');
  return {label:'PREPARED synthetic grid / HTTP failure',grassSeekDedup:true,ripple:true,dust:true,release:true,generation:true,unsubscribe:true,retry:true};
 });
 if(ctx.errors().length)throw Error(ctx.errors().join(';'));
 return {fixtures,templates,grass,pausedTick:before,subscriberCount:count,sessionCleanup:true,tilesOffClock:{t1,t2}};
}
