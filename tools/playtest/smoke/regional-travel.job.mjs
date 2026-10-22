// PREPARED: a saved Kanto trainer positioned beside the ferry. Purchases/progression are not claimed.
// Ferry choices, page loads, arrival saves, reload and Home Continue run through the active UI.
import { readFileSync } from 'node:fs';
const assert = (v, message) => { if (!v) throw Error(message); };
export default async function run(ctx) {
  const p = ctx.page, base = process.env.PW_BASE ?? 'http://127.0.0.1:5173/';
  const ready = () => p.waitForFunction(() => performance.getEntriesByName('viewer-interactive').length, null, { timeout: 60000 });
  const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('firered-save-v1')));
  const live = () => p.evaluate(async () => JSON.parse(JSON.stringify((await import('/src/games/firered/save.ts')).save)));
  const source = JSON.parse(readFileSync('tools/playtest/saves/pewter.json', 'utf8'));
  source.viewerStart = 'definitive-kanto-v1';
  source.viewerNavigation = { mapId: 'MAP_VERMILION_CITY', x: 24, y: 34, direction: 'north', dynamic: null };
  await p.goto(base);
  await p.evaluate(s => { localStorage.clear(); localStorage.setItem('firered-save-v1', JSON.stringify(s)); }, source);
  await p.goto(new URL('world.html#modo=explore', base).href);
  await ready();
  await ctx.shot("departure-before-interaction");
  await p.waitForTimeout(2000);
  // PREPARED unsaved money change: the ferry must persist it before the page unloads.
  await p.evaluate(async () => { (await import('/src/games/firered/save.ts')).save.money = 4321; });
  const before = await live();
  await p.locator('#viewport').focus();
  await p.keyboard.press('z');
  const sail = p.getByRole('button', { name: '🚢 Sail to Hoenn!', exact: true });
  await sail.waitFor();
  // Storage failure must prevent navigation and keep the trainer on the departure page.
  await p.evaluate(() => { window.__setItem = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw Error('PREPARED storage failure'); }; });
  await sail.click();
  await p.getByText('Unable to sail', { exact: true }).waitFor();
  assert(!p.url().includes('region=hoenn'), 'Failed save still sailed');
  await p.evaluate(() => { Storage.prototype.setItem = window.__setItem; delete window.__setItem; });
  await p.locator('#dialog-close').click();
  await p.locator('#viewport').focus(); await p.keyboard.press('z');
  await sail.click();
  await p.waitForURL('**/world.html?region=hoenn**'); await ready();
  let saved = await stored();
  assert(saved.world.activeRegion === 'hoenn', 'Arrival not active');
  assert(saved.world.regions.hoenn.viewerNavigation.mapId === 'MAP_SLATEPORT_CITY', 'Wrong arrival map');
  assert(saved.world.regions.hoenn.viewerNavigation.x === 36 && saved.world.regions.hoenn.viewerNavigation.y === 41, 'Wrong landing tile: '+JSON.stringify(saved.world.regions.hoenn.viewerNavigation));
  assert(saved.money === 4321, 'Unsaved money lost on departure');
  assert(JSON.stringify(saved.party) === JSON.stringify(before.party), 'Party changed on travel');
  assert(JSON.stringify(saved.bag) === JSON.stringify(before.bag), 'Bag changed on travel');
  const hoenn = JSON.stringify(saved.world.regions.hoenn);
  await ctx.shot('ferry-hoenn-arrival');
  await p.goto(base); await p.getByRole('link', { name: '▶ Continue', exact: true }).waitFor();
  assert((await p.locator('#save-card-slot').innerText()).includes('Slateport City'), 'Home shows Kanto location');
  await p.getByRole('link', { name: '▶ Continue', exact: true }).click(); await ready();
  assert(p.url().includes('region=hoenn'), 'Continue returned to Kanto');
  assert((await live()).viewerNavigation.mapId === 'MAP_SLATEPORT_CITY', 'Continue wrong map');
  await p.reload(); await ready();
  assert((await live()).viewerNavigation.mapId === 'MAP_SLATEPORT_CITY', 'Reload wrong map');
  // PREPARED unsaved change in the other direction.
  await p.evaluate(async () => { (await import('/src/games/firered/save.ts')).save.money = 4017; });
  await p.locator('#viewport').focus(); await p.keyboard.press('z');
  await p.getByRole('button', { name: '🚢 Return to Kanto!', exact: true }).click();
  await p.waitForURL('**/world.html?region=kanto**'); await ready();
  saved = await stored();
  assert(saved.world.activeRegion === 'kanto', 'Return not active');
  assert(saved.viewerNavigation.mapId === 'MAP_VERMILION_CITY' && saved.viewerNavigation.x === 24 && saved.viewerNavigation.y === 34, 'Wrong Kanto landing');
  assert(saved.money === 4017, 'Hoenn money change lost');
  assert(JSON.stringify(saved.party) === JSON.stringify(before.party), 'Return changed party');
  assert(JSON.stringify(saved.bag) === JSON.stringify(before.bag), 'Return changed bag');
  assert(JSON.stringify(saved.flags) === JSON.stringify(before.flags), 'Hoenn changed Kanto flags');
  assert(JSON.stringify(saved.vars) === JSON.stringify(before.vars), 'Hoenn changed Kanto vars');
  assert(JSON.stringify(saved.world.regions.hoenn) === hoenn, 'Return changed Hoenn bank');
  await ctx.shot('ferry-kanto-return');
  await p.goto(base); await p.getByRole('link', { name: '▶ Continue', exact: true }).click(); await ready();
  assert((await live()).viewerNavigation.mapId === 'MAP_VERMILION_CITY', 'Kanto Continue wrong map');
  return { status: 'PASS', scope: 'PREPARED trainer; UI ferry round trip, save failure, party/bag/money and progress isolation, Home Continue and Hoenn reload; no campaign claim', errors: ctx.errors() };
}
