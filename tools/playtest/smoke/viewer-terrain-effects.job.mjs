// PREPARED entry URLs choose actual source terrain; no grid/actor/effect injection.
export default async function run(ctx){
 const p=ctx.page,character=process.env.PW_CHARACTER??'red';await p.setViewportSize({width:1280,height:720});
 await p.addInitScript(()=>{
  if(!/^https?:$/.test(location.protocol))return;
  window.terrainFx={positions:[],events:[],presented:[]};
  void import('/src/viewer/fieldEffects.ts').then(({ViewerFieldEffects})=>{
   const on=ViewerFieldEffects.prototype.onGroundStep;
   ViewerFieldEffects.prototype.onGroundStep=function(phase,a){const probe=window.terrainFx;probe.grid=this.grid;
    if(!probe.effects){probe.effects=this;this.subscribe(e=>{
     if(e.type==='spawn')probe.events.push({name:e.template.name,phase:e.phase,position:e.position,priority:e.priority,generation:e.generation});
     else if(e.type==='release'||e.type==='clear')probe.events.push({type:e.type});
    });}
    if(phase==='spawn'||phase==='finish')probe.positions.push({...a,phase});return on.call(this,phase,a);
   };
  });
  new MutationObserver(records=>{for(const r of records)for(const node of r.addedNodes)if(node instanceof HTMLElement&&node.dataset.effectName)window.terrainFx.presented.push(node.dataset.effectName);}).observe(document,{subtree:true,childList:true});
 });
 const idle=()=>p.waitForFunction(()=>window.terrainFx?.positions.length&&!document.body.hasAttribute('aria-busy')
  &&document.querySelector('#content').getAttribute('aria-busy')!=='true'&&!JSON.parse(document.querySelector('#player-sprite').dataset.animation).moving);
 const enter=async(map,point)=>{
  await p.goto('about:blank');await p.goto(new URL(`viewer.html#modo=explore&mapa=${map}${point?`&px=${point.x}&py=${point.y}`:''}`,process.env.PW_BASE).href);await idle();
  if(await p.locator('#player-char').inputValue()!==character){await p.getByRole('button',{name:'Menú · Esc'}).click();await p.locator('#explore-character').selectOption(character);await p.keyboard.press('Escape');await idle();}
 };
 const face=async key=>{await idle();const dir={ArrowDown:'south',ArrowUp:'north',ArrowLeft:'west',ArrowRight:'east'}[key];
  if(await p.locator('#player-sprite').evaluate((el,d)=>JSON.parse(el.dataset.animation).direction!==d,dir)){await p.keyboard.press(key);await idle();}
 };
 const step=async at=>{await face(at.key);await p.keyboard.down(at.key);await p.waitForTimeout(25);await p.keyboard.up(at.key);
  await p.waitForFunction(({nx,ny})=>{const a=window.terrainFx.positions.at(-1);return a.x===nx&&a.y===ny;},at,{timeout:3000});await idle();};
 const cases=[{name:'grass',map:'MAP_ROUTE1',effect:'TallGrass'},
  {name:'sand',map:'MAP_ROUTE19',effect:'SandFootprints'},
  {name:'bike',map:'MAP_ROUTE19',effect:'BikeTireTracks'},
  {name:'flowing',map:'MAP_ROUTE20',effect:'Splash'},
  {name:'springs',map:'MAP_ONE_ISLAND_KINDLE_ROAD_EMBER_SPA',effect:'HotSpringsWater'},
  {name:'water',map:'MAP_CELADON_CITY',effect:'Ripple'}];
 const results=[];
 for(const test of cases){
  await enter(test.map);
  const fixture=await p.evaluate(async test=>{
   const {planStep}=await import('/src/viewer/movement.ts'),MB=await import('/src/games/firered/generated/metatileBehavior.ts');
   const g=window.terrainFx.grid,{Rom}=await import('/src/core/rom.ts');
   const rom=new Rom(),header=await rom.loadMap(test.map),layout=await rom.loadLayout(header.layout);
   const index=await(await fetch('/viewer/kanto.json')).json(),origin=index.maps[test.map]??{x:0,y:0};
   const pred={grass:MB.MetatileBehavior_IsTallGrass,sand:MB.MetatileBehavior_IsSand,bike:MB.MetatileBehavior_IsSand,
    flowing:MB.MetatileBehavior_IsShallowFlowingWater,springs:MB.MetatileBehavior_IsHotSprings,puddle:MB.MetatileBehavior_IsPuddle,water:MB.MetatileBehavior_HasRipples}[test.name];
   for(let y=origin.y;y<origin.y+layout.height;y++)for(let x=origin.x;x<origin.x+layout.width;x++){
    if(!g.isLoaded(x,y)||!pred(g.behaviorAt(x,y)))continue;
    const vehicle=test.name==='water'?'surf':test.name==='bike'?'bike':'walk';
    if(!g.isWalkable(x,y,vehicle))continue;
    for(const [key,dir]of [['ArrowRight','east'],['ArrowDown','south'],['ArrowLeft','west'],['ArrowUp','north']]){
     const plan=planStep(g,x,y,dir,vehicle,g.elevationAt(x,y));
     if(plan.status==='ready'&&plan.vehicle===vehicle&&!plan.jump&&pred(g.behaviorAt(plan.x,plan.y)))return{x,y,nx:plan.x,ny:plan.y,key,vehicle,behavior:g.behaviorAt(x,y),elevation:g.elevationAt(x,y)};
    }
   }throw Error('No traversable actual terrain pair '+test.name);
  },test);
  await enter(test.map,fixture);await face(fixture.key);
  if(test.name==='bike'){await p.keyboard.press('b');await idle();}
  const before=await p.evaluate(()=>({events:window.terrainFx.events.length,presented:window.terrainFx.presented.length}));
  await step(fixture);
  const observed=await p.evaluate(before=>({at:window.terrainFx.positions.at(-1),events:window.terrainFx.events.slice(before.events),presented:window.terrainFx.presented.slice(before.presented),live:[...document.querySelectorAll('[data-effect-name]')].map(e=>e.dataset.effectName)}),before);
  if(['flowing','springs'].includes(test.name)? !observed.live.includes(test.effect):(!observed.events.some(e=>e.name===test.effect)||!observed.presented.includes(test.effect)))throw Error('Actual terrain did not render '+JSON.stringify({test,fixture,observed}));
  if(observed.at.vehicle!==fixture.vehicle)throw Error('Wrong native vehicle '+JSON.stringify(observed));
  await ctx.shot(`${test.name}-${character}`);
  // Menu pause freezes the shared source timeline and the live effect frame.
  await p.getByRole('button',{name:'Menú · Esc'}).click();
  const paused=await p.evaluate(async()=>({tick:(await import('/src/viewer/clock.ts')).viewerClock.tick,
   nodes:[...document.querySelectorAll('[data-effect-name]')].map(e=>[e.dataset.effectName,e.style.cssText])}));
  await p.waitForTimeout(150);
  const frozen=await p.evaluate(async()=>({tick:(await import('/src/viewer/clock.ts')).viewerClock.tick,
   nodes:[...document.querySelectorAll('[data-effect-name]')].map(e=>[e.dataset.effectName,e.style.cssText])}));
  if(JSON.stringify(paused)!==JSON.stringify(frozen))throw Error('Actual effect advanced while menu paused');
  await p.keyboard.press('Escape');
  // Expiring tracks and splashes must retire; flowing water and occupied grass persist by C rules.
  if(['sand','bike','puddle','water'].includes(test.name)){
   await p.waitForFunction(name=>!document.querySelector(`[data-effect-name="${name}"]`),test.effect,{timeout:2500});
  }
  let leave=null;
  if(['flowing','springs'].includes(test.name)){
   const path=await p.evaluate(async name=>{
    const {planStep}=await import('/src/viewer/movement.ts'),MB=await import('/src/games/firered/generated/metatileBehavior.ts'),g=window.terrainFx.grid,start=window.terrainFx.positions.at(-1);
    const q=[{...start,path:[]}],seen=new Set([`${start.x},${start.y}`]);
    for(let n=0;n<q.length;n++){const at=q[n];if(!(name==='springs'?MB.MetatileBehavior_IsHotSprings:MB.MetatileBehavior_IsShallowFlowingWater)(g.behaviorAt(at.x,at.y)))return at.path;
     if(at.path.length>=12)continue;
     for(const [key,dir]of [['ArrowDown','south'],['ArrowUp','north'],['ArrowLeft','west'],['ArrowRight','east']]){
      const next=planStep(g,at.x,at.y,dir,'walk',start.elevation),k=`${next.x},${next.y}`;
      if(next.status!=='ready'||next.vehicle!=='walk'||next.jump||seen.has(k))continue;seen.add(k);q.push({...next,path:[...at.path,{nx:next.x,ny:next.y,key}]});
     }
    }throw Error('No real flowing-water exit');
   },test.name);
   for(const at of path)await step(at);
   if(await p.locator(`[data-effect-name=${test.effect}]`).count())throw Error(`${test.effect} leaked on actual exit`);
   leave={steps:path.length,at:await p.evaluate(()=>window.terrainFx.positions.at(-1))};
  }
  results.push({test,fixture,observed,pause:true,leave});
 }
 return{character,results,note:'PREPARED positions on unmodified exported terrain; real keyboard, production activation, DOM presentation, pause and retirement. Footstep variants/lifetimes have separate source harness; no global ROM parity claim.'};
}
