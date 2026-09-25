// Headless check for learn_move.c port (moveRelearner.ts)
// Run with: npm run check:learnmove

import './setupNodeGbaMock.ts';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { registerCData, registerIncbin } from '../../src/fr/hw/assets.ts';
import * as MoveRelearner from '../../src/fr/menus/moveRelearner.ts';

const root = process.cwd() + '/public/fr/';

console.log('--- 1. Testing learn_move cdata & incbin assets ---');
const learnMoveCData = JSON.parse(readFileSync(root + 'cdata/learn_move.json', 'utf8'));
registerCData('learn_move', learnMoveCData.defs);
assert.ok(learnMoveCData.defs.sBgTemplates, 'sBgTemplates must exist in cdata');
assert.ok(learnMoveCData.defs.sWindowTemplates, 'sWindowTemplates must exist in cdata');
assert.ok(learnMoveCData.defs.sMoveRelearnerListMenuTemplate, 'sMoveRelearnerListMenuTemplate must exist in cdata');
assert.ok(learnMoveCData.defs.sMoveRelearnerYesNoMenuTemplate, 'sMoveRelearnerYesNoMenuTemplate must exist in cdata');
assert.ok(learnMoveCData.defs.sSpriteTemplate_MoveRelearnerListMenuScrollIndicators, 'sSpriteTemplate_MoveRelearnerListMenuScrollIndicators must exist');

const incbinIndex = JSON.parse(readFileSync(root + 'incbin/index.json', 'utf8'));
assert.ok(incbinIndex.symbols['gMoveRelearner_Pal'], 'gMoveRelearner_Pal in incbin index');
assert.ok(incbinIndex.symbols['gMoveRelearner_Gfx'], 'gMoveRelearner_Gfx in incbin index');
assert.ok(incbinIndex.symbols['gMoveRelearner_Tilemap'], 'gMoveRelearner_Tilemap in incbin index');
console.log('✓ cdata and incbin assets validated');

console.log('--- 2. Testing learn_move functions presence & signatures ---');
const expectedFns = [
  'TeachMoveRelearnerMove',
  'CB2_MoveRelearner_Init',
  'CB2_MoveRelearner_Resume',
  'CB2_MoveRelearner',
  'VBlankCB_MoveRelearner',
  'MoveRelearnerStateMachine',
  'MoveRelearnerLoadBgGfx',
  'DrawTextBorderOnWindows6and7',
  'PrintTeachWhichMoveToStrVar1',
  'InitMoveRelearnerStateVariables',
  'SpriteCB_ListMenuScrollIndicators',
  'SpawnListMenuScrollIndicatorSprites',
  'MoveRelearnerInitListMenuBuffersEtc',
  'MoveRelearnerMenuHandleInput',
  'MoveLearnerInitListMenu',
  'PrintMoveInfo',
  'LoadMoveInfoUI',
  'PrintMoveInfoHandleCancel_CopyToVram',
  'MoveRelearnerMenu_MoveCursorFunc',
  'YesNoMenuProcessInput',
  'PrintTextOnWindow',
  'StringExpandPlaceholdersAndPrintTextOnWindow7Color2',
];

for (const fnName of expectedFns) {
  assert.equal(typeof (MoveRelearner as any)[fnName], 'function', `Function ${fnName} must be defined in moveRelearner.ts`);
}
console.log(`✓ All ${expectedFns.length} functions defined with 1:1 C matching names`);

console.log('--- learn_move check passed successfully! ---');
