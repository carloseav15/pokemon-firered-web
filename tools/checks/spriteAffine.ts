// Check C affine-frame extraction and absolute transform application.
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import {
  AFFINEANIMCMD_END, AFFINEANIMCMD_FRAME, AnimateSprite, GetAffineAnimFrame,
  gOamMatrices, objAffineSet, ResetAffineAnimData, Sprite,
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
console.log("sprite.c affine frame extraction and absolute matrix application passed");
