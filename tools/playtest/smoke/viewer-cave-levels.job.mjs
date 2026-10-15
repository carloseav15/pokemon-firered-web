// PREPARED start in Victory Road 1F; the rock stairs at (10,9) join elevation 3 (row 10) with elevation 4 (rows 5-8).
export default async function run(ctx){
 const p=ctx.page,character=process.env.PW_CHARACTER??'red';await p.setViewportSize({width:1280,height:720});
 await p.addInitScript(()=>{
  window.caveProbe={steps:[],grid:null};
  if(!/^https?:$/.test(location.protocol))return;
  import('/src/viewer/fieldEffects.ts').then(({ViewerFieldEffects})=>{
   const on=ViewerFieldEffects.prototype.onGroundStep;
   ViewerFieldEffects.prototype.onGroundStep=function(phase,a){window.caveProbe.grid=this.grid;
    if(phase==='finish'||phase==='spawn')window.caveProbe.steps.push({phase,x:a.x,y:a.y,vehicle:a.vehicle,elevation:a.elevation,priority:a.priority});
    return on.call(this,phase,a);};
  });
 });
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_VICTORY_ROAD_1F&px=10&py=10',process.env.PW_BASE).href);
 await p.waitForFunction(()=>window.caveProbe.steps.length&&!document.body.hasAttribute('aria-busy'));await p.waitForTimeout(1200);
 if(await p.locator('#player-char').inputValue()!==character){await p.getByRole('button',{name:'Menú · Esc'}).click();await p.locator('#explore-character').selectOption(character);await p.keyboard.press('Escape');await p.waitForTimeout(800);}
 const finished=n=>p.waitForFunction(k=>window.caveProbe.steps.filter(s=>s.phase==='finish').length>=k,n,{timeout:8000})
  .catch(async()=>{throw Error('Walk stalled '+JSON.stringify(await p.evaluate(()=>({steps:window.caveProbe.steps.slice(-6),hash:location.hash.slice(0,80)}))));});
 const walk=async(key,n)=>{await p.evaluate(()=>{window.caveProbe.steps=window.caveProbe.steps.filter(s=>s.phase==='spawn');});
  await p.keyboard.press(key);await p.waitForTimeout(300); // turn in place when not already facing
  await p.evaluate(()=>{window.caveProbe.steps=window.caveProbe.steps.filter(s=>s.phase==='spawn');});
  await p.keyboard.down(key);await finished(n);await p.keyboard.up(key);await p.waitForTimeout(500);
  return (await p.evaluate(()=>window.caveProbe.steps.filter(s=>s.phase==='finish'))).slice(0,n);};
 // Expected draw priority comes from the exported C table, not from hand-typed values.
 const table=(await(await fetch(new URL('fr/cdata/event_object_movement.json',process.env.PW_BASE).href)).json()).defs.sElevationToPriority.value;
 const zOf=()=>p.locator('#player-sprite').evaluate(e=>e.style.zIndex);
 const expectZ=elevation=>table[elevation]<=1?'30':'25';
 if(await zOf()!==expectZ(3))throw Error('Initial avatar priority differs '+await zOf());
 const up=(await walk('ArrowUp',3));
 if(JSON.stringify(up.map(s=>[s.x,s.y]))!==JSON.stringify([[10,9],[10,8],[10,7]]))throw Error('Ascent route differs '+JSON.stringify(up));
 const grid=await p.evaluate(()=>({stairs:window.caveProbe.grid.behaviorAt(10,9),low:window.caveProbe.grid.elevationAt(10,10),high:window.caveProbe.grid.elevationAt(10,8)}));
 if(grid.stairs!==42||grid.low!==3||grid.high!==4)throw Error('Fixture is not the source rock stairs '+JSON.stringify(grid));
 if(up[2].elevation!==4)throw Error('Upper level did not take elevation 4 '+JSON.stringify(up));
 if(up.some(s=>s.priority!==table[s.elevation]))throw Error('Step priority differs from sElevationToPriority '+JSON.stringify({up,table}));
 if(await zOf()!==expectZ(4))throw Error('Upper-level avatar is not drawn at the C priority '+await zOf());
 const down=await walk('ArrowDown',4);
 // The held key may have taken one extra step north before release: the descent starts at (10,7).
 if(JSON.stringify(down.map(s=>[s.x,s.y]))!==JSON.stringify([[10,7],[10,8],[10,9],[10,10]]))throw Error('Descent route differs '+JSON.stringify(down));
 if(down.some(s=>s.priority!==table[s.elevation]))throw Error('Descent priority differs from sElevationToPriority '+JSON.stringify(down));
 if(await zOf()!==expectZ(3))throw Error('Lower-level avatar is not drawn at the C priority '+await zOf());
 if(down[1].elevation!==4||down[3].elevation!==3)throw Error('Lower level did not return to elevation 3 '+JSON.stringify(down));
 await ctx.shot(`cave-levels-${character}`);
 return{character,up:up.map(s=>[s.x,s.y,s.elevation]),down:down.map(s=>[s.x,s.y,s.elevation]),grid,
  note:'PREPARED start; real keyboard across source MB_ROCK_STAIRS between elevations 3 and 4, both directions. Avatar draw priority is asserted against sElevationToPriority at both levels; no global ROM parity claim.'};
}
