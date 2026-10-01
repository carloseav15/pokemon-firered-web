// Headless check for teachy_tv.c port (teachyTv.ts)
// Run with: npm run check:teachytv

import './setupNodeGbaMock.ts';
import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { registerCData, registerIncbinIndex, registerPack } from '../../src/fr/hw/assets.ts';
import { tasks } from '../../src/fr/gba/tasks.ts';
import { runHwFrame } from '../../src/fr/hw/runtime.ts';
import { rom } from '../../src/fr/rom.ts';
import * as TeachyTv from '../../src/fr/teachyTv.ts';

const root = process.cwd() + '/public/fr/';
(globalThis as any).fetch = async (url: string) => {
  let norm = String(url).replace(/^\/?/, '/');
  if (!norm.startsWith('/fr/')) norm = '/fr' + norm;
  const path = process.cwd() + '/public' + norm;
  if (!existsSync(path)) throw new Error(`fetch 404: ${url} -> ${path}`);
  const buf = readFileSync(path);
  return {
    ok: true,
    json: async () => JSON.parse(buf.toString('utf8')),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    text: async () => buf.toString('utf8'),
  };
};

console.log('--- 1. Testing teachy_tv cdata & incbin assets ---');
const teachyTvCData = JSON.parse(readFileSync(root + 'cdata/teachy_tv.json', 'utf8'));
registerCData('teachy_tv', teachyTvCData.defs);
assert.ok(teachyTvCData.defs.sBgTemplates, 'sBgTemplates must exist in cdata');
assert.ok(teachyTvCData.defs.sWindowTemplates, 'sWindowTemplates must exist in cdata');
assert.ok(teachyTvCData.defs.sListMenuTemplate, 'sListMenuTemplate must exist in cdata');
assert.ok(teachyTvCData.defs.sListMenuItems, 'sListMenuItems must exist in cdata');

