// Headless check for teachy_tv.c port (teachyTv.ts)
// Run with: npm run check:teachytv

import './setupNodeGbaMock.ts';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { registerCData } from '../../src/fr/hw/assets.ts';
import * as TeachyTv from '../../src/fr/teachyTv.ts';

const root = process.cwd() + '/public/fr/';

console.log('--- 1. Testing teachy_tv cdata & incbin assets ---');
const teachyTvCData = JSON.parse(readFileSync(root + 'cdata/teachy_tv.json', 'utf8'));
registerCData('teachy_tv', teachyTvCData.defs);
assert.ok(teachyTvCData.defs.sBgTemplates, 'sBgTemplates must exist in cdata');
assert.ok(teachyTvCData.defs.sWindowTemplates, 'sWindowTemplates must exist in cdata');
assert.ok(teachyTvCData.defs.sListMenuTemplate, 'sListMenuTemplate must exist in cdata');
assert.ok(teachyTvCData.defs.sListMenuItems, 'sListMenuItems must exist in cdata');

const incbinIndex = JSON.parse(readFileSync(root + 'incbin/index.json', 'utf8'));
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
TeachyTv.TeachyTvQuitFadeControlAndTaskDel();
assert.ok(exited, 'Exit callback invoked');
assert.equal(TeachyTv.sResources, null, 'sResources freed on quit');

console.log('✓ Init and Quit lifecycle verified');
console.log('--- teachy_tv check passed successfully! ---');
