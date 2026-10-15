// PREPARED geometry isolates navigation rules; real-map/browser cases run separately.
import { strict as assert } from "node:assert";
import { WorldGrid } from "../../src/viewer/data/worldGrid";
import { planStep } from "../../src/viewer/movement";
const grid = new WorldGrid(7, 5, -3, -2);
grid.solid.fill(0);
// A front-facing ledge jumps across two cells, not from the ledge's own tile.
grid.ledge[grid.idx(0, 0)] = 1; grid.solid[grid.idx(0, 0)] = 1;
assert.deepEqual(planStep(grid, 0, -1, "south", "walk"), {x:0,y:1,jump:true,vehicle:"walk",status:"ready"});
assert.equal(planStep(grid, 0, 1, "north", "walk").status, "blocked");
grid.npc[grid.idx(0, 1)] = 1;
assert.equal(planStep(grid, 0, -1, "south", "bike").status, "blocked");
grid.npc[grid.idx(0, 1)] = 0; grid.solid[grid.idx(0, 1)] = 1;
assert.equal(planStep(grid, 0, -1, "south", "walk").status, "blocked");
grid.solid[grid.idx(0, 1)] = 0;
// Failed water/land transitions must retain the previous vehicle, including NPC blockers.
grid.water[grid.idx(-1, -1)] = 1;grid.npc[grid.idx(-1, -1)] = 1;
assert.equal(planStep(grid, -2, -1, "east", "bike").vehicle, "bike");
grid.npc[grid.idx(-1, -1)] = 0;
assert.equal(planStep(grid, -2, -1, "east", "bike").vehicle, "surf");
grid.npc[grid.idx(-2, -1)] = 1;
assert.equal(planStep(grid, -1, -1, "west", "surf").vehicle, "surf");
grid.npc[grid.idx(-2, -1)] = 0;
assert.equal(planStep(grid, -1, -1, "west", "surf").vehicle, "walk");
const sparse=new WorldGrid(20,20,-10,-10,true);
sparse.addSector("loaded",grid);
assert.equal(planStep(sparse, 3, -1, "east", "walk").status,"loading");
sparse.removeSector("loaded");
assert.equal(planStep(sparse,0,-1,"south","walk").status,"loading");
console.log("Viewer movement PASS (PREPARED ledges, landing collision, surf transitions, unloaded sectors)");
