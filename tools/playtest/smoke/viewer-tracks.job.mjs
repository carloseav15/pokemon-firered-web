// PREPARED start cell on real Route 19 sand; real terrain, keyboard steps and bike toggle.
// (Rewritten from the legacy=1 start, which no longer finds a walkable spawn: startExploration throws.)
export default async function run(ctx) {
 const p=ctx.page,character=process.env.PW_CHARACTER??'red';await p.setViewportSize({width:1280,height:720});
 await p.addInitScript(()=>{
  window.trackProbe={grid:null,events:[],spawns:0};
  if(!/^https?:$/.test(location.protocol))return;
  import('/src/viewer/fieldEffects.ts').then(({ViewerFieldEffects})=>{
   const on=ViewerFieldEffects.prototype.onGroundStep;
   ViewerFieldEffects.prototype.onGroundStep=function(phase,a){const probe=window.trackProbe;probe.grid=this.grid;
    if(!this.trackObserved){this.trackObserved=true;this.subscribe(e=>{if(e.type==='spawn')probe.events.push({id:e.id,name:e.template.name,animation:e.animation,position:e.position,phase:e.phase});});}
    if(phase==='spawn')probe.spawns++;return on.call(this,phase,a);};
  });
 });
 const base=new URL('viewer.html',process.env.PW_BASE).href;
 const kanto=JSON.parse((await import('node:fs')).readFileSync('public/viewer/kanto.json','utf8')).maps.MAP_ROUTE19;
 await p.goto(base+'#modo=explore&mapa=MAP_ROUTE19');
 await p.waitForFunction(()=>window.trackProbe?.spawns&&window.trackProbe.grid&&!document.body.hasAttribute('aria-busy'),null,{timeout:30000});
 const start=await p.evaluate(async({ox,oy,w,h})=>{
  const C=await import('/src/games/firered/generated/metatileBehavior.ts'),g=window.trackProbe.grid;
  for(let y=oy;y<oy+h;y++)for(let x=ox;x<ox+w;x++)
   if(g.isLoaded(x,y)&&g.isLoaded(x+1,y)&&C.MetatileBehavior_IsSand(g.behaviorAt(x,y))&&g.isWalkable(x,y,'walk')&&g.isWalkable(x+1,y,'walk')&&g.isWalkable(x,y,'bike')&&g.isWalkable(x+1,y,'bike'))return{x,y};
  throw Error('No real sand pair');
 },{ox:kanto.x,oy:kanto.y,w:kanto.width,h:kanto.height});
 await p.goto('about:blank');await p.goto(base+`#modo=explore&mapa=MAP_ROUTE19&px=${start.x}&py=${start.y}`);
 await p.waitForFunction(()=>window.trackProbe?.spawns&&!document.body.hasAttribute('aria-busy'),null,{timeout:30000});
 if(await p.locator('#player-char').inputValue()!==character){await p.getByRole('button',{name:'Menú · Esc'}).click();await p.locator('#explore-character').selectOption(character);await p.keyboard.press('Escape');}
 await p.waitForTimeout(900);
 const step=async key=>{await p.keyboard.down(key);await p.waitForTimeout(25);await p.keyboard.up(key);await p.waitForTimeout(450);};
 await p.keyboard.press('ArrowRight');await p.waitForTimeout(350); // turn in place east
 await p.evaluate(()=>{window.trackProbe.events=[];});
 await step('ArrowRight');
 let events=await p.evaluate(()=>window.trackProbe.events);
 const foot=events.find(e=>e.name==='SandFootprints');
 if(!foot||foot.animation!==4||foot.position.tileX!==start.x||foot.position.tileY!==start.y||foot.phase!=='begin')throw Error('Real foot '+JSON.stringify(events));
 const node=p.locator(`[data-effect-id="${foot.id}"]`);if(await node.count()!==1)throw Error('Real footprint invisible');
 await p.keyboard.press('ArrowLeft');await p.waitForTimeout(350);await step('ArrowLeft');
 await p.keyboard.press('b');await p.waitForTimeout(400);
 await p.evaluate(()=>{window.trackProbe.events=[];});
 await step('ArrowRight');
 events=await p.evaluate(()=>window.trackProbe.events);
 const bike=events.find(e=>e.name==='BikeTireTracks');
 // Previous west -> current east = source transition 4, horizontal frame.
 if(!bike||bike.animation!==4||bike.position.tileX!==start.x||bike.position.tileY!==start.y)throw Error('Real bike '+JSON.stringify(events));
 if(ctx.errors().length)throw Error(ctx.errors().join(';'));
 return {character,fixture:'PREPARED start only; real terrain/key steps/bike toggle',start,foot,bike};
}
