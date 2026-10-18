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
// Default (real game): walking or biking into water is blocked; boarding requires HM Surf.
assert.equal(planStep(grid, -2, -1, "east", "bike").status, "blocked");
assert.equal(planStep(grid, -2, -1, "east", "bike").vehicle, "bike");
// Explicit sandbox allowAutoSurf allows automatic boarding.
assert.equal(planStep(grid, -2, -1, "east", "bike", undefined, true).vehicle, "surf");
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
// Source cardinal entry/exit barriers and inherited bridge elevation.
const terrain=new WorldGrid(5,5,-2,-2);terrain.solid.fill(0);terrain.elevations.fill(3);
const sourceConstants=await import('../../src/games/firered/generated/constants');
const directions=[['south',0,1,sourceConstants.MB_IMPASSABLE_SOUTH,sourceConstants.MB_IMPASSABLE_NORTH],
 ['north',0,-1,sourceConstants.MB_IMPASSABLE_NORTH,sourceConstants.MB_IMPASSABLE_SOUTH],
 ['west',-1,0,sourceConstants.MB_IMPASSABLE_WEST,sourceConstants.MB_IMPASSABLE_EAST],
 ['east',1,0,sourceConstants.MB_IMPASSABLE_EAST,sourceConstants.MB_IMPASSABLE_WEST]] as const;
for(const [direction,dx,dy,exit,entry]of directions){
 terrain.behaviors.fill(0);terrain.behaviors[terrain.idx(0,0)]=exit;
 assert.equal(planStep(terrain,0,0,direction,'walk').status,'blocked',`exit ${direction}`);
 terrain.behaviors.fill(0);terrain.behaviors[terrain.idx(dx,dy)]=entry;
 assert.equal(planStep(terrain,0,0,direction,'walk').status,'blocked',`entry ${direction}`);
 terrain.behaviors.fill(0);
 assert.equal(planStep(terrain,0,0,direction,'walk').status,'ready');
}
terrain.elevations[terrain.idx(1,0)]=4;
assert.equal(planStep(terrain,0,0,'east','walk').status,'blocked');
terrain.elevations[terrain.idx(1,0)]=0;
assert.equal(planStep(terrain,0,0,'east','walk').status,'ready');
terrain.elevations[terrain.idx(1,0)]=15;
assert.equal(planStep(terrain,0,0,'east','walk').status,'ready');
terrain.elevations[terrain.idx(1,0)]=3;
assert.equal(planStep(terrain,0,0,'east','walk',4).status,'blocked','elevation carried across neutral tile');
assert.equal(planStep(terrain,0,0,'east','surf',1).status,'ready','native elevation3 dismount');
console.log('Viewer directional barriers and elevation compatibility PASS (PREPARED geometry)');