const incbinIndex = JSON.parse(readFileSync(root + 'incbin/index.json', 'utf8'));
registerIncbinIndex(incbinIndex);
// Same packs as preloadTeachyTv (graphics_object_events missing as a pack is fine:
// registerPack only for files that exist).
for (const pack of ['graphics_teachy_tv', 'graphics_object_events', 'graphics_text_window', 'graphics_fonts', 'graphics_field_effects', 'graphics_interface', 'graphics_field_effect_objects', 'graphics_pokemon_storage', 'graphics_pokedude', 'graphics_battle_interface', 'pokemon']) {
  try {
    const buf = readFileSync(root + `incbin/${pack}.bin`);
    registerPack(pack, new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
  } catch { /* pack file absent: symbols resolve only if present */ }
}
// The init/exit lifecycle shares the screen's CData and loads glyph tables.
for (const file of ['graphics', 'strings', 'event_object_movement', 'data', 'trainer_pokemon_sprites', 'text', 'text_printer', 'text_window_graphics']) {
  registerCData(file, JSON.parse(readFileSync(root + `cdata/${file}.json`, 'utf8')).defs);
}
assert.ok(incbinIndex.symbols['gTeachyTvScreen_Tilemap'], 'gTeachyTvScreen_Tilemap in incbin');
assert.ok(incbinIndex.symbols['gTeachyTvTitle_Tilemap'], 'gTeachyTvTitle_Tilemap in incbin');
assert.ok(incbinIndex.symbols['gTeachyTv_Border_Gfx'], 'gTeachyTv_Border_Gfx in incbin');
assert.ok(incbinIndex.symbols['gTeachyTv_Gfx'], 'gTeachyTv_Gfx in incbin');
assert.ok(incbinIndex.symbols['gTeachyTv_Pal'], 'gTeachyTv_Pal in incbin');
console.log('✓ cdata and incbin assets validated');

console.log('--- 2. Testing 58/58 C functions presence & signatures ---');
const expectedFns = [
  'CB2_ReturnToTeachyTV',
  'InitTeachyTvController',
  'SetTeachyTvControllerModeToResume',
  'TTVcmd_ClearBg2TeachyTvGraphic',
  'TTVcmd_DudeMoveLeft',
  'TTVcmd_DudeMoveRight',
  'TTVcmd_DudeMoveUp',
  'TTVcmd_DudeTurnLeft',
  'TTVcmd_End',
  'TTVcmd_EraseTextWindowIfKeyPressed',
  'TTVcmd_IdleIfTextPrinterIsActive',
  'TTVcmd_IdleIfTextPrinterIsActive2',
  'TTVcmd_NpcMoveAndSetupTextPrinter',
  'TTVcmd_RenderAndRemoveBg1EndGraphic',
  'TTVcmd_StartAnimNpcWalkIntoGrass',
  'TTVcmd_TaskBattleOrFadeByOptionChosen',
  'TTVcmd_TextPrinterSwitchStringByOptionChosen',
  'TTVcmd_TextPrinterSwitchStringByOptionChosen2',
  'TTVcmd_TransitionRenderBg2TeachyTvGraphicInitNpcPos',
  'TeachyTvAudioByInput',
  'TeachyTvBg2AnimController',
  'TeachyTvCallback',
  'TeachyTvClearBg1EndGraphicText',
  'TeachyTvClearWindowRegs',
  'TeachyTvComputeMapTilesFromTilesetAndMetaTiles',
  'TeachyTvComputePalIndexArrayEntryByMetaTile',
  'TeachyTvComputeSingleMapTileBlockFromTilesetAndMetaTiles',
  'TeachyTvCreateAndRenderRbox',
  'TeachyTvFree',
  'TeachyTvGrassAnimationCheckIfNeedsToGenerateGrassObj',
  'TeachyTvGrassAnimationMain',
  'TeachyTvGrassAnimationObjCallback',
  'TeachyTvInitIo',
  'TeachyTvInitTextPrinter',
  'TeachyTvLoadBg3Map',
  'TeachyTvLoadGraphic',
  'TeachyTvLoadMapPalette',
  'TeachyTvLoadMapTilesetToBuffer',
  'TeachyTvMainCallback',
  'TeachyTvOptionListController',
  'TeachyTvPostBattleFadeControl',
  'TeachyTvPreBattleAnimAndSetBattleCallback',
  'TeachyTvPrepBattle',
  'TeachyTvPushBackNewMapPalIndexArrayEntry',
  'TeachyTvQuitBeginFade',
  'TeachyTvQuitFadeControlAndTaskDel',
  'TeachyTvRemoveScrollIndicatorArrowPair',
  'TeachyTvRenderMsgAndSwitchClusterFuncs',
  'TeachyTvRestorePlayerPartyCallback',
  'TeachyTvSetSpriteCoordsAndSwitchFrame',
  'TeachyTvSetWindowRegs',
  'TeachyTvSetupBagItemsByOptionChosen',
  'TeachyTvSetupBg',
  'TeachyTvSetupObjEventAndOam',
  'TeachyTvSetupPostBattleWindowAndObj',
  'TeachyTvSetupScrollIndicatorArrowPair',
  'TeachyTvSetupWindow',
  'TeachyTvVblankHandler',
];

for (const fnName of expectedFns) {
  assert.equal(typeof (TeachyTv as any)[fnName], 'function', `Function ${fnName} must be defined in teachyTv.ts`);
}
console.log(`✓ All ${expectedFns.length} functions defined with 1:1 C matching names`);

console.log('--- 3. Testing TeachyTv initialization and teardown ---');
// TeachyTvLoadBg3Map draws the Route 1 layout (same as preloadTeachyTv).
(rom as any).strings = JSON.parse(readFileSync(root + 'data/strings.json', 'utf8'));
(rom as any).charmap = JSON.parse(readFileSync(root + 'charmap.json', 'utf8'));
(rom as any).fonts = JSON.parse(readFileSync(root + 'gfx/fonts.json', 'utf8'));
{
  const speciesRaw = JSON.parse(readFileSync(root + 'data/species.json', 'utf8'));
  (rom as any).species = speciesRaw.species;
  const movesRaw = JSON.parse(readFileSync(root + 'data/moves.json', 'utf8'));
  (rom as any).moves = movesRaw.moves;
  const itemsRaw = JSON.parse(readFileSync(root + 'data/items.json', 'utf8'));
  (rom as any).items = itemsRaw.items;
}
const tvLayout = await rom.loadLayout('LAYOUT_ROUTE1');
await Promise.all([rom.loadTileset(tvLayout.primary), rom.loadTileset(tvLayout.secondary)]);
let exited = false;
TeachyTv.InitTeachyTvController(0, () => {
  exited = true;
});
assert.equal(TeachyTv.sStaticResources.mode, 0);
assert.equal(TeachyTv.sStaticResources.whichScript, TeachyTv.TTVSCR_BATTLE);

// Execute MainCallback setup steps
for (let state = 0; state < 9; state++) {
  TeachyTv.TeachyTvMainCallback();
}
assert.ok(TeachyTv.sResources, 'sResources allocated');

// Exit flow
const quitTaskId = tasks.create(() => {}, 0);
TeachyTv.TeachyTvQuitFadeControlAndTaskDel(quitTaskId);
// The C installs the saved callback; it is invoked on the next main frame.
runHwFrame();
assert.ok(exited, 'Exit callback invoked');
assert.equal(TeachyTv.sResources, null, 'sResources freed on quit');

console.log('✓ Init and Quit lifecycle verified');
console.log('--- teachy_tv check passed successfully! ---');
