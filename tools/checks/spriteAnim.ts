// Check normal sprite frame, delay, jump, counted loop, end, and reset paths.
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import {
  ANIMCMD_END, ANIMCMD_FRAME, ANIMCMD_JUMP, ANIMCMD_LOOP,
  AnimateSprite, DecrementAnimDelayCounter, ResetSprite, Sprite,
  StartSpriteAnim,
} from "../../src/fr/hw/sprite.ts";

const sprite = new Sprite(0);
sprite.usingSheet = true;
sprite.sheetTileStart = 10;
sprite.anims = [[
  ANIMCMD_FRAME(0, 0),
  ANIMCMD_FRAME(1, 2, 1, 0),
  ANIMCMD_JUMP(3),
  ANIMCMD_FRAME(2, 0),
  ANIMCMD_LOOP(1),
  ANIMCMD_FRAME(3, 0),
  ANIMCMD_END,
]];
StartSpriteAnim(sprite, 0);
for (let frame = 0; frame < 12 && !sprite.animEnded; frame++) AnimateSprite(sprite);
assert.equal(sprite.animEnded, true, "jump and counted loop must reach AnimCmd_end");
assert.equal(sprite.oam.tileNum, 13, "the final loop frame must select image 3");

sprite.animDelayCounter = 0;
DecrementAnimDelayCounter(sprite);
assert.equal(sprite.animDelayCounter, 0x3f, "the C animDelayCounter bitfield decrements with six-bit wrap");
sprite.animPaused = true;
sprite.animDelayCounter = 4;
DecrementAnimDelayCounter(sprite);
assert.equal(sprite.animDelayCounter, 4, "paused animation delay must remain unchanged");

ResetSprite(sprite);
assert.equal(sprite.x, 304);
assert.equal(sprite.y, 160);
assert.equal(sprite.subpriority, 0xff);
assert.equal(sprite.inUse, false);
assert.equal(sprite.animCmdIndex, 0);
assert.equal(sprite.affineAnimPaused, false);
console.log("sprite.c normal animation handlers and ResetSprite passed");
