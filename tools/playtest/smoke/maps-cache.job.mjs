import assert from 'node:assert/strict';
// Observes actual source images while moving the camera. No prepared map/game state.
export default async function run(ctx) {
  const p=ctx.page,base=process.env.PW_BASE??'http://localhost:5174/';
  await p.setViewportSize({width:1280,height:800});
  const reports=[];
  for(const game of ['firered','emerald','hns','crystal']){
    await p.goto(new URL(`maps.html?game=${game}`,base).href);
    await p.waitForFunction(()=>document.querySelector('#stage img'));
    if(game==='firered'||game==='emerald'){
      await p.locator('#layers summary').click();
      await p.locator('[data-layer="collision"]').check();
      await p.locator('#layers summary').click();
    }
    const values=[];
    for(const fraction of [.1,.35,.65,.9,.65,.35,.1]){
      await p.locator('#viewport').evaluate((el,f)=>el.scrollTo((el.scrollWidth-el.clientWidth)*f,(el.scrollHeight-el.clientHeight)*f),fraction);
      await p.waitForTimeout(80);
      const text=await p.locator('#budget').textContent();
      const value=Number(text.match(/([\d.]+) MiB/)[1]);values.push(value);
      assert(value<=96,game+' texture pool exceeds bound: '+text);
    }
    await p.locator('#zoom').selectOption('0.125');
    await p.waitForFunction(()=>[...document.querySelectorAll('#stage img')].every(i=>i.src.includes('overview')));
    const count=await p.locator('#stage img').count();assert(count<=3);
    await p.waitForFunction(()=>[...document.querySelectorAll('#stage img')].every(i=>i.complete&&i.naturalWidth>0));
    reports.push({game,retainedMiB:values,maxRetainedMiB:Math.max(...values),overviewImages:count});
  }
  // Switch during an outstanding header fetch; the old detail must not overwrite the new source.
  await p.goto(new URL('maps.html?game=firered',base).href);
  await p.locator('#source').filter({hasText:'FireRed'}).waitFor();
  await p.route('**/fr/maps/MAP_PALLET_TOWN.json',async route=>{await new Promise(r=>setTimeout(r,150));await route.continue().catch(()=>{});});
  await p.locator('#search').fill('Pallet Town');await p.locator('#list a[href="#mapa=MAP_PALLET_TOWN"]').click();
  await p.locator('#game').selectOption('crystal');
  await p.locator('#source').filter({hasText:'Crystal'}).waitFor();
  await p.waitForTimeout(200);
  assert(!(await p.locator('#detail').textContent()).includes('PalletTown'));
  assert(ctx.errors().length===0,ctx.errors().join(';'));
  return {reports,race:'PREPARED 150 ms network delay only; real source switch cancels the stale detail',scope:'Retained RGBA estimate for viewer-owned images, not browser/GPU memory'};
}
