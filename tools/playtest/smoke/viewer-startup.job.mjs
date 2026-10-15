// Passive startup samples; PREPARED HTTP 503 checks the actual retry UI separately.
export default async function run(ctx) {
 const p=ctx.page;
 await p.setViewportSize({width:1280,height:720});
 const cdp=await p.context().newCDPSession(p);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await p.addInitScript(()=>{
  const s=window.startupObservation={ready:null,frames:[],tasks:[]};
  new PerformanceObserver(list=>s.tasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
  let last=0;
  function frame(now){
   const overlay=document.querySelector('#loading-overlay'), player=document.querySelector('#player-sprite');
   if(s.ready===null && !document.body?.hasAttribute('aria-busy') && document.body?.classList.contains('exploring') && player?.style.display==='block' && (!overlay||getComputedStyle(overlay).display==='none'))s.ready=now;
   if(s.ready!==null && last)s.frames.push(now-last);
   last=now;if(s.ready===null||now-s.ready<2200)requestAnimationFrame(frame);else s.done=true;
  }requestAnimationFrame(frame);
 });
 const samples=[];
 for(let i=0;i<3;i++){
  await p.goto('about:blank');await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_PALLET_TOWN',process.env.PW_BASE).href);
  await p.waitForFunction(()=>window.startupObservation?.done);
  samples.push(await p.evaluate(()=>{
   const s=window.startupObservation,a=s.frames.slice(0,60).sort((a,b)=>a-b);
   return {readyMs:s.ready,first60:{fps:1000/(a.reduce((s,x)=>s+x,0)/a.length),p95:a[Math.ceil(a.length*.95)-1],max:a.at(-1)},longTasks:s.tasks,resources:performance.getEntriesByType('resource').filter(e=>/layouts|tilesets|objects\//.test(e.name)).map(e=>({url:new URL(e.name).pathname,start:e.startTime,duration:e.duration})),ui:document.querySelector('#explore-performance').dataset.sample,interactiveMark:performance.getEntriesByName('viewer-interactive')[0]?.startTime};
  }));
 }
 const failureRetry=await verifyFailureRetry(ctx);
 return {samples,failureRetry,note:'Cold HTTP cache, same local Vite server, passive DOM/RAF observation; startup is separate from interactive frame intervals.'};
}

async function verifyFailureRetry(ctx){
 const context=await ctx.page.context().browser().newContext();
 const p=await context.newPage();
 const route='**/fr/objects/rednormal__player.png';
 await p.route(route,r=>r.fulfill({status:503,body:'PREPARED image failure'}));
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_PALLET_TOWN',process.env.PW_BASE).href);
 await p.getByRole('button',{name:'Reintentar',exact:true}).waitFor({state:'visible'});
 if(!await p.locator('#loading-text').textContent().then(s=>s.includes('Error al cargar')))throw Error('Startup error invisible');
 await p.unroute(route);await p.getByRole('button',{name:'Reintentar',exact:true}).click();
 await p.waitForFunction(()=>document.querySelector('#player-sprite')?.style.display==='block'&&!document.body.hasAttribute('aria-busy')&&(!document.querySelector('#loading-overlay')||getComputedStyle(document.querySelector('#loading-overlay')).display==='none'));
 const mark=await p.evaluate(()=>performance.getEntriesByName('viewer-interactive')[0]?.startTime);
 if(!mark)throw Error('Retry did not reach interactive state');
 await context.close();return{label:'PREPARED HTTP 503',errorVisible:true,retry:true};
}
