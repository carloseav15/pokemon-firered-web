import assert from 'node:assert/strict';
export default async function run(ctx) {
  const p=ctx.page, base=process.env.PW_BASE??'http://localhost:5174/';
  await p.setViewportSize({width:1280,height:800});
  const checks=[];
  for(const [game,map] of [['firered','MAP_VIRIDIAN_CITY'],['emerald','MAP_OLDALE_TOWN']]) {
    await p.goto(new URL(`maps.html?game=${game}#mapa=${map}`,base).href);
    await p.locator('#meta').filter({hasText:map}).waitFor();
    await p.locator('#explore').click();
    await p.locator('#loading-overlay').waitFor({state:'hidden',timeout:60000});
    await p.waitForFunction(()=>document.querySelector('#mode-explore-btn').classList.contains('active-mode'));
    const hash=await p.evaluate(()=>Object.fromEntries(new URLSearchParams(location.hash.slice(1))));
    const index=await (await p.request.get(new URL(`viewer/${game==='firered'?'kanto':'hoenn'}.json`,base).href)).json();
    const rect=index.maps[map],x=Number(hash.px),y=Number(hash.py);
    assert(x>=rect.x&&x<rect.x+rect.width&&y>=rect.y&&y<rect.y+rect.height,'exploration did not spawn in selected real map');
    await p.keyboard.press('ArrowRight');
    await p.waitForTimeout(250);
    const view=await p.locator('#viewport').evaluate(el=>({x:el.scrollLeft,y:el.scrollTop}));
    await p.locator('#mode-viewer-btn').click();
    await p.waitForURL(/maps\.html/);
    await p.locator('#source').filter({hasText:game==='firered'?'FireRed':'Emerald'}).waitFor();
    const restored=await p.locator('#viewport').evaluate(el=>({x:el.scrollLeft,y:el.scrollTop}));
    assert(Math.abs(restored.x-view.x)<2&&Math.abs(restored.y-view.y)<2,'return camera position');
    checks.push({game,map,actualSpawn:{x,y},view,restored});
  }
  for(const [path,game,map] of [['viewer.html#mapa=MAP_PALLET_TOWN','firered','MAP_PALLET_TOWN'],['hns.html#MAP_NEW_BARK_TOWN','hns','MAP_NEW_BARK_TOWN'],['crystal.html#NewBarkTown','crystal','NewBarkTown'],['crystal-world.html','crystal',null]]){
    await p.goto(new URL(path,base).href);await p.waitForURL(/maps\.html/);
    assert(new URL(p.url()).searchParams.get('game')===game);
    if(map)await p.locator('#meta').filter({hasText:map}).waitFor();
  }
  return {realUi:true,checks,legacyDeepLinksPreserved:true};
}
