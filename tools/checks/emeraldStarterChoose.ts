// Reuses hoennCircuit's DOM/RAF/data harness (--starter): Route101_EventScript_BirchsBag on the exported Emerald
// data, driven by real key presses on the engine frames: the fade, `special ChooseStarter` (starter_choose.c screen:
// right to the third Poké Ball, A, A on YES), CB2_GiveStarter (VAR_STARTER_MON + ScriptGiveMon level 5), the first
// battle against the Zigzagoon of InitBtlControllers and the rest of the script up to the warp to Birch's lab.
// PREPARED: trainer with an empty party, the Route 101 state before the bag (VAR_ROUTE101_STATE 2, Birch and the
// Zigzagoon on the map) and the player beside the bag. No claim about the Emerald first-battle rules (GAP in starterChoose.ts).
import assert from 'node:assert/strict';
import { rom } from '../../src/core/rom.ts';
import { flagGet, save, varGet, varSet } from '../../src/games/firered/save.ts';
import { joy, A_BUTTON, DPAD_RIGHT } from '../../src/core/gba/input.ts';
import { tasks } from '../../src/core/gba/tasks.ts';
import { GetStarterPokemon } from '../../src/games/emerald/starterChoose.ts';
import type { EngineInteraction } from '../../src/viewer/engineInteraction.ts';
import type { NavigationSave } from '../../src/viewer/session.ts';
import * as EM from '../../src/games/emerald/generated/constants.ts';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { ppu } from '../../src/core/hw/ppu.ts';
import { resolve } from 'node:path';
type Pump = (frames: number, input?: (frame: number) => number, done?: () => boolean) => Promise<number>;

/** Optional (STARTER_SHOT_DIR): PNG of the PPU frame, to look at the screen. */
function shot(name: string): void {
  const dir = process.env.STARTER_SHOT_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  const image = ppu.renderFrame();
  const raw = Buffer.alloc((240 * 4 + 1) * 160);
  for (let y = 0; y < 160; y++) { raw[y * 961] = 0; Buffer.from(image.data.buffer, image.data.byteOffset + y * 960, 960).copy(raw, y * 961 + 1); }
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(240, 0); header.writeUInt32BE(160, 4); header[8] = 8; header[9] = 6;
  writeFileSync(`${dir}/${name}.png`, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

export async function runStarterChecks(engine: EngineInteraction, pump: Pump): Promise<void> {
  const decomp = process.env.POKEEMERALD ?? '../refs-src/pokeemerald';
  const script = readFileSync(resolve(decomp, 'data/maps/Route101/scripts.inc'), 'utf8');
  assert.ok(/special ChooseStarter\n\tapplywaitmovement LOCALID_ROUTE101_BIRCH/.test(script), 'the script calls ChooseStarter then Birch walks up');
  const map = await rom.loadMap('MAP_ROUTE101');
  const bag = map.objects.find(o => !o.clone && o.scriptName === 'Route101_EventScript_BirchsBag')!;
  assert.ok(bag, 'Birch’s bag object');
  const nav: NavigationSave = { mapId: 'MAP_ROUTE101', x: bag.x + 1, y: bag.y, direction: 'west', dynamic: null };
  save.party = []; // PREPARED: a trainer without Pokémon, as in the source before the bag
  varSet(EM.VAR_ROUTE101_STATE, 2); // PREPARED
  await engine.enterMap(nav);
  // starter_choose.c sStarterMon
  assert.deepEqual([0, 1, 2].map(GetStarterPokemon), [EM.SPECIES_TREECKO, EM.SPECIES_TORCHIC, EM.SPECIES_MUDKIP]);
  assert.equal(GetStarterPokemon(4), EM.SPECIES_TREECKO, 'ids above STARTER_MON_COUNT select the first starter');
  const sceneSeen: string[] = [];
  let starterScene = false;
  await engine.show(nav, { mapId: 'MAP_ROUTE101', localId: bag.localId });
  assert.equal(engine.open, true, 'the bag script started');
  // The selection starts on the middle Poké Ball (tStarterSelection = 1); RIGHT moves to the third (Mudkip).
  let frameInScene = 0, confirmFrames = 0, chooseFrames = 0;
  const frames = await pump(40000, () => {
    const names = tasks.tasks.filter(t => t.isActive).map(t => t.func.name);
    if (names.some(n => n === 'Task_StarterChoose' || n === 'Task_HandleStarterChooseInput')) starterScene = true;
    for (const n of names) if (!sceneSeen.includes(n) && /Starter/.test(n)) sceneSeen.push(n);
    if (!starterScene) return 0;
    frameInScene++;
    if (names.includes('Task_HandleConfirmStarterInput') && ++confirmFrames === 4) shot('2-confirm');
    if (names.includes('Task_HandleStarterChooseInput') && ++chooseFrames === 40) shot('1-choose');
    if (frameInScene === 6) return DPAD_RIGHT; // PREPARED input: move to the third ball
    return frameInScene % 24 === 12 ? A_BUTTON : 0;
  }, () => !engine.open);
  assert.equal(engine.open, false, `script finished after ${frames} frames (scene tasks seen: ${sceneSeen.join(', ')})`);
  assert.ok(starterScene, 'the starter choose screen ran');
  assert.deepEqual(sceneSeen.filter(n => /Task_(StarterChoose|HandleStarterChooseInput|WaitForStarterSprite|AskConfirmStarter|HandleConfirmStarterInput)/.test(n)).slice(0, 5),
    ['Task_StarterChoose', 'Task_HandleStarterChooseInput', 'Task_WaitForStarterSprite', 'Task_AskConfirmStarter', 'Task_HandleConfirmStarterInput'].filter(n => sceneSeen.includes(n)));
  const chosen = varGet(EM.VAR_STARTER_MON);
  assert.equal(chosen, 2, 'VAR_STARTER_MON = the third ball');
  assert.equal(save.party.length, 1, 'ScriptGiveMon put one Pokémon in the party');
  assert.equal(save.party[0]!.species, EM.SPECIES_MUDKIP);
  assert.equal(save.party[0]!.level, 5);
  assert.equal(flagGet(EM.FLAG_SYS_POKEMON_GET), true, 'script: setflag FLAG_SYS_POKEMON_GET');
  assert.equal(flagGet(EM.FLAG_RESCUED_BIRCH), true);
  assert.equal(varGet(EM.VAR_ROUTE101_STATE), 3);
  assert.equal(varGet(EM.VAR_BIRCH_LAB_STATE), 2);
  assert.equal(flagGet(EM.FLAG_HIDE_ROUTE_101_BIRCH_STARTERS_BAG), true);
  assert.equal(save.gameStats[EM.GAME_STAT_WILD_BATTLES] ?? 0, 1, 'CB2_StartFirstBattle counted the wild battle');
  console.log(`check:emerald-starter-choose PASS: Route101_EventScript_BirchsBag → ChooseStarter (${sceneSeen.length} screen tasks) → Mudkip Lv 5 → first battle → script end (${frames} frames); PREPARED trainer/state`);
}
