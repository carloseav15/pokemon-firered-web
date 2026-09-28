// Headless check for the event_object_movement.c MovementAction_* dispatch table
// (src/fr/field/objectEvents.ts: MOVEMENT_ACTION_STEPS / movementActionStep).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { registerCData } from "../../src/fr/hw/assets";
import "./setupNodeGbaMock";
import { rom } from "../../src/fr/rom";
import * as C from "../../src/fr/generated/constants";
import { DIR_EAST, DIR_NORTH, DIR_SOUTH, ObjectEvent, ObjectEvents } from "../../src/fr/field/objectEvents";

const exported = JSON.parse(readFileSync(resolve("public/fr/cdata/event_object_movement.json"), "utf8")) as {
  defs: Record<string, { type: string; value: unknown[] }>;
};
registerCData("event_object_movement", exported.defs);

// graphicsInfo() (MovementAction_RestoreAnimation_Step0) reads rom.objects; a minimal
// single-entry registry is enough to exercise it headlessly.
rom.objects = {
  gfx: {
    "0": {
      width: 16, height: 16, inanimate: false, anims: "none",
      frames: [], reflectionFrames: [], bridgeReflectionFrames: [],
      disableReflectionPaletteLoad: false, shadowSize: "SHADOW_SIZE_M", tracks: "TRACKS_NONE",
    } as any,
  },
  animTables: { none: [] },
  anims: {},
};

const hooks = {
  playerDestCoords: () => ({ x: 5, y: 5 }),
  emote: () => {},
  playSE: () => {},
  playerIsRunning: () => false,
};
const objects = new ObjectEvents(hooks as any);

// A sprite normally advances SpriteAnimEnded through SpriteManager.update() (sprite.ts:
// animate()) once its graphics/anim table is loaded; movement actions that wait on it
// (MovementAction_WaitSpriteAnim, the RaiseHand family) need that same per-frame drive.
// Any animNum resolves to one "draw a frame, then end" command pair, so animate() flips
// animEnded to true after two calls regardless of which ANIM_* constant was started.
const fallbackAnim = [["F", 0, 1, 0, 0], ["E"]] as any;
const anims = new Proxy([] as any[], { get: (_t, prop) => (prop === "length" ? 999 : fallbackAnim) });

function run(actionId: number, maxFrames = 200): { object: ObjectEvent; frames: number } {
  const object = new ObjectEvent();
  object.sprite.anims = anims;
  object.movementActionId = actionId;
  object.sprite.data[2] = 0;
  for (let frame = 0; frame < maxFrames; frame++) {
    const finished = objects.execAction(object);
    object.sprite.animate();
    if (finished) return { object, frames: frame + 1 };
  }
  throw new Error(`MOVEMENT_ACTION ${actionId} did not finish within ${maxFrames} frames`);
}

// Every action id 0..169 must resolve to real, callable step functions and terminate.
for (let id = 0; id <= C.MOVEMENT_ACTION_JUMP_SPECIAL_WITH_EFFECT_RIGHT; id++) {
  run(id, 400);
}

// Face actions turn immediately and complete in one frame (MovementAction_FaceUp_Step0).
{
  const { object, frames } = run(C.MOVEMENT_ACTION_FACE_UP, 1);
  assert.equal(frames, 1);
  assert.equal(object.facingDirection, DIR_NORTH);
}

// Walk normal down: multi-frame, moves one tile south (MovementAction_WalkNormalDown_Step0/1).
{
  const { object, frames } = run(C.MOVEMENT_ACTION_WALK_NORMAL_DOWN);
  assert.ok(frames > 1, "walk normal must take more than one frame");
  assert.equal(object.currentCoords.y, 1);
  assert.equal(object.facingDirection, DIR_SOUTH);
}

// MovementAction_Delay1_Step0 tail-calls MovementAction_Delay_Step1 the same frame
// (event_object_movement.c), so a delay of 1 finishes on the very first call; a
// longer delay takes that many frames.
{
  assert.equal(run(C.MOVEMENT_ACTION_DELAY_1).frames, 1);
  assert.equal(run(C.MOVEMENT_ACTION_DELAY_4).frames, 4);
}

// MovementAction_WalkInPlaceSlow_Step1 bumps animDelayCounter every other frame
// (event_object_movement.c); MovementAction_WalkInPlace_Step1 (normal speed) never does.
{
  const object = new ObjectEvent();
  object.movementActionId = C.MOVEMENT_ACTION_WALK_IN_PLACE_SLOW_DOWN;
  object.sprite.data[2] = 0;
  let bumped = false;
  for (let frame = 0; frame < 40 && !objects.execAction(object); frame++) {
    if (object.sprite.animDelayCounter > 0) bumped = true;
  }
  assert.ok(bumped, "WalkInPlaceSlow must bump animDelayCounter on odd frames");
}
{
  const object = new ObjectEvent();
  object.movementActionId = C.MOVEMENT_ACTION_WALK_IN_PLACE_NORMAL_DOWN;
  object.sprite.data[2] = 0;
  for (let frame = 0; frame < 20 && !objects.execAction(object); frame++) {
    assert.equal(object.sprite.animDelayCounter, 0);
  }
}

// Three real steps (RockSmashBreak/CutTree flash for 32 frames then hide) plus MovementAction_Finish.
{
  const { object, frames } = run(C.MOVEMENT_ACTION_ROCK_SMASH_BREAK);
  assert.ok(frames > 32, "rock smash break must run its full flash/hide sequence");
  assert.equal(object.invisible, true);
}

// Raise hand: MovementAction_RaiseHand_Step0 (shared) into MovementAction_RaiseHandAndStop_Step1
// (id-specific), a self-contained sprite.data[4..7] phase machine independent of table stepping.
{
  const { frames } = run(C.MOVEMENT_ACTION_RAISE_HAND_AND_STOP, 500);
  assert.ok(frames > 1);
}

// Fly up/down share MovementAction_FlyUp_Step2 as their terminal step.
{
  const { object } = run(C.MOVEMENT_ACTION_FLY_UP);
  assert.equal(object.sprite.y2, -160);
}
{
  const { object } = run(C.MOVEMENT_ACTION_FLY_DOWN);
  assert.equal(object.sprite.y2, 0);
}

// Face player turns toward hooks.playerDestCoords() (MovementAction_FacePlayer_Step0).
{
  const { object } = run(C.MOVEMENT_ACTION_FACE_PLAYER, 1);
  assert.equal(object.facingDirection, DIR_EAST);
}

console.log("event_object_movement.c MovementAction_* dispatch table checks passed");
