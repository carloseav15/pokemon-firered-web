// PREPARED entry URLs choose adjacent source tiles. All warps and motion use real keyboard input.
export default async function run(ctx){
 const p=ctx.page,character=process.env.PW_CHARACTER??'red';
 await p.setViewportSize({width:1280,height:720});
 await p.addInitScript(()=>{
  window.teleportProbe={positions:[],frames:[],grids:[]};
  new MutationObserver(records=>{for(const r of records)if(r.target.dataset.warpMotion){
   window.teleportProbe.frames.push({...JSON.parse(r.target.dataset.warpMotion),map:document.querySelector('#content')?.dataset.navigationMap});
  }}).observe(document,{subtree:true,attributes:true,attributeFilter:['data-warp-motion']});
  if(!/^https?:$/.test(location.protocol))return;
  void import('/src/viewer/fieldEffects.ts').then(({ViewerFieldEffects})=>{
   const on=ViewerFieldEffects.prototype.onGroundStep;
   ViewerFieldEffects.prototype.onGroundStep=function(phase,a){const probe=window.teleportProbe;probe.grid=this.grid;
    if(!probe.grids.includes(this.grid))probe.grids.push(this.grid);
    if(phase==='spawn'||phase==='finish')probe.positions.push({...a,phase,map:document.querySelector('#content')?.dataset.navigationMap});
    return on.call(this,phase,a);
   };
  });
 });
 const idle=()=>p.waitForFunction(()=>window.teleportProbe?.positions.length&&!document.body.hasAttribute('aria-busy')&&document.querySelector('#content').getAttribute('aria-busy')!=='true'&&!JSON.parse(document.querySelector('#player-sprite').dataset.animation).moving);
 const enter=async(map,point)=>{await p.goto('about:blank');await p.goto(new URL(`viewer.html#modo=explore&mapa=${map}${point?`&px=${point.x}&py=${point.y}`:''}`,process.env.PW_BASE).href);await idle();
  if(await p.locator('#player-char').inputValue()!==character){await p.getByRole('button',{name:"Menu · Esc"}).click();await p.locator('#explore-character').selectOption(character);await p.keyboard.press('Escape');await idle();}
 };
 const directions={ArrowDown:'south',ArrowUp:'north',ArrowLeft:'west',ArrowRight:'east'};
 const press=async key=>{await idle();if(await p.locator('#player-sprite').evaluate((el,d)=>JSON.parse(el.dataset.animation).direction!==d,directions[key])){await p.keyboard.press(key);await idle();}
  await p.keyboard.down(key);await p.waitForTimeout(25);await p.keyboard.up(key);
 };
 const results=[];
 for(const map of ['MAP_SAFFRON_CITY_GYM','MAP_SILPH_CO_3F']){
  await enter(map);
  const fixture=await p.evaluate(async map=>{
   const {Rom}=await import('/src/core/rom.ts'),{planStep}=await import('/src/viewer/movement.ts'),MB=await import('/src/games/firered/generated/metatileBehavior.ts');
   const data=new Rom(),header=await data.loadMap(map),g=window.teleportProbe.grid,warps=new Set(header.warps.map(w=>`${w.x},${w.y}`));
   for(let i=0;i<header.warps.length;i++){const w=header.warps[i];if(!MB.MetatileBehavior_IsWarpPad(g.behaviorAt(w.x,w.y)))continue;
    const dest=await data.loadMap(w.destMap),arrival=dest.warps[w.destWarpId];if(arrival.destMap!==map||arrival.destWarpId!==i)continue;
    for(const [key,dx,dy,dir]of [['ArrowRight',1,0,'east'],['ArrowDown',0,1,'south'],['ArrowLeft',-1,0,'west'],['ArrowUp',0,-1,'north']]){
     const x=w.x-dx,y=w.y-dy;if(warps.has(`${x},${y}`)||!g.isWalkable(x,y,'walk'))continue;
     const plan=planStep(g,x,y,dir,'walk',g.elevationAt(x,y));
     if(plan.status==='ready'&&!plan.jump&&plan.x===w.x&&plan.y===w.y)return{x,y,key,source:w,arrival,warp:i,direction:dir};
    }
   }throw Error('No actual reciprocal pad fixture '+map);
  },map);
  await enter(map,fixture);
  const flight=(async()=>{await p.waitForFunction(()=>{const value=document.querySelector('#player-sprite')?.dataset.warpMotion;if(!value)return false;const m=JSON.parse(value);return m.phase==='teleport-out'&&m.tick>=8;});await ctx.shot(`teleport-flight-${map}-${character}`);})();
  await press(fixture.key);
  await p.waitForFunction(w=>{const a=window.teleportProbe.positions.at(-1);return a.phase==='spawn'&&a.map===w.destMap;},fixture.source);await idle();
  await flight;
  const arrival=await p.evaluate(()=>({at:window.teleportProbe.positions.at(-1),frames:window.teleportProbe.frames,oldBytes:window.teleportProbe.grids[0].retainedBytes,
   offset:document.querySelector('#player-sprite').dataset.warpMotion,visible:document.querySelector('#player-sprite').style.visibility,priority:document.querySelector('#player-sprite').style.zIndex}));
  if(arrival.at.x!==fixture.arrival.x||arrival.at.y!==fixture.arrival.y||arrival.at.direction!==fixture.direction||arrival.oldBytes!==0||arrival.offset||arrival.visible==='hidden'||arrival.priority!=='25')throw Error('Wrong teleport arrival '+JSON.stringify({fixture,arrival}));
  for(const phase of ['teleport-out','teleport-in']){
   const samples=arrival.frames.filter(f=>f.phase===phase);
   if(!samples.some(f=>f.y<0)||new Set(samples.map(f=>f.direction)).size<4)throw Error('Missing source offset/rotation '+phase);
   if(samples.some(f=>f.priority!==(phase==='teleport-out'?0:1)&&f.tick!==samples.at(-1).tick))throw Error('Teleport priority changed in flight');
  }
  await p.waitForTimeout(350);
  if(await p.evaluate(()=>window.teleportProbe.positions.filter(a=>a.phase==='spawn').length)!==2)throw Error('Arrival pad immediately bounced');
  await ctx.shot(`teleport-${map}-${character}`);
  const exit=await p.evaluate(async()=>{
   const {planStep}=await import('/src/viewer/movement.ts'),MB=await import('/src/games/firered/generated/metatileBehavior.ts'),g=window.teleportProbe.grid,at=window.teleportProbe.positions.at(-1);
   for(const [key,dir,reverse]of [['ArrowRight','east','ArrowLeft'],['ArrowDown','south','ArrowUp'],['ArrowLeft','west','ArrowRight'],['ArrowUp','north','ArrowDown']]){
    const step=planStep(g,at.x,at.y,dir,'walk',at.elevation);if(step.status==='ready'&&!step.jump&&!MB.MetatileBehavior_IsWarpPad(g.behaviorAt(step.x,step.y)))return{key,reverse,x:step.x,y:step.y};
   }throw Error('No walkable pad exit');
  });
  await press(exit.key);await p.waitForFunction(at=>{const a=window.teleportProbe.positions.at(-1);return a.x===at.x&&a.y===at.y;},exit);await idle();
  await press(exit.reverse);await p.waitForFunction(map=>window.teleportProbe.positions.at(-1).phase==='spawn'&&window.teleportProbe.positions.at(-1).map===map,map);await idle();
  const back=await p.evaluate(()=>window.teleportProbe.positions.at(-1));
  if(back.x!==fixture.source.x||back.y!==fixture.source.y)throw Error('Wrong reciprocal return '+JSON.stringify(back));
  results.push({map,fixture,arrival:{...arrival,frames:arrival.frames.length},back});
 }
 return{character,results,note:'PREPARED adjacent entry only; real source pads and keyboard, same-map and inter-floor warps, source rotations/priority, no bounce and reciprocal return. Shared task arithmetic has a separate native-C oracle.'};
}
