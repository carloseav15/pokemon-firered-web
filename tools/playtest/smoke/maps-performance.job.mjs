// Observational instrumentation only: no game state or expected measurements are prepared.
// MAPS_COMMON=1 measures the common viewer; otherwise the four original viewers.
export default async function run(ctx) {
  const base = process.env.PW_BASE ?? 'http://localhost:5174/';
  const common = process.env.MAPS_COMMON === '1';
  const paths = common
    ? ['maps.html?game=firered', 'maps.html?game=emerald', 'maps.html?game=hns', 'maps.html?game=crystal']
    : ['viewer.html?legacy=1', 'viewer.html?game=emerald&legacy=1', 'hns.html?legacy=1', 'crystal-world.html?legacy=1'];
  const results = [];
  for (const path of paths) {
    const context = await ctx.page.context().browser().newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Performance.enable');
    await page.addInitScript(() => {
      const original = window.requestAnimationFrame;
      window.observedRaf = 0;
      window.requestAnimationFrame = callback => original.call(window, time => { window.observedRaf++; callback(time); });
    });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(new URL(path, base).href, { waitUntil: 'load' });
    if (!common && new URL(page.url()).pathname === '/maps.html') throw new Error('Original-viewer baseline requires the pre-unification revision; set MAPS_COMMON=1 for current viewer.');
    if (path.startsWith('viewer')) await page.locator('#loading-overlay').waitFor({ state: 'hidden', timeout: 60000 });
    else await page.waitForFunction(() => document.querySelector('#stage img, #world img'));
    await page.waitForFunction(() => [...document.querySelectorAll('#stage img, #world img')].every(i => i.complete));
    const badImages=await page.evaluate(()=>[...document.querySelectorAll('#stage img, #world img')].filter(i=>!i.naturalWidth).map(i=>i.src));
    if(badImages.length)throw Error('Failed image loads: '+badImages.join(','));
    const ready = await page.evaluate(() => ({
      readyMs: Math.round(performance.now()), resources: performance.getEntriesByType('resource').length,
      transferredBytes: performance.getEntriesByType('resource').reduce((n, r) => n+r.transferSize, 0),
      dom: document.querySelectorAll('*').length,
      canvasBufferBytes: [...document.querySelectorAll('canvas')].reduce((n,c)=>n+c.width*c.height*4,0),
      imageDecodedBytesEstimate: [...document.querySelectorAll('img')].reduce((n,i)=>n+i.naturalWidth*i.naturalHeight*4,0),
      raf: window.observedRaf,
    }));
    const before = (await cdp.send('Performance.getMetrics')).metrics;
    await page.waitForTimeout(2000);
    const after = (await cdp.send('Performance.getMetrics')).metrics;
    const metric = (values, name) => values.find(v=>v.name===name)?.value ?? null;
    const raf = await page.evaluate(() => window.observedRaf);
    results.push({ path, ...ready, idleRaf2s: raf-ready.raf,
      idleTaskMs2s: Math.round(1000*(metric(after,'TaskDuration')-metric(before,'TaskDuration'))),
      jsHeapBytes: metric(after,'JSHeapUsedSize'), errors });
    await context.close();
  }
  return { ok: results.every(r=>!r.errors.length), environment: 'Chromium, Vite development server, 1280×800, disabled network cache, one sample per source; image bytes are an estimate, not total browser/GPU memory', results };
}
