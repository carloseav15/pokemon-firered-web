import assert from 'node:assert/strict';
// Real catalog/UI navigation; no injected map or game state.
export default async function run(ctx) {
  const p=ctx.page, base=process.env.PW_BASE??'http://localhost:5174/';
  await p.addInitScript(() => { const raf=window.requestAnimationFrame.bind(window); window.atlasRaf=0; window.requestAnimationFrame=fn=>raf(t=>{window.atlasRaf++;fn(t);}); });
  const requests=[];p.on('request',r=>requests.push(new URL(r.url()).pathname));
  await p.setViewportSize({width:1280,height:800});
  await p.goto(new URL('maps.html',base).href);
  await p.locator('#source').filter({hasText:'Kanto:'}).waitFor();
  assert.equal(await p.locator('#game').inputValue(),'world');
  assert.equal(await p.locator('.region-outline').count(),3);
  await p.waitForFunction(()=>[...document.querySelectorAll('#stage img')].length>0&&[...document.querySelectorAll('#stage img')].every(i=>i.complete&&i.naturalWidth));
  await ctx.shot('principal-world-desktop');
  const before=await p.evaluate(()=>window.atlasRaf);await p.waitForTimeout(1000);
  const idle=await p.evaluate(()=>window.atlasRaf)-before;assert(idle<=1);
  for(const [region,id,search] of [['kanto','MAP_PALLET_TOWN','Pallet Town'],['johto','MAP_NEW_BARK_TOWN','New Bark Town'],['hoenn','MAP_LITTLEROOT_TOWN','Littleroot Town']]) {
    await p.locator('#region').selectOption(region);
    await p.locator('#meta').filter({hasText:'140 mapas exteriores'}).waitFor();
    await p.locator('#zoom').selectOption('1');
    await p.waitForFunction(()=>[...document.querySelectorAll('#stage img')].length>0&&[...document.querySelectorAll('#stage img')].every(i=>i.complete&&i.naturalWidth));
    assert(Number((await p.locator('#budget').textContent()).match(/([\d.]+) MiB/)[1])<=96);
    await p.locator('#search').fill(search);
    const link=p.locator(`#list a[href="#mapa=${region}%2F${id}"]`);
    assert.equal(await link.count(),1);await link.click();
    await p.locator('#meta').filter({hasText:`${region}/${id}`}).waitFor();
    assert.equal(await p.locator('#explore').isVisible(),region!=='johto');
    if(region!=='johto')assert((await p.locator('#explore').getAttribute('href')).includes(`mapa=${id}`));
    if(region==='johto') {
      await p.locator('#detail .links a').filter({hasText:'New Bark Town Lab'}).first().click();
      await p.locator('#meta').filter({hasText:'johto/MAP_NEW_BARK_TOWN_LAB'}).waitFor();
      await p.locator('#back').click();await p.locator('#meta').filter({hasText:'johto/MAP_NEW_BARK_TOWN'}).waitFor();
      await p.locator('#world-btn').click();await p.locator('#meta').filter({hasText:'140 mapas exteriores'}).waitFor();
      await ctx.shot('principal-johto-desktop');
    }
    await p.locator('#search').fill('');
  }
  await p.goto(new URL('maps.html?game=world#mapa=johto%2FMAP_MAHOGANY_TOWN_SHOP',base).href);
  await p.locator('#meta').filter({hasText:'johto/MAP_MAHOGANY_TOWN_SHOP'}).waitFor();
  await p.locator('#detail a[href="#mapa=johto%2FMAP_ROCKET_HIDEOUT_B1F&warp=0"]').click();
  await p.locator('#meta').filter({hasText:'johto/MAP_ROCKET_HIDEOUT_B1F'}).waitFor();
  await p.goto(new URL('maps.html?game=world#mapa=johto%2FMAP_ROUTE26NORTH',base).href);
  await p.locator('#meta').filter({hasText:'johto/MAP_ROUTE26NORTH'}).waitFor();
  await p.locator('#detail a[href="#mapa=kanto%2FMAP_ROUTE22"]').click();
  await p.locator('#meta').filter({hasText:'kanto/MAP_ROUTE22'}).waitFor();
  assert.equal(await p.locator('#region').inputValue(),'kanto');
  await p.locator('#region').selectOption('all');
  await p.locator('#detail button[data-journey="vermilion-slateport"]').click();
  await p.locator('#detail a[href="#mapa=hoenn%2FMAP_SLATEPORT_CITY"]').click();
  await p.locator('#meta').filter({hasText:'hoenn/MAP_SLATEPORT_CITY'}).waitFor();
  await p.locator('#game').selectOption('hns');
  await p.locator('#source').filter({hasText:'Heart & Soul'}).waitFor();
  assert(!(await p.locator('#region').isVisible()));
  await p.locator('#game').selectOption('world');
  await p.locator('#source').filter({hasText:'Kanto:'}).waitFor();
  await p.setViewportSize({width:390,height:844});
  await p.locator('#region').selectOption('johto');
  await p.locator('#meta').filter({hasText:'140 mapas exteriores'}).waitFor();
  await p.waitForFunction(()=>[...document.querySelectorAll('#stage img')].length>0&&[...document.querySelectorAll('#stage img')].every(i=>i.complete&&i.naturalWidth));
  await ctx.shot('principal-johto-mobile');
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const budget=await p.locator('#budget').textContent();assert(Number(budget.match(/([\d.]+) MiB/)[1])<=96);
  assert(!requests.some(r=>/\/src\/(core|games)\//.test(r)));
  assert.equal(ctx.errors().length,0,ctx.errors().join(';'));
  return {regions:3,idleRaf:idle,maps:await p.locator('#count').textContent(),doors:true,crossSourceNavigation:true,editorialJourney:true,variants:true,mobile:true,budget,noEngineRequests:true};
}
