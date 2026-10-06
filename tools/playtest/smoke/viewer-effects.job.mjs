// PREPARED fixed RAF timestamps and synthetic ground; real source templates/assets.
export default async function run(ctx) {
  await ctx.page.goto(new URL('viewer.html',process.env.PW_BASE??'http://localhost:5173/').href);
  await ctx.page.locator('#loading-overlay').waitFor({state:'hidden'});
  const result=await ctx.page.evaluate(async()=>{
    const load=path=>{const e=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname===path);return import(e?.name??path);};
    const {ViewerClock}=await load('/src/viewer/clock.ts');
    const {ViewerFieldEffects}=await load('/src/viewer/fieldEffects.ts');
    const {WorldGrid}=await load('/src/viewer/data/worldGrid.ts');
    const {installFieldFxRenderer}=await load('/src/viewer/render/fieldFx.ts');
    const {GBA_FRAME_MS}=await load('/src/viewer/constants.ts');
    const C=await load('/src/fr/generated/constants.ts');
    let callback=null, now=0;
    const clock=new ViewerClock({request:cb=>{callback=cb;return 1;},cancel:()=>{callback=null;}});
    const grid=new WorldGrid(4,1,0,0);grid.behaviors[0]=C.MB_TALL_GRASS;
    const effects=await ViewerFieldEffects.create(grid,clock);
    const content=document.createElement('div');document.body.appendChild(content);
    const dispose=installFieldFxRenderer(effects,content,0,0,clock);
    const step=()=>{now+=GBA_FRAME_MS;const cb=callback;if(!cb)throw Error('No clock subscription');callback=null;cb(now);};
    callback(0);
    const actor={x:0,y:0,previousX:0,previousY:0,direction:'east',previousDirection:'south',landingJump:false};
    effects.resetSession();effects.onGroundStep('begin',actor);
    const first=content.firstElementChild;
    for(let i=0;i<10;i++)step();
    effects.onGroundStep('begin',{...actor,x:2,previousX:1});
    if(!first.isConnected)throw Error('R7 release removed before E');
    for(let i=10;i<49;i++)step();
    if(!first.isConnected)throw Error('R7 effect lost active ticking before final tick');
    step();if(first.isConnected)throw Error('R7 pending release not disposed at E');
    effects.resetSession();effects.onGroundStep('spawn',actor);
    const seek=content.firstElementChild;
    effects.onGroundStep('begin',{...actor,x:2,previousX:1});
    for(let i=0;i<10;i++)step();if(!seek.isConnected)throw Error('Seek ended early');
    step();if(seek.isConnected)throw Error('Seek extra tick missing/too long');
    effects.resetSession();effects.onGroundStep('begin',actor);
    const held=content.firstElementChild;for(let i=0;i<50;i++)step();if(!held.isConnected)throw Error('Ended grass not retained');
    effects.onGroundStep('begin',{...actor,x:2,previousX:1});if(held.isConnected)throw Error('Ended grass not released');
    effects.resetSession();effects.onGroundStep('begin',actor);step();effects.resetSession();
    if(content.children.length)throw Error('Clear left nodes');
    // PREPARED sand cells and cardinal pairs; expected variants from FR C table.
    grid.behaviors[0]=C.MB_SAND;let observed=[];
    const off=effects.subscribe(e=>{if(e.type==='spawn')observed.push(e);});
    const dirs=['south','north','west','east'];
    const expected=[1,2,7,8,1,2,6,5,5,8,3,4,6,7,3,4];
    const footprintFrames=[0,0,1,1], footprintFlips=['scaleX(1) scaleY(-1)','scaleX(1) scaleY(1)','scaleX(1) scaleY(1)','scaleX(-1) scaleY(1)'];
    const bikeFrames=[2,2,1,1,0,0,3,3];
    for(const vehicle of ['walk','bike'])for(let previous=0;previous<4;previous++)for(let current=0;current<4;current++){
      effects.resetSession();observed=[];
      const a={...actor,x:1,previousX:0,vehicle,direction:dirs[current],previousDirection:dirs[previous]};
      effects.onGroundStep('begin',a);
      const e=observed[0], n=content.firstElementChild;
      const variant=vehicle==='walk'?current+1:expected[previous*4+current];
      if(observed.length!==1||e.animation!==variant||e.template.name!==(vehicle==='bike'?'BikeTireTracks':'SandFootprints'))throw Error('direction table');
      const frame=vehicle==='walk'?footprintFrames[current]:bikeFrames[variant-1], rect=e.template.frames[frame];
      const flip=vehicle==='walk'?footprintFlips[current]:`scaleX(${variant===6||variant===7?-1:1}) scaleY(1)`;
      if(n.style.width!=='16px'||n.style.height!=='16px'||n.style.backgroundPosition!==`${-rect.sourceX}px ${-rect.sourceY}px`||n.style.transform!==flip)throw Error('crop/flip '+JSON.stringify({vehicle,previous,current,variant,actual:n.style.cssText,rect:[rect.sourceX,rect.sourceY],flip}));
      if(e.position.tileX!==0||e.position.xPx!==0||e.priority.subpriority!==149||e.priority.oamPriority!==2||e.phase!=='begin')throw Error('previous tile/priority');
      for(let i=0;i<41;i++)step();if(!n.isConnected||n.style.visibility==='hidden')throw Error('hold41');
      step();if(n.style.visibility!=='hidden')throw Error('blink42');
      if(previous===0&&current===0){const tick=clock.tick;clock.pause('PREPARED');now+=1000;if(callback||clock.tick!==tick)throw Error('pause');clock.resume('PREPARED');callback(now);if(clock.tick!==tick||n.style.visibility!=='hidden')throw Error('resume catchup');}
      step();if(n.style.visibility!=='visible')throw Error('blink43');
      for(let i=43;i<56;i++)step();if(!n.isConnected||n.style.visibility!=='hidden')throw Error('blink56');
      step();if(n.isConnected)throw Error('expiry57');
    }
    effects.resetSession();observed=[];
    const mark={...actor,x:1,previousX:0,vehicle:'walk'};
    effects.onGroundStep('spawn',mark);effects.onGroundStep('finish',mark);effects.onGroundStep('begin',{...mark,vehicle:'surf'});effects.onGroundStep('begin',{...mark,x:0});
    if(observed.length)throw Error('tracks outside moved begin');
    effects.onGroundStep('begin',{...mark,x:0,previousX:1});if(observed.length)throw Error('used destination terrain');
    effects.onGroundStep('begin',mark);effects.onGroundStep('begin',mark);effects.onGroundStep('begin',{...mark,vehicle:'bike'});
    if(content.children.length!==3||new Set(observed.map(e=>e.id)).size!==3)throw Error('repeated overlap');
    effects.resetSession();if(content.children.length)throw Error('mode reset marks');off();
    // FR IsDeepSand/IsFootprints are false: verify dormant template directly, no invented terrain activation.
    const {loadEffectTemplate}=await load('/src/viewer/data/fieldFxTemplates.ts');
    const {EffectPresenter}=await load('/src/viewer/render/effectPresenter.ts');
    const deep=await loadEffectTemplate('DeepSandFootprints');
    for(let d=1;d<=4;d++){const e={...observed[0],template:deep,animation:d};const p=new EffectPresenter(e,content,0,0,()=>{});if(p.lastError||content.firstElementChild.style.height!=='16px')throw Error('deep template');p.dispose();}
    effects.onGroundStep('begin',actor);dispose();dispose();
    if(content.children.length||clock.subscriberCount)throw Error('Disposal leaked nodes/subscriptions');
    content.remove();
    return {R7:'PASS: delayed release via installed renderer, seek 11, retained E, clear/dispose',M13:'PASS: 4 foot directions, 16 bike pairs, crops/flips, previous tile, 41/57 ticks, pause, overlap, reset; deep template dormant in FR',fixture:'PREPARED ground / RAF ticks; real assets'};
  });
  if(ctx.errors().length)throw Error(ctx.errors().join(';'));
  return result;
}
