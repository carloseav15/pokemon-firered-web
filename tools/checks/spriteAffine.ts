// Check C affine-frame extraction and absolute transform application.
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import {
  AFFINEANIMCMD_END, AFFINEANIMCMD_FRAME, AnimateSprite, GetAffineAnimFrame,
  AFFINEANIMCMD_JUMP, AFFINEANIMCMD_LOOP, gOamMatrices, objAffineSet, ResetAffineAnimData, Sprite,
  ST_OAM_AFFINE_NORMAL, StartSpriteAffineAnim,
} from "../../src/fr/hw/sprite.ts";

ResetAffineAnimData();
const matrixNum = 31;
const sprite = new Sprite();
sprite.oam.affineMode = ST_OAM_AFFINE_NORMAL;
sprite.oam.matrixNum = matrixNum;
sprite.affineAnims = [[AFFINEANIMCMD_FRAME(-0x80, 0x200, 64, 0), AFFINEANIMCMD_END]];
StartSpriteAffineAnim(sprite, 0);

assert.deepEqual(GetAffineAnimFrame(matrixNum, sprite), {
  xScale: -0x80, yScale: 0x200, rotation: 64, duration: 0,
});
AnimateSprite(sprite);

const expected = objAffineSet(-0x200, 0x80, 0x4000);
assert.deepEqual(gOamMatrices[matrixNum], expected, "absolute frame must reset scale and rotation before matrix calculation");
AnimateSprite(sprite);
assert.equal(sprite.affineAnimEnded, true, "end command must mark the animation complete");

ResetAffineAnimData();
const loopSprite = new Sprite();
loopSprite.oam.affineMode = ST_OAM_AFFINE_NORMAL;
loopSprite.oam.matrixNum = 30;
loopSprite.affineAnims = [[
  AFFINEANIMCMD_FRAME(-0x80, 0x200, 64, 0),
  AFFINEANIMCMD_FRAME(0, 0, 0, 1),
  AFFINEANIMCMD_JUMP(3),
  AFFINEANIMCMD_FRAME(0x180, 0x100, 32, 0),
  AFFINEANIMCMD_LOOP(1),
  AFFINEANIMCMD_FRAME(0x200, 0x100, 0, 0),
  AFFINEANIMCMD_END,
]];
StartSpriteAffineAnim(loopSprite, 0);
for (let frame = 0; frame < 12 && !loopSprite.affineAnimEnded; frame++) AnimateSprite(loopSprite);
assert.equal(loopSprite.affineAnimEnded, true, "jump and counted-loop commands must reach the end command");
assert.deepEqual(gOamMatrices[30], objAffineSet(0x80, 0x100, 0), "final absolute frame after loop must reach OAM matrix");
console.log("sprite.c affine frame, delay, jump, counted loop, end, and matrix operations passed");
