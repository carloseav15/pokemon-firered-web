// PREPARED small grids and controlled promises exercise streaming boundaries and stale loads.
import { strict as assert } from "node:assert";
import { WorldGrid } from "../../src/viewer/data/worldGrid";
import { nearbySectors, SectorLoader } from "../../src/viewer/data/sectors";
const world = new WorldGrid(100000, 100000, -50, -50, true);
assert.equal(world.retainedBytes, 0);
assert.equal(world.isWalkable(0, 0, "surf"), false);
const town = new WorldGrid(2, 2, -2, -1);
town.solid.fill(0); town.water[1] = 1; town.behaviors[0] = 42; town.ledge[2] = 1; town.npc[3] = 1; town.elevations[0] = 4;
world.addSector("town", town);
assert.equal(world.retainedBytes, 40);
assert.equal(world.isWalkable(-2, -1, "walk"), true);
assert.equal(world.isWalkable(-1, -1, "walk"), false);
assert.equal(world.isWalkable(-1, -1, "surf"), true);
assert.equal(world.isWalkable(-1, 0, "walk"), false);
assert.equal(world.behaviorAt(-2, -1), 42);
assert.equal(world.elevationAt(-2, -1), 4);
assert.equal(world.elevationAt(0, 0), 15);
assert.equal(world.ledgeDirection(-2, 0), 1);
assert.equal(world.isLoaded(0, 0), false);
world.removeSector("town");
assert.equal(world.retainedBytes, 0);
assert.equal(world.isWalkable(-2, -1, "walk"), false);
assert.equal(world.behaviorAt(-2, -1), 0);
assert.deepEqual(nearbySectors({ a: { x: -10, y: 0, width: 5, height: 5 }, b: { x: 8, y: 0, width: 4, height: 4 }, c: { x: 100, y: 0, width: 4, height: 4 } }, { x: 0, y: 0, width: 10, height: 10 }, 6), ["b", "a"]);
const events: string[] = [];
let release!: () => void;
const loader = new SectorLoader(async id => {
  events.push(`load:${id}`);
  if (id === "old") await new Promise<void>(resolve => { release = resolve; });
  return { bytes: 64, dispose: () => { events.push(`dispose:${id}`); } };
});
const pending = loader.update(["old"]);
void loader.update(["new"]);
release(); await pending;
assert.deepEqual(loader.ids, ["new"]);
assert.deepEqual(events, ["load:old", "dispose:old", "load:new"]);
assert.equal(loader.bytes, 64);
await loader.update(["new"]);
assert.equal(events.length, 3);
loader.dispose(); assert.equal(loader.bytes, 0);
let tries = 0;
let now = 0;
const retry = new SectorLoader(async () => { if (++tries === 1) throw Error("PREPARED HTTP failure"); return { bytes: 1, dispose() {} }; }, () => {}, () => now);
await retry.update(["map"]); assert.match(retry.error, /HTTP failure/); assert.equal(tries, 1);
await retry.update(["map"]); assert.equal(tries, 1); // Repeated camera updates cannot hammer a failed URL.
now = 1000;
await retry.update(["map"]); assert.equal(retry.error, ""); assert.equal(retry.bytes, 1);
retry.dispose();

let releaseDisposed!: () => void;
let disposedLate = false;
const closing = new SectorLoader(async () => {
  await new Promise<void>(resolve => { releaseDisposed = resolve; });
  return { bytes: 5, dispose() { disposedLate = true; } };
});
const inFlight = closing.update(["map"]); closing.dispose(); releaseDisposed(); await inFlight;
assert.equal(disposedLate, true); assert.deepEqual(closing.ids, []);
console.log("Viewer sectors PASS: PREPARED sparse grids, eviction, stale async result and retry");
