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
    effects.onGroundStep('begin',actor);dispose();dispose();
    if(content.children.length||clock.subscriberCount)throw Error('Disposal leaked nodes/subscriptions');
    content.remove();
    return {R7:'PASS: delayed release via installed renderer, seek 11, retained E, clear/dispose',fixture:'PREPARED ground / RAF ticks; real assets'};
  });
  if(ctx.errors().length)throw Error(ctx.errors().join(';'));
  return result;
}
