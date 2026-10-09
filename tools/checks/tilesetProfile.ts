// The tileset split profile: FireRed (640 metatiles/tiles, 7 palettes in the primary tileset) by default, pokeemerald's 512/512/6
// after SetTilesetProfile("emerald"); and the Emerald behaviour predicates the world viewer's Hoenn mode uses.
import assert from "node:assert/strict";
import * as fieldmap from "../../src/fr/field/fieldmap";
import * as MBEmerald from "../../src/games/emerald/generated/metatileBehavior";

assert.equal(fieldmap.NUM_METATILES_IN_PRIMARY, 640);
assert.equal(fieldmap.NUM_TILES_IN_PRIMARY, 640);
assert.equal(fieldmap.NUM_PALS_IN_PRIMARY, 7);

fieldmap.SetTilesetProfile("emerald");
assert.equal(fieldmap.NUM_METATILES_IN_PRIMARY, 512); // fieldmap.h of pokeemerald
assert.equal(fieldmap.NUM_TILES_IN_PRIMARY, 512);
assert.equal(fieldmap.NUM_PALS_IN_PRIMARY, 6);
assert.equal(fieldmap.NUM_METATILES_TOTAL, 1024);

fieldmap.SetTilesetProfile("firered");
assert.equal(fieldmap.NUM_METATILES_IN_PRIMARY, 640);
assert.equal(fieldmap.NUM_PALS_IN_PRIMARY, 7);

// metatile_behavior.c of pokeemerald: a normal tile is none of these; water, grass and the ledge directions are what the layers show.
assert.equal(MBEmerald.MetatileBehavior_IsSurfableWaterOrUnderwater(MBEmerald.MB_NORMAL), false);
assert.equal(MBEmerald.MetatileBehavior_IsSurfableWaterOrUnderwater(MBEmerald.MB_POND_WATER), true);
assert.equal(MBEmerald.MetatileBehavior_IsSurfableWaterOrUnderwater(MBEmerald.MB_OCEAN_WATER), true);
assert.equal(MBEmerald.MetatileBehavior_IsTallGrass(MBEmerald.MB_TALL_GRASS), true);
assert.equal(MBEmerald.MetatileBehavior_IsTallGrass(MBEmerald.MB_NORMAL), false);
assert.equal(MBEmerald.MetatileBehavior_IsJumpEast(MBEmerald.MB_JUMP_EAST), true);
assert.equal(MBEmerald.MetatileBehavior_IsJumpEast(MBEmerald.MB_JUMP_WEST), false);
assert.equal(MBEmerald.MetatileBehavior_IsJumpNorth(MBEmerald.MB_JUMP_NORTH), true);
console.log("PASS: tileset profiles (FireRed 640/7, Emerald 512/6) and Emerald metatile behaviours.");
