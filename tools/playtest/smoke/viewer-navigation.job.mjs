// Real movement over exported Kanto data. PREPARED entry URL selects Pallet Town;
// probes only observe grids/effects, never alter terrain, positions or flags.
export default async function run(ctx) {
  const p = ctx.page;
  await p.setViewportSize({ width: 1280, height: 720 });
  await p.addInitScript(() => {
    window.navProbe = { finished: [], disposed: [], tasks: [], effects: [] };
    new PerformanceObserver(list => window.navProbe.tasks.push(...list.getEntries().map(e => e.duration))).observe({ type: 'longtask', buffered: true });
    new MutationObserver(records => {
      for (const r of records) for (const node of r.removedNodes) if (node instanceof HTMLElement && node.matches('.map')) window.navProbe.disposed.push(node.dataset.map);
    }).observe(document, { childList:true, subtree:true });
    void import('/src/viewer/fieldEffects.ts').then(({ ViewerFieldEffects }) => {
      const on = ViewerFieldEffects.prototype.onGroundStep;
      ViewerFieldEffects.prototype.onGroundStep = function(phase, actor) {
        window.navProbe.grid = this.grid;
        if (!this.navigationObserver) {
          this.navigationObserver = true;
          this.subscribe(event => { if (event.type==='spawn') window.navProbe.effects.push(event.template.name); });
        }
        if (phase === 'finish' || phase === 'spawn') window.navProbe.finished.push({ ...actor, phase });
        return on.call(this, phase, actor);
      };
    });
  });
  await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_PALLET_TOWN', process.env.PW_BASE).href);
  await p.waitForFunction(() => document.body.classList.contains('exploring') && window.navProbe?.finished.length);
  await p.waitForFunction(() => document.querySelector('#explore-performance')?.dataset.sample);
  const initial = await p.evaluate(() => ({ sample: JSON.parse(document.querySelector('#explore-performance').dataset.sample),
    maps: [...document.querySelectorAll('.map')].map(e => e.dataset.map),
    fill: document.querySelectorAll('.fill').length, gridBytes: window.navProbe.grid.retainedBytes,
    canvasBytes: [...document.querySelectorAll('.map canvas')].reduce((sum, c) => sum + c.width * c.height * 4, 0),
    hidden: ['bar','panel','statusbar'].every(id => getComputedStyle(document.getElementById(id)).display === 'none'),
    layouts: performance.getEntriesByType('resource').filter(e => e.name.includes('/fr/layouts/')).length }));
  if (!initial.hidden || initial.fill || initial.maps.length >= 37 || initial.layouts >= 37) throw Error('global load retained: '+JSON.stringify(initial));
  const borderSource = await p.evaluate(async () => {
    const { Rom } = await import('/src/core/rom.ts');
    const { TileRenderer } = await import('/src/core/field/tileRenderer.ts');
    const data=new Rom(), layout=await data.loadLayout('LAYOUT_PALLET_TOWN');
    const renderer=new TileRenderer(await data.loadTileset(layout.primary),await data.loadTileset(layout.secondary));
    const source=await (await fetch('/viewer/kanto.json')).json();
    const minX=Math.min(...Object.values(source.maps).map(m=>m.x)),minY=Math.min(...Object.values(source.maps).map(m=>m.y));
    const gx=-1,gy=10; // Observed border outside Pallet, not a fabricated walkable tile.
    const bx=((gx%layout.borderWidth)+layout.borderWidth)%layout.borderWidth,by=gy%layout.borderHeight;
    const {bottom,top}=renderer.metatile(layout.border[by*layout.borderWidth+bx]&0x3ff);
    const expected=document.createElement('canvas');expected.width=16;expected.height=16;
    const ctx=expected.getContext('2d');ctx.drawImage(bottom,0,0);ctx.drawImage(top,0,0);
    const border=document.querySelector('.sector-border');
    const x=(gx-minX)*16-parseFloat(border.style.left),y=(gy-minY)*16-parseFloat(border.style.top);
    const a=ctx.getImageData(0,0,16,16).data,b=border.getContext('2d').getImageData(x,y,16,16).data;
    if(!a.every((v,i)=>v===b[i]))throw Error('Camera border differs from source metatile');
    return {gx,gy,bx,by,pixels:256};
  });
  const blocked=await p.evaluate(()=>{
    const probe=window.navProbe,start=probe.finished.at(-1),g=probe.grid;
    for(const [key,dx,dy] of [['ArrowRight',1,0],['ArrowLeft',-1,0],['ArrowUp',0,-1],['ArrowDown',0,1]]) {
      const x=start.x+dx,y=start.y+dy;
      if(g.isLoaded(x,y)&&!g.isWaterTile(x,y)&&!g.isWalkable(x,y,'walk')&&!g.ledgeDirection(start.x,start.y))return {key,x:start.x,y:start.y,left:document.querySelector('#player-sprite').style.left,top:document.querySelector('#player-sprite').style.top};
    }
    throw Error('No adjacent collision at observed spawn');
  });
  await p.keyboard.press(blocked.key);await p.waitForTimeout(200);
  if(!await p.evaluate(at=>{const now=window.navProbe.finished.at(-1),el=document.querySelector('#player-sprite');return now.x===at.x&&now.y===at.y&&el.style.left===at.left&&el.style.top===at.top;},blocked))throw Error('Blocked tile moved avatar');
  await p.getByRole('button', { name: 'Menú · Esc' }).click();
  const paused = await p.evaluate(async () => (await import('/src/viewer/clock.ts')).viewerClock.tick);
  await p.waitForTimeout(180);
  if (await p.evaluate(async () => (await import('/src/viewer/clock.ts')).viewerClock.tick) !== paused) throw Error('menu did not pause');
  await p.locator('#explore-format').selectOption('wide');
  const ratio = await p.locator('#main').evaluate(e => e.clientWidth / e.clientHeight);
  if (Math.abs(ratio - 16/9) > .01) throw Error('16:9 distorted');
  await p.locator('#explore-metrics').check();
  await ctx.shot('kanto-menu');
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => !document.querySelector('#explore-menu').open);
  await p.waitForTimeout(100);
  if (await p.evaluate(async () => (await import('/src/viewer/clock.ts')).viewerClock.tick) <= paused) throw Error('resume frozen');
  // BFS selects a real walkable route to Route 1 using only resident collision data.
  const path = await p.evaluate(async () => {
    const index = await (await fetch('/viewer/kanto.json')).json();
    const probe = window.navProbe, start = probe.finished.at(-1), grid = probe.grid;
    const dest = index.maps.MAP_ROUTE1;
    const q = [{ x:start.x, y:start.y, path:[] }], seen = new Set([`${start.x},${start.y}`]);
    const doors = new Set(index.elements.filter(e => e.layer==='puerta').map(e => `${index.maps[e.map].x+e.x},${index.maps[e.map].y+e.y}`));
    for (let n=0; n<q.length; n++) {
      const at=q[n];
      if (at.x>=dest.x && at.x<dest.x+dest.width && at.y>=dest.y && at.y<dest.y+5) return at.path;
      for(const [key,dx,dy] of [['ArrowUp',0,-1],['ArrowDown',0,1],['ArrowLeft',-1,0],['ArrowRight',1,0]]) {
        const x=at.x+dx,y=at.y+dy,k=`${x},${y}`;
        if(seen.has(k)||doors.has(k)||!grid.isWalkable(x,y,'walk')||grid.ledgeDirection(at.x,at.y))continue;
        seen.add(k);q.push({x,y,path:[...at.path,{key,x,y}]});
      }
    }
    throw Error('No resident route to Route 1');
  });
  await p.evaluate(() => {
    window.navProbe.walkSamples=[];
    window.navProbe.measureWalk=new MutationObserver(()=>window.navProbe.walkSamples.push(JSON.parse(document.querySelector('#explore-performance').dataset.sample)));
    window.navProbe.measureWalk.observe(document.querySelector('#explore-performance'),{attributes:true,attributeFilter:['data-sample']});
  });
  for (const step of path) {
    await p.keyboard.down(step.key); await p.waitForTimeout(25); await p.keyboard.up(step.key);
    await p.waitForFunction(({x,y}) => window.navProbe.finished.at(-1).x===x && window.navProbe.finished.at(-1).y===y, step, { timeout: 2500 });
  }
  const walkSamples = await p.evaluate(() => { window.navProbe.measureWalk.disconnect(); return window.navProbe.walkSamples; });
  await ctx.shot('kanto-route1');
  // Return over the same path: unloaded maps must recreate without losing the avatar.
  const reverse={ArrowUp:'ArrowDown',ArrowDown:'ArrowUp',ArrowLeft:'ArrowRight',ArrowRight:'ArrowLeft'};
  const start=await p.evaluate(()=>window.navProbe.finished.find(e=>e.phase==='spawn'));
  for(let i=path.length-1;i>=0;i--){
    const dest=i===0?start:path[i-1];
    await p.keyboard.down(reverse[path[i].key]);await p.waitForTimeout(25);await p.keyboard.up(reverse[path[i].key]);
    await p.waitForFunction(({x,y})=>window.navProbe.finished.at(-1).x===x&&window.navProbe.finished.at(-1).y===y,dest,{timeout:2500});
  }
  const effects=await p.evaluate(()=>window.navProbe.effects);
  if(!effects.includes('TallGrass'))throw Error('Real grass traversal did not emit TallGrass');
  await p.getByRole('button',{name:'Menú · Esc'}).click();
  await p.locator('#explore-scale').selectOption('4');
  await p.locator('#explore-format').selectOption('viewport');
  await p.keyboard.press('Escape');await p.waitForTimeout(1000);
  await p.setViewportSize({width:390,height:844});await p.waitForTimeout(500);
  await ctx.shot('kanto-mobile');
  const after=await p.evaluate(()=>({sample:JSON.parse(document.querySelector('#explore-performance').dataset.sample),
    disposed:window.navProbe.disposed, gridBytes:window.navProbe.grid.retainedBytes,
    maxTask:Math.max(0,...window.navProbe.tasks), tasksOver50:window.navProbe.tasks.length,
    overflow:document.documentElement.scrollWidth>innerWidth}));
  if(!after.disposed.length||after.overflow)throw Error('eviction/mobile '+JSON.stringify(after));
  await p.goto(new URL('maps.html?game=world#mapa=kanto%2FMAP_PALLET_TOWN', process.env.PW_BASE).href);
  await p.locator('#explore').waitFor({state:'visible'});
  await p.locator('#explore').click();
  await p.waitForFunction(()=>document.body.classList.contains('exploring') && window.navProbe?.finished.length);
  const atlasReturn=await p.evaluate(()=>sessionStorage.getItem('atlas-explore-return'));
  await p.getByRole('button',{name:'Menú · Esc'}).click();
  await p.getByRole('button',{name:'Volver al atlas',exact:true}).click();
  await p.waitForURL(url=>url.pathname==='/maps.html');
  if(new URL(p.url()).pathname+new URL(p.url()).search+new URL(p.url()).hash!==atlasReturn)throw Error('Atlas return changed selection/camera');
  if(ctx.errors().length)throw Error(ctx.errors().join(';'));
  return { initial, steps:path.length, walkSamples, after, pauseResume:true, borderSource, collision:true, atlasReturn, grassEffects:effects.filter(name=>name==='TallGrass').length, wideRatio:ratio,
    note:'PREPARED entry URL; real exported collision data and keyboard movement. RAF intervals, not hardware/GPU or ROM parity.' };
}
