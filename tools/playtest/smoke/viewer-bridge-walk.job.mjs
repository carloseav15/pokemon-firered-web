// PREPARED start on the Route 12 bridge south of the Snorlax at local (14,70) (map-local x14,y71; ROUTE12 origin is global 324,-110).
// The walk uses the real keyboard and source terrain only.
const OX=324,OY=-110;
export default async function run(ctx){
 const p=ctx.page,character=process.env.PW_CHARACTER??'red';await p.setViewportSize({width:1280,height:720});
 await p.addInitScript(()=>{
  window.bridgeProbe={steps:[],grid:null};
  if(!/^https?:$/.test(location.protocol))return;
  import('/src/viewer/fieldEffects.ts').then(({ViewerFieldEffects})=>{
   const on=ViewerFieldEffects.prototype.onGroundStep;
   ViewerFieldEffects.prototype.onGroundStep=function(phase,a){window.bridgeProbe.grid=this.grid;
    if(phase==='finish'||phase==='spawn')window.bridgeProbe.steps.push({phase,x:a.x,y:a.y,vehicle:a.vehicle,elevation:a.elevation,priority:a.priority});
    return on.call(this,phase,a);};
  });
 });
 await p.goto(new URL(`viewer.html#modo=explore&mapa=MAP_ROUTE12&px=${OX+14}&py=${OY+71}`,process.env.PW_BASE).href);
 await p.waitForFunction(()=>window.bridgeProbe.steps.length&&!document.body.hasAttribute('aria-busy'));await p.waitForTimeout(1200);
 if(await p.locator('#player-char').inputValue()!==character){await p.getByRole('button',{name:"Menu · Esc"}).click();await p.locator('#explore-character').selectOption(character);await p.keyboard.press('Escape');await p.waitForTimeout(800);}
 const wait=n=>p.waitForFunction(k=>window.bridgeProbe.steps.filter(s=>s.phase==='finish').length>=k,n,{timeout:30000})
  .catch(async e=>{throw Error('Bridge walk stalled '+JSON.stringify(await p.evaluate(()=>({steps:window.bridgeProbe.steps.slice(-5),hash:location.hash.slice(0,90)}))));});
 await p.evaluate(()=>{window.bridgeProbe.steps=window.bridgeProbe.steps.filter(s=>s.phase==='spawn');});
 await p.keyboard.down('ArrowDown');await wait(10);await p.keyboard.up('ArrowDown');await p.waitForTimeout(600);
 const all=await p.evaluate(()=>window.bridgeProbe.steps.filter(s=>s.phase==='finish'));
 const down=all.slice(0,9);
 for(let i=0;i<down.length;i++)if(down[i].y!==OY+72+i||down[i].x!==OX+14)throw Error('Bridge route differs '+JSON.stringify(all.slice(0,12)));
 if(down.some(s=>s.vehicle!=='walk'||s.elevation!==3))throw Error('Bridge walk changed vehicle/elevation '+JSON.stringify(down));
 // Draw priority comes from the exported sElevationToPriority table, as in the cave job.
 const table=(await(await fetch(new URL('fr/cdata/event_object_movement.json',process.env.PW_BASE).href)).json()).defs.sElevationToPriority.value;
 if(down.some(s=>s.priority!==table[s.elevation]))throw Error('Bridge step priority differs from sElevationToPriority '+JSON.stringify({down,table}));
 await p.keyboard.up('ArrowDown');
 // The bridge ends over water: the viewer's automatic Surf adaptation takes over on the first water tile.
 if(all[9]?.y!==OY+81||all[9].vehicle!=='surf')throw Error('Bridge end differs '+JSON.stringify(all.slice(8,11)));
 const ys=down.map(s=>s.y);
 const behaviors=await p.evaluate(({ys,x})=>ys.map(y=>window.bridgeProbe.grid.behaviorAt(x,y)),{ys,x:OX+14});
 const elevations=await p.evaluate(({ys,x})=>ys.map(y=>window.bridgeProbe.grid.elevationAt(x,y)),{ys,x:OX+14});
 await ctx.shot(`bridge-${character}`);
 return{character,down:down.map(s=>[s.x,s.y,s.elevation]),end:[all[9].x,all[9].y,all[9].vehicle],behaviors:[...new Set(behaviors)],elevations:[...new Set(elevations)],
  note:'PREPARED start; real keyboard on source bridge terrain; walk and elevation held until the water end. No global ROM parity claim.'};
}
