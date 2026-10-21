// PREPARED start beside the Pokémon Center escalator; the escalator tile is entered with the real keyboard.
export default async function run(ctx){
 const p=ctx.page,character=process.env.PW_CHARACTER??'red';await p.setViewportSize({width:1280,height:720});
 await p.addInitScript(()=>{
  window.escProbe={frames:[],grid:null};
  if(!/^https?:$/.test(location.protocol))return;
  import('/src/viewer/fieldEffects.ts').then(({ViewerFieldEffects})=>{
   const on=ViewerFieldEffects.prototype.onGroundStep;
   ViewerFieldEffects.prototype.onGroundStep=function(phase,a){window.escProbe.grid=this.grid;return on.call(this,phase,a);};
  });
  const sample=()=>{const el=document.querySelector('#player-sprite'),g=window.escProbe.grid;
   if(el?.dataset.warpMotion){const m=JSON.parse(el.dataset.warpMotion);
    const m3=[];if(g&&m.phase)for(let y=5;y<=7;y++)for(let x=0;x<=2;x++)m3.push(g.getMetatile(x+(window.escProbe.ox??0),y+(window.escProbe.oy??0)));
    window.escProbe.frames.push({...m,tiles:m3.join(',')});}
   requestAnimationFrame(sample);};requestAnimationFrame(sample);
 });
 const mapOf=async()=>p.evaluate(()=>new URLSearchParams(location.hash.slice(1)).get('mapa'));
 const posOf=async()=>p.evaluate(()=>{const q=new URLSearchParams(location.hash.slice(1));return [Number(q.get('px')),Number(q.get('py'))];});
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_VIRIDIAN_CITY_POKEMON_CENTER_1F&px=2&py=6',process.env.PW_BASE).href);
 await p.waitForFunction(()=>!document.body.hasAttribute('aria-busy')&&document.querySelector('#player-sprite'));await p.waitForTimeout(1500);
 if(await p.locator('#player-char').inputValue()!==character){await p.getByRole('button',{name:"Menu · Esc"}).click();await p.locator('#explore-character').selectOption(character);await p.keyboard.press('Escape');await p.waitForTimeout(800);}
 const results=[];
 for(const leg of [{from:'MAP_VIRIDIAN_CITY_POKEMON_CENTER_1F',to:'MAP_VIRIDIAN_CITY_POKEMON_CENTER_2F',out:'escalator-out'},
                   {from:'MAP_VIRIDIAN_CITY_POKEMON_CENTER_2F',to:'MAP_VIRIDIAN_CITY_POKEMON_CENTER_1F',out:'escalator-out'}]){
  if(await mapOf()!==leg.from)throw Error('Wrong start map '+await mapOf());
  const [px,py]=await posOf();
  await p.evaluate(([x,y])=>{window.escProbe.frames=[];window.escProbe.ox=x-1;window.escProbe.oy=y-6;},[px,py]);
  await p.keyboard.press('ArrowLeft');await p.waitForTimeout(300);
  await p.keyboard.down('ArrowLeft');await p.waitForTimeout(25);await p.keyboard.up('ArrowLeft');
  try{await p.waitForFunction(m=>new URLSearchParams(location.hash.slice(1)).get("mapa")===m,leg.to,{timeout:20000});}catch(e){throw Error("No map change "+JSON.stringify({leg,hash:await p.evaluate(()=>location.hash),px,py,n:await p.evaluate(()=>window.escProbe.frames.length),text:(await p.evaluate(()=>document.body.innerText)).slice(0,400),anim:await p.evaluate(()=>document.querySelector("#player-sprite")?.dataset.animation?.slice(0,200))}));}
  await p.waitForFunction(()=>window.escProbe.frames.some(f=>f.phase==='escalator-in'));
  await p.waitForFunction(()=>!document.querySelector('#player-sprite').dataset.warpMotion&&!JSON.parse(document.querySelector('#player-sprite').dataset.animation).moving,{timeout:20000});
  await p.waitForTimeout(300);
  const frames=await p.evaluate(()=>window.escProbe.frames);
  const out=frames.filter(f=>f.phase==='escalator-out'),inn=frames.filter(f=>f.phase==='escalator-in');
  if(out.length<20||inn.length<20)throw Error('Escalator animation too short '+JSON.stringify({out:out.length,in:inn.length}));
  const stages=[...new Set(out.map(f=>f.stage))];
  if(!stages.includes(1))throw Error('Missing source start state '+JSON.stringify(stages));
  if(!out.some(f=>f.x!==0||f.y!==0))throw Error('Player was not displaced along the escalator');
  if(inn.at(-1).x!==0||inn.at(-1).y!==0)throw Error('Sprite offset was not cleared');
  if(new Set(out.map(f=>f.tiles)).size<2&&new Set(inn.map(f=>f.tiles)).size<2)throw Error('Escalator tiles did not animate');
  results.push({leg:`${leg.from}->${leg.to}`,out:out.length,in:inn.length,stages,tileStates:new Set(frames.map(f=>f.tiles)).size,end:await posOf()});
 }
 await ctx.shot(`escalator-${character}`);
 return{character,results,note:'PREPARED start adjacent to the escalator; real keyboard entry. Source-task native comparison is check:escalator-warp; no global ROM parity claim.'};
}
