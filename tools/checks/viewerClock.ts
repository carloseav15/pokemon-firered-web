// PREPARED RAF timestamps validate scheduling; no real-browser timing/parity claim.
import { strict as assert } from "node:assert";
import { ViewerClock } from "../../src/viewer/clock";
import { GBA_FRAME_MS } from "../../src/viewer/constants";
import { validateEffectAnimation } from "../../src/viewer/data/fieldFxTemplates";
let next: ((now: number) => void) | null = null;
const clock = new ViewerClock({ request: callback => { next = callback; return 1; }, cancel: () => { next = null; } });
const fire = (now: number) => { const callback = next; assert(callback); next = null; callback(now); };
let ticks = 0;
const received: Array<{ tick: number; deltaMs: number }> = [];
const off = clock.subscribe(frame => { ticks++; received.push(frame); });
fire(0); fire(GBA_FRAME_MS * 3);
assert.equal(ticks, 3);
received.forEach((frame, i) => { assert.equal(frame.tick, i + 1); assert.equal(frame.deltaMs, GBA_FRAME_MS); });
clock.pause("manual"); clock.pause("visibility");
assert.equal(next, null); clock.resume("manual"); assert.equal(next, null);
clock.resume("visibility"); fire(100000); assert.equal(ticks, 3);
fire(100000 + GBA_FRAME_MS); assert.equal(ticks, 4);
off(); off(); assert.equal(clock.subscriberCount, 0); assert.equal(next, null);
const off2 = clock.subscribe(() => {}); fire(200000); assert.equal(clock.tick, 4);
fire(200000 + 10000); assert.equal(clock.tick, 12); // Long visible stalls bounded to 8 ticks.
off2();
assert.throws(() => validateEffectAnimation([["L", 2]], 1, "PREPARED"), /unsupported/);
assert.throws(() => validateEffectAnimation([["J", 0]], 1, "PREPARED"), /control-only/);
assert.throws(() => validateEffectAnimation([["F", 1, 1, 0, 0], ["E"]], 1, "PREPARED"), /invalid/);
assert.throws(() => validateEffectAnimation([["F", 0, 0, 0, 0], ["E"]], 1, "PREPARED"), /invalid/);
assert.throws(() => validateEffectAnimation([["J", 3]], 1, "PREPARED"), /invalid/);
assert.deepEqual(validateEffectAnimation([["F", 0, 2, 1, 1], ["J", 0]], 1, "PREPARED"), [["F", 0, 2, 1, 1], ["J", 0]]);
console.log("Viewer clock pause/cancellation and command rejection PASS (PREPARED timestamps)");
