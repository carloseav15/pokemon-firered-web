// PREPARED start inside each Saffron gate house; real keyboard through the gate warp into Saffron City
// (loaded as a context map, outside the continental atlas), then one step off the arrival tile.
export default async function run(ctx){
 const p=ctx.page,character=process.env.PW_CHARACTER??'red';await p.setViewportSize({width:1280,height:720});
 await p.addInitScript(()=>{window.gateProbe={positions:[]};
  if(!/^https?:$/.test(location.protocol))return;
  import('/src/viewer/fieldEffects.ts').then(({ViewerFieldEffects})=>{
   const on=ViewerFieldEffects.prototype.onGroundStep;
   ViewerFieldEffects.prototype.onGroundStep=function(phase,a){if(phase==='spawn'||phase==='finish')window.gateProbe.positions.push({...a,phase,map:document.querySelector('#content')?.dataset.navigationMap});return on.call(this,phase,a);};
  });});
 // Arrival at (34,5) is MB_CAVE_DOOR: Task_ExitNonAnimDoor walks one tile out, hence (34,6).
 // [gate map, warp index into Saffron, direction key to cross the gate warp, start tile offset from the warp]
 const gates=[
  {map:'MAP_ROUTE5_SOUTH_ENTRANCE',warp:2,key:'ArrowDown',from:[0,-1],arrive:[34,6]},
  {map:'MAP_ROUTE6_NORTH_ENTRANCE',warp:0,key:'ArrowUp',from:[0,1],arrive:[34,46]},
  {map:'MAP_ROUTE7_EAST_ENTRANCE',warp:2,key:'ArrowRight',from:[-1,0],arrive:[8,27]},
  {map:'MAP_ROUTE8_WEST_ENTRANCE',warp:1,key:'ArrowLeft',from:[1,0],arrive:[58,27]},
 ];
 const {readFileSync}=await import('node:fs');
 const results=[];
 const saffron=JSON.parse(readFileSync('public/fr/maps/MAP_SAFFRON_CITY.json','utf8'));
 if(saffron.connections.length)throw Error('The native Saffron header must have NULL connections');
 for(const g of gates){
  const header=JSON.parse(readFileSync(`public/fr/maps/${g.map}.json`,'utf8')),w=header.warps[g.warp];
  await p.goto('about:blank');
  await p.goto(new URL(`viewer.html#modo=explore&mapa=${g.map}&px=${w.x+g.from[0]}&py=${w.y+g.from[1]}`,process.env.PW_BASE).href);
  await p.waitForFunction(()=>window.gateProbe?.positions.length&&!document.body.hasAttribute('aria-busy'));await p.waitForTimeout(1200);
  if(await p.locator('#player-char').inputValue()!==character){await p.getByRole('button',{name:"Menu · Esc"}).click();await p.locator('#explore-character').selectOption(character);await p.keyboard.press('Escape');await p.waitForTimeout(800);}
  await p.keyboard.press(g.key);await p.waitForTimeout(300);
  await p.keyboard.down(g.key);await p.waitForTimeout(25);await p.keyboard.up(g.key);
  // Arrow warps fire on the next input while standing on the warp tile; step-triggered warps already left.
  await p.waitForTimeout(700);
  if(await p.evaluate(()=>new URLSearchParams(location.hash.slice(1)).get('mapa')!=='MAP_SAFFRON_CITY')){
   await p.keyboard.down(g.key);await p.waitForTimeout(25);await p.keyboard.up(g.key);
  }
  await p.waitForFunction(()=>new URLSearchParams(location.hash.slice(1)).get('mapa')==='MAP_SAFFRON_CITY',null,{timeout:20000})
   .catch(async()=>{throw Error('Gate did not reach Saffron '+JSON.stringify({g,hash:await p.evaluate(()=>location.hash.slice(0,100)),positions:await p.evaluate(()=>window.gateProbe.positions.slice(-3)),text:await p.evaluate(()=>document.body.innerText.slice(0,200))}));});
  await p.waitForFunction(()=>document.querySelector('#content')?.getAttribute('aria-busy')!=='true',null,{timeout:20000});await p.waitForTimeout(800);
  const at=await p.evaluate(()=>{const q=new URLSearchParams(location.hash.slice(1));return [Number(q.get('px')),Number(q.get('py'))];});
  const maps=await p.evaluate(()=>[...document.querySelectorAll('.map')].map(e=>e.dataset.map));
  if(at[0]!==g.arrive[0]||at[1]!==g.arrive[1])throw Error('Saffron arrival differs '+JSON.stringify({g,at}));
  if(maps.length!==1||maps[0]!=='MAP_SAFFRON_CITY')throw Error('Saffron context maps '+JSON.stringify(maps));
  const opposite={ArrowDown:'ArrowUp',ArrowUp:'ArrowDown',ArrowRight:'ArrowLeft',ArrowLeft:'ArrowRight'}[g.key];
  for(let i=0;i<3;i++){
   if(await p.evaluate(()=>document.querySelector('#content')?.dataset.navigationMap!=='MAP_SAFFRON_CITY'))break;
   await p.keyboard.down(opposite);await p.waitForTimeout(25);await p.keyboard.up(opposite);await p.waitForTimeout(700);
  }
  await p.waitForFunction(m=>new URLSearchParams(location.hash.slice(1)).get('mapa')===m,g.map,{timeout:20000});
  await p.waitForFunction(()=>document.querySelector('#content')?.getAttribute('aria-busy')!=='true');
  const route=g.map.match(/^MAP_ROUTE(\d+)/)[1],destination=`MAP_ROUTE${route}`;
  await p.keyboard.down(opposite);
  try{await p.waitForFunction(m=>document.querySelector('#content')?.dataset.navigationMap===m,destination,{timeout:20000});}
  finally{await p.keyboard.up(opposite);}
  await p.waitForFunction(()=>document.querySelector('#content')?.getAttribute('aria-busy')!=='true');
  const arrival=await p.evaluate(()=>{const q=new URLSearchParams(location.hash.slice(1));return [Number(q.get('px')),Number(q.get('py'))];});
  results.push({gate:g.map,arrived:at,returnedThroughGate:true,route:destination,routeArrival:arrival});
 }
 await ctx.shot(`saffron-gates-${character}`);
 return{character,results,note:'PREPARED gate-house starts; real keyboard into Saffron, back through each gate and onto Routes 5/6/7/8. Saffron has NULL connections in the native mapjson header; its source-sized map remains a separate navigation context. No global ROM parity claim.'};
}
