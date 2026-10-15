// PREPARED adjacent URLs only. Terrain, collision and movement use resident source maps.
export default async function run(ctx){
 const p=ctx.page,character=process.env.PW_CHARACTER??'red';await p.setViewportSize({width:1280,height:720});
 await p.addInitScript(()=>{
  window.forcedProbe={steps:[],positions:[],frames:[]};
  if(!/^https?:$/.test(location.protocol))return;
  Promise.all([import('/src/viewer/fieldEffects.ts'),import('/src/viewer/clock.ts')]).then(([{ViewerFieldEffects},{viewerClock}])=>{
   const on=ViewerFieldEffects.prototype.onGroundStep;
   ViewerFieldEffects.prototype.onGroundStep=function(phase,a){const probe=window.forcedProbe;probe.grid=this.grid;
    if(phase==='spawn'||phase==='finish')probe.positions.push({...a,phase,tick:viewerClock.tick});
    if(phase==='begin')probe.steps.push({...a,tick:viewerClock.tick});return on.call(this,phase,a);
   };
   const sample=()=>{const el=document.querySelector('#player-sprite');if(el?.dataset.animation){const a=JSON.parse(el.dataset.animation);if(a.moving)window.forcedProbe.frames.push({...a,tick:viewerClock.tick});}requestAnimationFrame(sample);};requestAnimationFrame(sample);
  });
 });
 const idle=()=>p.waitForFunction(()=>window.forcedProbe?.positions.length&&!document.body.hasAttribute('aria-busy')&&!JSON.parse(document.querySelector('#player-sprite').dataset.animation).moving);
 const cases=[
  {map:'MAP_POKEMON_LEAGUE_HALL_OF_FAME',x:5,y:11,key:'ArrowUp',direction:'north',action:'ice',duration:8,path:Array.from({length:9},(_,i)=>[5,10-i]),stop:'collision'},
  {map:'MAP_ROCKET_HIDEOUT_B2F',x:13,y:5,key:'ArrowLeft',direction:'west',action:'spin',duration:8,path:[[12,5],[12,6],[12,7],[13,7]],stop:'spin-stop'},
  {map:'MAP_SEAFOAM_ISLANDS_B4F',x:9,y:13,key:'ArrowDown',direction:'south',action:'current',duration:6,path:[[9,14],[10,14],[11,14],[12,14],[12,13]],stop:'plain-water'},
 ];
 const results=[];
 for(const c of cases){
  await p.goto('about:blank');await p.goto(new URL(`viewer.html#modo=explore&mapa=${c.map}&px=${c.x}&py=${c.y}`,process.env.PW_BASE).href);await idle();
  if(await p.locator('#player-char').inputValue()!==character){await p.getByRole('button',{name:'Menú · Esc'}).click();await p.locator('#explore-character').selectOption(character);await p.keyboard.press('Escape');await idle();}
  await p.waitForTimeout(150);
  if(await p.evaluate(()=>window.forcedProbe.positions.length)!==1)throw Error('Spawn bypassed CONTROLLABLE gate '+c.map);
  if(await p.locator('#player-sprite').evaluate((e,d)=>JSON.parse(e.dataset.animation).direction!==d,c.direction)){await p.keyboard.press(c.key);await idle();}
  await p.keyboard.down(c.key);await p.waitForTimeout(25);await p.keyboard.up(c.key);
  await p.waitForFunction(n=>window.forcedProbe.positions.filter(a=>a.phase==='finish').length>=n,c.path.length);await idle();
  await p.waitForTimeout(200);
  const result=await p.evaluate(()=>({steps:window.forcedProbe.steps,positions:window.forcedProbe.positions,frames:window.forcedProbe.frames,
    final:JSON.parse(document.querySelector('#player-sprite').dataset.animation)}));
  const landed=result.positions.filter(a=>a.phase==='finish');
  if(JSON.stringify(landed.map(a=>[a.x,a.y]))!==JSON.stringify(c.path))throw Error('Source route differs '+JSON.stringify({c,landed}));
  for(let i=1;i<result.steps.length;i++){
   const start=result.steps[i],end=landed[i];if(end.tick-start.tick!==c.duration)throw Error('Forced source cadence differs '+JSON.stringify({c,start,end}));
   const frames=result.frames.filter(f=>f.tick>start.tick&&f.tick<end.tick);
   if(!frames.length||frames.some(f=>f.action!==c.action))throw Error('Source animation action missing '+JSON.stringify({c,frames}));
   if(c.action==='ice'&&new Set(frames.map(f=>`${f.image}/${f.command}/${f.delay}`)).size!==1)throw Error('Ice animation was not frozen');
  }
  if(result.final.moving)throw Error('Forced movement did not stop');
  if(c.stop==='spin-stop'){
   const stop=await p.evaluate(()=>window.forcedProbe.grid.behaviorAt(13,7));if(stop!==88)throw Error('Fixture is not source STOP_SPINNING');
   // Leave the stop tile with ordinary input: source forced flag must have been released.
   await p.keyboard.press('ArrowUp');await idle();await p.keyboard.down('ArrowUp');await p.waitForTimeout(25);await p.keyboard.up('ArrowUp');
   await p.waitForFunction(()=>window.forcedProbe.positions.at(-1).x===13&&window.forcedProbe.positions.at(-1).y===6);await idle();
  }
  await ctx.shot(`forced-${c.action}-${character}`);
  results.push({map:c.map,path:landed.map(a=>[a.x,a.y]),ticks:result.steps.map((a,i)=>landed[i].tick-a.tick),frames:result.frames.length,final:result.final,stop:c.stop});
 }
 return{character,results,note:'PREPARED initial positions; no terrain/game state edits. Real keyboard released after entry. Source-map routes, forced cadence, persistent spin, ice freeze and restored control checked. Native C dispatch comparison is separate; no global ROM parity claim.'};
}
