// Focused scheduler/input checks. PREPARED clock/host isolates frame ownership; no game/story claim.
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Game, FRAME_MS } from "../../src/fr/game.ts";
import { joy, A_BUTTON, DPAD_RIGHT } from "../../src/fr/gba/input.ts";
import { getRandomState, SeedRngAndSetTrainerId, InitPlayerTrainerId, random, takeWildEncounterSeed } from "../../src/fr/random.ts";

(globalThis as any).fetch = async (url: string) => {
  const bytes = readFileSync(process.cwd() + "/public" + url);
  return { ok: true, json: async () => JSON.parse(bytes.toString()), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};
const events = new Map<string, (event: any) => void>();
(globalThis as any).addEventListener = (name: string, fn: (event: any) => void) => events.set(name, fn);
let scheduled: FrameRequestCallback[] = [];
(globalThis as any).requestAnimationFrame = (fn: FrameRequestCallback) => { scheduled.push(fn); return scheduled.length; };
let now = 1000;
Object.defineProperty(globalThis, "performance", { value: { now: () => now }, configurable: true });

function host() {
  // PREPARED scheduler host. Invoke the real Game.start, with frame/render counters instead of gameplay.
  const game: any = Object.create(Game.prototype);
  Object.assign(game, { started: false, accumulator: 0, lastTime: 0, calls: 0, renders: 0,
    frame() { this.calls++; }, render() { this.renders++; } });
  return game;
}
const manual = host();
manual.start({ manualFrames: true });
assert.equal(scheduled.length, 0, "manual start must not schedule rAF");
assert.throws(() => manual.start(), /already started/);
let gestures = 0;
joy.onUserGesture = () => { gestures++; };
events.get("keydown")!({ code: "KeyZ", preventDefault() {} });
joy.poll();
assert.equal(joy.newKeys, 0, "external keydown must not enter a manual replay");
assert.equal(gestures, 0);
joy.press(DPAD_RIGHT);
events.get("blur")!({});
joy.poll();
assert.equal(joy.held, DPAD_RIGHT, "blur must not release injected manual input");
joy.release(0x3ff); joy.poll();

const normal = host();
normal.start();
assert.equal(scheduled.length, 1, "normal start still schedules rAF");
events.get("keydown")!({ code: "KeyZ", preventDefault() {} });
joy.poll();
assert.equal(joy.newKeys, A_BUTTON, "normal keyboard remains connected");
assert.equal(gestures, 1);
events.get("keyup")!({ code: "KeyZ", preventDefault() {} }); joy.poll();
now += FRAME_MS * 2 + 0.001;
scheduled.shift()!(now);
assert.equal(normal.calls, 2);
assert.equal(normal.renders, 1);
assert.equal(scheduled.length, 1, "one successor rAF per tick");
now += 250;
scheduled.shift()!(now);
assert.equal(normal.calls, 10, "normal catch-up remains capped at eight frames");

joy.initKeys();
joy.press(DPAD_RIGHT); joy.poll(); joy.release(DPAD_RIGHT);
assert.equal(joy.newKeys, DPAD_RIGHT);
for (let i = 0; i < 39; i++) { joy.press(DPAD_RIGHT); joy.poll(); joy.release(DPAD_RIGHT); assert.equal(joy.newKeys, 0); assert.equal(joy.repeated, 0); }
joy.press(DPAD_RIGHT); joy.poll(); joy.release(DPAD_RIGHT);
assert.equal(joy.repeated, DPAD_RIGHT, "held input must retain the 40-frame repeat delay");
const copy = joy.snapshot() as Record<string, number>;
copy.previousRaw = 0; copy.repeatCounter = 999;
joy.press(DPAD_RIGHT); joy.poll(); joy.release(DPAD_RIGHT);
assert.equal(joy.newKeys, 0, "observed state is detached from input state");
assert.equal(joy.snapshot().repeatCounter, 4);

// PREPARED Timer1 input. Observation must not draw RNG, nor consume the reserved encounter seed.
SeedRngAndSetTrainerId(12345);
const before = getRandomState();
getRandomState(); getRandomState();
assert.deepEqual(getRandomState(), before);
const id = InitPlayerTrainerId(), wild = takeWildEncounterSeed(), draw = random();
SeedRngAndSetTrainerId(12345);
assert.equal(InitPlayerTrainerId(), id);
assert.equal(takeWildEncounterSeed(), wild);
assert.equal(random(), draw);
(before as any).seed = 0;
assert.notEqual(getRandomState().seed, 0, "observed RNG state is detached");
console.log("manual frames PASS (PREPARED host/clock; exclusive scheduler, normal rAF, DOM isolation, input edges/repeat, read-only RNG)");
