// PREPARED entry URLs select real terrain; probes only observe production instances.
import movement from './viewer-movement.job.mjs';
export default async function run(ctx){
 const p=ctx.page;
 await p.addInitScript(()=>{
  if(!/^https?:$/.test(location.protocol))return;
  import('/src/viewer/render/depth.ts').then(({AvatarDepth})=>{
   const add=AvatarDepth.prototype.add;
   AvatarDepth.prototype.add=function(...args){window.depthProbe=this;return add.apply(this,args);};
  });
 });
 const motion=await movement(ctx);
 const base=new URL('viewer.html',process.env.PW_BASE).href;
 await p.goto('about:blank');await p.goto(base+'#modo=explore&mapa=MAP_VIRIDIAN_CITY');
 await p.waitForFunction(()=>window.depthProbe?.sectors.size&&window.motionProbe?.grid&&!document.body.hasAttribute('aria-busy'));
 const fixture=await p.evaluate(()=>{
  const g=window.motionProbe.grid;
  for(let y=g.minY;y<g.minY+g.height;y++)for(let x=g.minX;x<g.minX+g.width;x++)
   if(g.isLoaded(x,y)&&g.isGrassTile(x,y)&&g.isWalkable(x,y,'walk'))return{x,y};
  throw Error('Missing actual grass fixture');
 });
 await p.goto('about:blank');await p.goto(base+`#modo=explore&px=${fixture.x}&py=${fixture.y}`);
 await p.waitForFunction(()=>window.depthProbe?.sectors.size&&document.querySelector('.depth-upper')?.dataset.depth&&!document.body.hasAttribute('aria-busy'));
 if(await p.locator('#player-char').inputValue()!==motion.character){await p.getByRole('button',{name:'Menú · Esc'}).click();await p.locator('#explore-character').selectOption(motion.character);await p.keyboard.press('Escape');}
 const layers=await p.evaluate(async()=>{
  const d=window.depthProbe,g=window.motionProbe.grid,upper=document.querySelector('.depth-upper'),middle=document.querySelector('.depth-middle');
  const {ExtractMetatileAttribute,METATILE_ATTRIBUTE_LAYER_TYPE,NUM_METATILES_IN_PRIMARY}=await import('/src/core/field/fieldmap.ts');
  const rect=JSON.parse(upper.dataset.depth),counts=[0,0,0];let checked=0;
  const blank=new Uint8ClampedArray(1024);
  for(let oy=0;oy<128;oy+=16)for(let ox=0;ox<128;ox+=16){
   const x=(rect.left+ox)/16+g.minX,y=(rect.top+oy)/16+g.minY;
   const s=[...d.sectors.values()].find(s=>x>=s.x&&y>=s.y&&x<s.x+s.width&&y<s.y+s.height);if(!s)continue;
   const mt=s.blocks[(y-s.y)*s.width+x-s.x]&1023;
   const attr=mt<NUM_METATILES_IN_PRIMARY?s.renderer.primary.attributes[mt]:s.renderer.secondary.attributes[mt-NUM_METATILES_IN_PRIMARY];
   const layer=ExtractMetatileAttribute(attr,METATILE_ATTRIBUTE_LAYER_TYPE),tile=s.renderer.metatile(mt);counts[layer]++;
   const expectedUpper=layer===1?blank:tile.top.getContext('2d').getImageData(0,0,16,16).data;
   const expectedMiddle=layer===2?blank:(layer===1?tile.top:tile.bottom).getContext('2d').getImageData(0,0,16,16).data;
   for(const [canvas,expected]of [[upper,expectedUpper],[middle,expectedMiddle]]){
    const actual=canvas.getContext('2d').getImageData(ox,oy,16,16).data;
    if(actual.some((v,i)=>v!==expected[i]))throw Error('BG pixels differ from C layer assignment '+JSON.stringify({x,y,layer}));
   }
   checked++;
  }
  if(!checked||document.querySelector('#player-sprite').style.clipPath!=='none')throw Error('Fixed foot crop remains');
  if(getComputedStyle(upper).zIndex!=='27'||getComputedStyle(middle).zIndex!=='23')throw Error('BG priority order wrong');
  return{checked,counts,bytes:d.bytes,sectors:d.sectors.size};
 });
 await ctx.shot(`grass-${motion.character}`);
 return{character:motion.character,fixture,layers,note:'Real source tiles and keyboard; BG pixel placement checked, not ROM/elevation collision parity.'};
}
