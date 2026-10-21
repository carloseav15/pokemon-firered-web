// PREPARED: map URLs position the viewer for presentation checks, not story progress.
const base=process.env.PW_BASE??'http://127.0.0.1:5186/';
const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
const spanish=/\b(?:Cargando|Guardar|Cerrar|Volver|Mostrar|Ocultar|Personaje|Presentación|Escala|Enfermera|Dependiente|Región|Mañana|Medalla|Pueblo|Ciudad|Reintentar|Compañero|Autores|Botón|Arriba|Derecha|Izquierda|Requisitos|Recompensas|Efecto|Hoja|Capas|Fuerza|Corte|desconocido|obligatoria|opcional|confianza|etiqueta|datos|casillas|comparados|variocolor|espalda|Bolsillo|Ciclos|Donde|cargado|comunes)\b/iu;
export default async function run(ctx){
 const p=ctx.page;
 const testedMenus=[], manual=[];
 const check=async(selector,label)=>{
  const value=await p.locator(selector).textContent()??'';
  assert(!spanish.test(value),label+': untranslated text '+value.match(spanish)?.[0]);
  const attrs=await p.locator(selector).evaluate(e=>[...e.querySelectorAll('[title],[aria-label],[placeholder]')].map(n=>[n.getAttribute('title'),n.getAttribute('aria-label'),n.getAttribute('placeholder')].filter(Boolean).join(' ')).join('\n'));
  assert(!spanish.test(attrs),label+': untranslated accessible label '+attrs.match(spanish)?.[0]);
 };
 for(const [region,map] of [['kanto','MAP_ROUTE1'],['johto','MAP_NEW_BARK_TOWN'],['hoenn','MAP_LITTLEROOT_TOWN']]){
  if(region==='johto'){
   const data=await p.request.get(new URL('hns/fieldfx.json',base).href);
   if(!data.ok()||(data.headers()['content-type']??'').includes('text/html')){manual.push('Johto runtime blocked: /hns/fieldfx.json is missing');continue;}
  }
  await p.goto(new URL(`world.html?region=${region}#modo=explore&mapa=${map}`,base).href);
  await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length,{timeout:30000});
  await p.getByRole('button',{name:'Menu · Esc',exact:true}).click();
  await p.locator('#explore-menu[open]').waitFor();
  await check('#explore-menu',region+' exploration menu');
  await p.getByRole('button',{name:'Save game',exact:true}).waitFor();
  if(region==='kanto'){
   await p.locator('#explore-touch').check();
   const up=p.locator('#virtual-touch-controls [aria-label="Up"]');
   assert(await up.count()===1,'Touch Up label');
   await check('#virtual-touch-controls','touch controls');
  }
  if(region==='kanto')await p.setViewportSize({width:390,height:844});
  const bounds=await p.locator('#explore-menu').boundingBox();
  assert(bounds&&bounds.x>=0&&bounds.x+bounds.width<=p.viewportSize().width,'Exploration menu clipped');
  await ctx.shot(region+'-english-menu');
  await p.setViewportSize({width:720,height:540});
  testedMenus.push(region);
  await p.keyboard.press('Escape');
  // Toolbar controls are intentionally hidden in immersive mode; inspect their rendered labels.
  await check('#overflow-menu',region+' options');
  await check('#layers-menu',region+' layers');
 }
 for(const [url,ready,section]of [['maps.html','#count','#main'],['dex.html#25','#detail h2','#detail'],['compare.html','#summary','#out'],['library.html','#summary','#out'],['quests.html','#summary','#layout'],['story.html','#out details','main'],['expansion.html','#rows .row','#detail'],['atlas.html','#status tbody tr','main']]){
  await p.goto(new URL(url,base).href);
  await p.locator(ready).first().waitFor({timeout:30000});
  if(url==='maps.html')await p.waitForFunction(()=>document.querySelector('#count')?.textContent?.includes('results'));
  if(url==='quests.html'){
   const required=await p.locator('#kind option[value="obligatoria"]').innerText();assert(required==='required','Source classification not translated');
   await p.locator('#list .row').first().click();
  }
  if(url==='compare.html'||url==='library.html')await p.waitForFunction(()=>document.querySelector('#summary')?.textContent?.length>15);
  if(await p.locator('header').count())await check('header',url+' header');
  if(url!=='maps.html')await check(section,url+' content');
  if(url.startsWith('dex.html')){
   await p.getByRole('button',{name:'Open game window',exact:true}).click();
   await p.locator('iframe.animFrame').waitFor();
   assert((await p.locator('iframe.animFrame').getAttribute('src')).startsWith('/play.html?fr=anims'),'Animation iframe must load the game entry');
  }
 }
 return {menus:testedMenus,manual:manual.join('; ')||undefined,inspectors:'map browser, Pokedex, comparison, library, quests, story, expansion, atlas PASS',animationEntry:'play.html PASS',limits:'English presentation checks only; no source-parity or story-progression claim',errors:ctx.errors()};
}
