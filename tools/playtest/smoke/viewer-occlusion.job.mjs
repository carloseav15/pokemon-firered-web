// PREPARED map entry URLs; source tiles, collision routes and keyboard movement.
// Probes observe live instances. Clock suspension only freezes screenshots after a real step.
export default async function run(ctx) {
  const p=ctx.page, character=process.env.PW_CHARACTER??'red';
  await p.setViewportSize({width:1280,height:720});
  await p.addInitScript(()=>{
    if(!/^https?:$/.test(location.protocol))return;
    window.occlusion={positions:[]};
    void import('/src/viewer/render/depth.ts').then(({AvatarDepth})=>{
      const add=AvatarDepth.prototype.add;
      AvatarDepth.prototype.add=function(...args){window.occlusion.depth=this;return add.apply(this,args);};
    });
    void import('/src/viewer/fieldEffects.ts').then(({ViewerFieldEffects})=>{
      const on=ViewerFieldEffects.prototype.onGroundStep;
      ViewerFieldEffects.prototype.onGroundStep=function(phase,actor){window.occlusion.grid=this.grid;
        if(phase==='spawn'||phase==='finish')window.occlusion.positions.push({...actor,phase});
        return on.call(this,phase,actor);
      };
    });
  });
  const idle=()=>p.waitForFunction(()=>window.occlusion?.positions.length&&window.occlusion.depth?.sectors.size
    &&!document.body.hasAttribute('aria-busy')&&document.querySelector('#content').getAttribute('aria-busy')!=='true'
    &&!JSON.parse(document.querySelector('#player-sprite').dataset.animation).moving);
  const face=async key=>{
    await idle();const dir={ArrowDown:'south',ArrowUp:'north',ArrowLeft:'west',ArrowRight:'east'}[key];
    if(await p.locator('#player-sprite').evaluate((el,d)=>JSON.parse(el.dataset.animation).direction!==d,dir)){
      await p.keyboard.press(key);await idle();
    }
  };
  const walk=async path=>{for(const at of path){await face(at.key);await p.keyboard.down(at.key);await p.waitForTimeout(25);await p.keyboard.up(at.key);
    await p.waitForFunction(({x,y})=>{const a=window.occlusion.positions.at(-1);return a.x===x&&a.y===y;},at,{timeout:2500});await idle();}};
  const inspect=async label=>{
    await idle();await p.evaluate(async()=>{(await import('/src/viewer/clock.ts')).viewerClock.pause('occlusion-inspection');});
    try{
      const box=await p.locator('#player-sprite').boundingBox();
      const png=await p.screenshot({clip:box});
      const result=await p.evaluate(async({base64,box})=>{
        const {ExtractMetatileAttribute,METATILE_ATTRIBUTE_LAYER_TYPE,NUM_METATILES_IN_PRIMARY}=await import('/src/core/field/fieldmap.ts');
        const {cdata}=await import('/src/core/hw/assets.ts');
        const actor=document.querySelector('#player-sprite'),frame=JSON.parse(actor.dataset.animation),probe=window.occlusion;
        const load=async url=>{const img=new Image();img.src=url;await img.decode();return img;};
        const canvas=document.createElement('canvas');canvas.width=frame.width;canvas.height=frame.height;
        const c=canvas.getContext('2d');if(frame.hFlip){c.translate(frame.width,0);c.scale(-1,1);}
        if(frame.vFlip){c.translate(0,frame.height);c.scale(1,-1);}
        c.drawImage(await load(frame.url),frame.index*frame.width,0,frame.width,frame.height,0,0,frame.width,frame.height);
        const avatar=c.getImageData(0,0,frame.width,frame.height).data;
        const screen=await load('data:image/png;base64,'+base64),shot=document.createElement('canvas');shot.width=screen.width;shot.height=screen.height;
        const sc=shot.getContext('2d');sc.drawImage(screen,0,0);const pixels=sc.getImageData(0,0,screen.width,screen.height).data;
        const g=probe.grid,left=parseFloat(actor.style.left)+g.minX*16,top=parseFloat(actor.style.top)+g.minY*16;
        const priority=cdata('event_object_movement','sElevationToPriority')[probe.positions.at(-1).elevation];
        let visible=0,covered=0;const metatiles=new Set();
        for(let y=0;y<frame.height;y++)for(let x=0;x<frame.width;x++){
          const i=(y*frame.width+x)*4;if(!avatar[i+3])continue;
          const gx=Math.floor((left+x)/16),gy=Math.floor((top+y)/16);
          const sector=[...probe.depth.sectors.values()].find(s=>gx>=s.x&&gy>=s.y&&gx<s.x+s.width&&gy<s.y+s.height);if(!sector)continue;
          const mt=sector.blocks[(gy-sector.y)*sector.width+gx-sector.x]&1023;
          const attrs=mt<NUM_METATILES_IN_PRIMARY?sector.renderer.primary.attributes[mt]:sector.renderer.secondary.attributes[mt-NUM_METATILES_IN_PRIMARY];
          const layer=ExtractMetatileAttribute(attrs,METATILE_ATTRIBUTE_LAYER_TYPE);
          const tx=((left+x)%16+16)%16,ty=((top+y)%16+16)%16;
          const fg=sector.renderer.metatile(mt).top.getContext('2d').getImageData(tx,ty,1,1).data;
          const occluded=priority>1&&layer!==1&&fg[3]===255;
          const expected=occluded?fg:avatar.subarray(i,i+4);
          const sx=Math.floor((x+.5)*screen.width/frame.width),sy=Math.floor((y+.5)*screen.height/frame.height),si=(sy*screen.width+sx)*4;
          if([0,1,2].some(k=>pixels[si+k]!==expected[k]))throw Error('Visible pixel differs '+JSON.stringify({x,y,gx,gy,mt,layer,occluded,actual:[...pixels.slice(si,si+3)],expected:[...expected.slice(0,3)],box}));
          if(occluded){covered++;metatiles.add(mt);}else visible++;
        }
        return{at:probe.positions.at(-1),covered,visible,metatiles:[...metatiles],priority};
      },{base64:png.toString('base64'),box});
      await ctx.shot(`${label}-${character}`);return result;
    }finally{await p.evaluate(async()=>{(await import('/src/viewer/clock.ts')).viewerClock.resume('occlusion-inspection');});}
  };
  const cases=[
    {name:'roof',map:'MAP_PALLET_TOWN',x:6,y:3},
    {name:'tree',map:'MAP_PALLET_TOWN',x:2,y:19},
    {name:'furniture',map:'MAP_PALLET_TOWN_PLAYERS_HOUSE_2F',x:2,y:5},
    {name:'interior-wall',map:'MAP_PALLET_TOWN_PLAYERS_HOUSE_1F',x:1,y:6},
    {name:'full-fuchsia',map:'MAP_FUCHSIA_CITY',x:26,y:4,full:true,candidate:true},
    // Proven walking routes: losing any of these routes is a regression, not an untested candidate.
    {name:'full-vermilion',map:'MAP_VERMILION_CITY',x:35,y:22,full:true},
    {name:'full-vermilion-middle',map:'MAP_VERMILION_CITY',x:36,y:22,full:true},
    {name:'full-vermilion-right',map:'MAP_VERMILION_CITY',x:37,y:22,full:true},
    {name:'full-lab',map:'MAP_CINNABAR_ISLAND_POKEMON_LAB_ENTRANCE',x:18,y:1,full:true,candidate:true},
    {name:'full-route10',map:'MAP_ROUTE10',x:18,y:73,full:true,candidate:true},
  ],results=[];
  for(const fixture of cases){
    await p.goto('about:blank');await p.goto(new URL(`viewer.html#modo=explore&mapa=${fixture.map}`,process.env.PW_BASE).href);await idle();
    if(await p.locator('#player-char').inputValue()!==character){await p.getByRole('button',{name:'Menú · Esc'}).click();await p.locator('#explore-character').selectOption(character);await p.keyboard.press('Escape');await idle();}
    const route=await p.evaluate(async goal=>{
      const {Rom}=await import('/src/core/rom.ts'),{planStep}=await import('/src/viewer/movement.ts');
      const header=await new Rom().loadMap(goal.map),g=window.occlusion.grid,start=window.occlusion.positions.at(-1);
      const sector=window.occlusion.depth.sectors.get(goal.map),target={x:sector.x+goal.x,y:sector.y+goal.y};
      const warps=new Set(header.warps.map(w=>`${w.x+sector.x},${w.y+sector.y}`));
      const q=[{...start,path:[]}],seen=new Set([`${start.x},${start.y}`]);
      for(let n=0;n<q.length;n++){const at=q[n];if(at.x===target.x&&at.y===target.y)return{start,path:at.path};
        for(const [key,dir] of [['ArrowDown','south'],['ArrowUp','north'],['ArrowLeft','west'],['ArrowRight','east']]){
          const step=planStep(g,at.x,at.y,dir,'walk',start.elevation),k=`${step.x},${step.y}`;
          if(step.status!=='ready'||step.vehicle!=='walk'||step.jump||seen.has(k)||warps.has(k))continue;
          if(step.x<sector.x||step.y<sector.y||step.x>=sector.x+sector.width||step.y>=sector.y+sector.height)continue;
          seen.add(k);q.push({...step,path:[...at.path,{key,x:step.x,y:step.y}]});
        }
      }if(goal.candidate)return null;
      throw Error('No real collision route '+JSON.stringify(goal));
    },fixture);
    if(!route){results.push({fixture,reachable:false,scope:'No walking-only route from the actual entry; jumps, Surf, alternate entries and scripts not covered.'});continue;}
    await walk(route.path);const behind=await inspect(fixture.name+'-behind');
    if(fixture.full&&behind.visible!==0)throw Error('Source full occluder left visible pixels '+JSON.stringify({fixture,behind}));
    if(!behind.covered)throw Error('Selected source fixture does not occlude '+JSON.stringify({fixture,behind}));
    const collision=await p.evaluate(async()=>{
      const {planStep}=await import('/src/viewer/movement.ts'),g=window.occlusion.grid,at=window.occlusion.positions.at(-1);
      for(const [key,dir] of [['ArrowUp','north'],['ArrowDown','south'],['ArrowLeft','west'],['ArrowRight','east']]){
        const step=planStep(g,at.x,at.y,dir,'walk',at.elevation);
        if(step.status==='blocked'&&g.isLoaded(step.x,step.y))return{key,x:at.x,y:at.y};
      }return null;
    });
    if(collision){await face(collision.key);await p.keyboard.press(collision.key);await p.waitForTimeout(40);await idle();
      if(!await p.evaluate(at=>{const a=window.occlusion.positions.at(-1);return a.x===at.x&&a.y===at.y;},collision))throw Error('Occluder collision crossed');
    }
    const reverse={ArrowDown:'ArrowUp',ArrowUp:'ArrowDown',ArrowLeft:'ArrowRight',ArrowRight:'ArrowLeft'};
    const back=route.path.map((step,i)=>({... (i===0?route.start:route.path[i-1]),key:reverse[step.key]})).reverse();
    await walk(back);const front=await inspect(fixture.name+'-front');
    if(front.covered||!front.visible)throw Error('Avatar failed to return in front '+JSON.stringify(front));
    results.push({fixture,steps:route.path.length,behind,collision,front});
  }
  return{character,results,note:'Full-occlusion candidates are not assumed reachable. PREPARED map entry only; real source BG, keyboard routes and screenshot pixel comparison. No terrain or expected screenshot pixels injected; no ROM comparison.'};
}
