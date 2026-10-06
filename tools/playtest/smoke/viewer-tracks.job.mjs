// PREPARED start coordinate via public URL; real map, keyboard and bicycle toggle.
export default async function run(ctx) {
 const p=ctx.page;
 await p.addInitScript(()=>{window.trackImport=path=>{const e=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname===path);return import(e?.name??path);};});
 const base=process.env.PW_BASE??'http://localhost:5173/';
 await p.goto(new URL('viewer.html',base).href);
 await p.locator('#loading-overlay').waitFor({state:'hidden'});
 await p.evaluate(async()=>{const {ViewerFieldEffects}=await window.trackImport('/src/viewer/fieldEffects.ts');const o=ViewerFieldEffects.prototype.onGroundStep;ViewerFieldEffects.prototype.onGroundStep=function(...args){window.trackGrid=this.grid;return o.apply(this,args);};});
 await p.locator('#mode-explore-btn').click();await p.waitForFunction(()=>window.trackGrid);
 const start=await p.evaluate(async()=>{const C=await window.trackImport('/src/fr/generated/constants.ts');const g=window.trackGrid;for(let y=g.minY;y<g.minY+g.height;y++)for(let x=g.minX;x<g.minX+g.width;x++)if((g.behaviors[g.idx(x,y)]===C.MB_SAND||g.behaviors[g.idx(x,y)]===C.MB_SAND_CAVE)&&g.isWalkable(x,y,'walk')&&g.isWalkable(x+1,y,'walk')&&g.isWalkable(x,y,'bike')&&g.isWalkable(x+1,y,'bike'))return {x,y};throw Error('No real sand pair');});
 await p.goto('about:blank');await p.goto(new URL(`viewer.html#modo=explore&px=${start.x}&py=${start.y}`,base).href);
 await p.locator('#loading-overlay').waitFor({state:'hidden'});
 await p.waitForFunction(()=>document.querySelector('#mode-explore-btn').classList.contains('active-mode'));
 await p.evaluate(async()=>{const {ViewerFieldEffects}=await window.trackImport('/src/viewer/fieldEffects.ts');window.trackEvents=[];const o=ViewerFieldEffects.prototype.onGroundStep;ViewerFieldEffects.prototype.onGroundStep=function(...args){if(!this.observed){this.observed=true;this.subscribe(e=>{if(e.type==='spawn')window.trackEvents.push({id:e.id,name:e.template.name,animation:e.animation,position:e.position,phase:e.phase});});}return o.apply(this,args);};});
 await p.keyboard.press('ArrowRight');await p.waitForTimeout(220);
 let events=await p.evaluate(()=>window.trackEvents);
 const foot=events.find(e=>e.name==='SandFootprints');
 if(!foot||foot.animation!==4||foot.position.tileX!==start.x||foot.position.tileY!==start.y||foot.phase!=='begin')throw Error('Real foot '+JSON.stringify(events));
 const node=p.locator(`[data-effect-id="${foot.id}"]`);if(await node.count()!==1)throw Error('Real footprint invisible');
 await p.keyboard.press('ArrowLeft');await p.waitForTimeout(220);
 await p.locator('#bike-btn').click();await p.keyboard.press('ArrowRight');await p.waitForTimeout(180);
 events=await p.evaluate(()=>window.trackEvents);
 const bike=events.find(e=>e.name==='BikeTireTracks');
 // Previous west -> current east = source transition 4, horizontal frame.
 if(!bike||bike.animation!==4||bike.position.tileX!==start.x||bike.position.tileY!==start.y)throw Error('Real bike '+JSON.stringify(events));
 await p.locator('#mode-viewer-btn').click();if(await p.locator('.field-fx').count())throw Error('Mode cleanup');
 if(ctx.errors().length)throw Error(ctx.errors().join(';'));
 return {fixture:'PREPARED start only; real terrain/key steps/bike toggle',start,foot,bike,modeCleanup:true};
}
