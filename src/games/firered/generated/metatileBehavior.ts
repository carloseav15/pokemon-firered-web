// Generated from pokefirered src/metatile_behavior.c by tools/decomp/step_codegen.py.
// Do not edit by hand.
/* eslint-disable */
// @ts-nocheck

export const DIR_NORTH = 2;
export const MB_ADVERTISING_POSTER = 152;
export const MB_BATTLE_RECORDS = 142;
export const MB_BLINKING_LIGHTS = 158;
export const MB_BLUEPRINTS = 147;
export const MB_BOOKSHELF = 129;
export const MB_BURGLARY = 162;
export const MB_CABINET = 137;
export const MB_CABLE_CLUB_WIRELESS_MONITOR = 141;
export const MB_CAVE_DOOR = 96;
export const MB_COMPUTER = 151;
export const MB_COUNTER = 128;
export const MB_CRACKED_ICE = 39;
export const MB_CUP = 155;
export const MB_CYCLING_ROAD_PULL_DOWN = 208;
export const MB_CYCLING_ROAD_PULL_DOWN_GRASS = 209;
export const MB_CYCLING_ROAD_WATER = 27;
export const MB_DEEP_WATER = 18;
export const MB_DOWN_ESCALATOR = 107;
export const MB_DOWN_LEFT_STAIR_WARP = 111;
export const MB_DOWN_RIGHT_STAIR_WARP = 110;
export const MB_DRESSER = 139;
export const MB_EASTWARD_CURRENT = 80;
export const MB_EAST_ARROW_WARP = 98;
export const MB_FALL_WARP = 102;
export const MB_FAST_WATER = 17;
export const MB_FOOD = 144;
export const MB_FOOD_SMELLS_TASTY = 153;
export const MB_HOT_SPRINGS = 40;
export const MB_ICE = 35;
export const MB_IMPASSABLE_EAST = 48;
export const MB_IMPASSABLE_NORTH = 50;
export const MB_IMPASSABLE_NORTHEAST = 52;
export const MB_IMPASSABLE_NORTHWEST = 53;
export const MB_IMPASSABLE_SOUTH = 51;
export const MB_IMPASSABLE_SOUTHEAST = 54;
export const MB_IMPASSABLE_SOUTHWEST = 55;
export const MB_IMPASSABLE_WEST = 49;
export const MB_IMPRESSIVE_MACHINE = 160;
export const MB_INDIGO_PLATEAU_SIGN_1 = 145;
export const MB_INDIGO_PLATEAU_SIGN_2 = 146;
export const MB_INDOOR_ENCOUNTER = 11;
export const MB_JUMP_EAST = 56;
export const MB_JUMP_NORTH = 58;
export const MB_JUMP_SOUTH = 59;
export const MB_JUMP_WEST = 57;
export const MB_KITCHEN = 138;
export const MB_LADDER = 97;
export const MB_LAVARIDGE_1F_WARP = 104;
export const MB_MOUNTAIN_TOP = 12;
export const MB_NEATLY_LINED_UP_TOOLS = 159;
export const MB_NORTHWARD_CURRENT = 82;
export const MB_NORTH_ARROW_WARP = 100;
export const MB_OCEAN_WATER = 21;
export const MB_PAINTING = 148;
export const MB_PC = 131;
export const MB_POKEMART_SHELF = 130;
export const MB_POKEMART_SIGN = 136;
export const MB_POKEMON_CENTER_SIGN = 135;
export const MB_POND_WATER = 16;
export const MB_POWER_PLANT_MACHINE = 149;
export const MB_PUDDLE = 22;
export const MB_QUESTIONNAIRE = 143;
export const MB_REGION_MAP = 133;
export const MB_REGULAR_WARP = 103;
export const MB_ROCK_STAIRS = 42;
export const MB_RUNNING_DISALLOWED = 10;
export const MB_SAND = 33;
export const MB_SAND_CAVE = 43;
export const MB_SEAWEED = 34;
export const MB_SHALLOW_WATER = 23;
export const MB_SIGNPOST = 132;
export const MB_SLIDE_EAST = 68;
export const MB_SLIDE_NORTH = 70;
export const MB_SLIDE_SOUTH = 71;
export const MB_SLIDE_WEST = 69;
export const MB_SNACKS = 140;
export const MB_SOUTHWARD_CURRENT = 83;
export const MB_SOUTH_ARROW_WARP = 101;
export const MB_SPIN_DOWN = 87;
export const MB_SPIN_LEFT = 85;
export const MB_SPIN_RIGHT = 84;
export const MB_SPIN_UP = 86;
export const MB_STOP_SPINNING = 88;
export const MB_STRENGTH_BUTTON = 32;
export const MB_TALL_GRASS = 2;
export const MB_TELEPHONE = 150;
export const MB_TELEVISION = 134;
export const MB_THIN_ICE = 38;
export const MB_TRAINER_TOWER_MONITOR = 163;
export const MB_TRASH_BIN = 154;
export const MB_TRICK_HOUSE_PUZZLE_8_FLOOR = 72;
export const MB_UNDERWATER_BLOCKED_ABOVE = 25;
export const MB_UNION_ROOM_WARP = 113;
export const MB_UNUSED_01 = 1;
export const MB_UNUSED_WATER = 26;
export const MB_UP_ESCALATOR = 106;
export const MB_UP_LEFT_STAIR_WARP = 109;
export const MB_UP_RIGHT_STAIR_WARP = 108;
export const MB_VIDEO_GAME = 161;
export const MB_WALK_EAST = 64;
export const MB_WALK_NORTH = 66;
export const MB_WALK_SOUTH = 67;
export const MB_WALK_WEST = 65;
export const MB_WARP_DOOR = 105;
export const MB_WATERFALL = 19;
export const MB_WESTWARD_CURRENT = 81;
export const MB_WEST_ARROW_WARP = 99;

const sBehaviorSurfable: Record<number, number> = {
  [MB_POND_WATER]: 1,
  [MB_FAST_WATER]: 1,
  [MB_DEEP_WATER]: 1,
  [MB_WATERFALL]: 1,
  [MB_OCEAN_WATER]: 1,
  [MB_UNUSED_WATER]: 1,
  [MB_CYCLING_ROAD_WATER]: 1,
  [MB_EASTWARD_CURRENT]: 1,
  [MB_WESTWARD_CURRENT]: 1,
  [MB_NORTHWARD_CURRENT]: 1,
  [MB_SOUTHWARD_CURRENT]: 1,
};

const sTileBitAttributes: Record<number, number> = {
  [0]: 0,
  [1]: 1 << 0,
  [2]: 1 << 1,
  [3]: 1 << 2,
  [4]: 1 << 3,
};

export function MetatileBehavior_IsATile(metatileBehavior: number): boolean
{
    return true;
}

export function MetatileBehavior_IsJumpEast(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_JUMP_EAST)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsJumpWest(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_JUMP_WEST)
            return true;
        else
            return false;
}

export function MetatileBehavior_IsJumpNorth(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_JUMP_NORTH)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsJumpSouth(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_JUMP_SOUTH)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsPokeGrass(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_TALL_GRASS || metatileBehavior == MB_CYCLING_ROAD_PULL_DOWN_GRASS)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsSand(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_SAND || metatileBehavior == MB_SAND_CAVE)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsSandOrShallowFlowingWater(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_SAND || metatileBehavior == MB_SHALLOW_WATER)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsDeepSand(metatileBehavior: number): boolean
{ return false; }

export function MetatileBehavior_IsReflective(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_POND_WATER
     || metatileBehavior == MB_PUDDLE
     || metatileBehavior == MB_UNUSED_WATER
     || metatileBehavior == MB_CYCLING_ROAD_WATER
     || metatileBehavior == MB_ICE)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsIce(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_ICE)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsWarpDoor(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_WARP_DOOR)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsWarpDoor_2(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_WARP_DOOR)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsEscalator(metatileBehavior: number): boolean
{
    if (metatileBehavior >= MB_UP_ESCALATOR && metatileBehavior <= MB_DOWN_ESCALATOR)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsDirectionalUpRightStairWarp(metatileBehavior: number): boolean
{
    let result = false;

    if (metatileBehavior == MB_UP_RIGHT_STAIR_WARP)
        result = true;

    return result;
}

export function MetatileBehavior_IsDirectionalUpLeftStairWarp(metatileBehavior: number): boolean
{
    let result = false;

    if (metatileBehavior == MB_UP_LEFT_STAIR_WARP)
        result = true;

    return result;
}

export function MetatileBehavior_IsDirectionalDownRightStairWarp(metatileBehavior: number): boolean
{
    let result = false;

    if (metatileBehavior == MB_DOWN_RIGHT_STAIR_WARP)
        result = true;

    return result;
}

export function MetatileBehavior_IsDirectionalDownLeftStairWarp(metatileBehavior: number): boolean
{
    let result = false;

    if (metatileBehavior == MB_DOWN_LEFT_STAIR_WARP)
        result = true;

    return result;
}

export function MetatileBehavior_IsDirectionalStairWarp(metatileBehavior: number): boolean
{
    let result = false;

    if (metatileBehavior >= MB_UP_RIGHT_STAIR_WARP && metatileBehavior <= MB_DOWN_LEFT_STAIR_WARP)
        result = true;
    else
        result = false;

    return result;
}

export function MetatileBehavior_IsLadder(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_LADDER)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsNonAnimDoor(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_CAVE_DOOR)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsDeepSouthWarp(metatileBehavior: number): boolean
{ return false; }

export function MetatileBehavior_IsSurfable(metatileBehavior: number): boolean
{
    if (sBehaviorSurfable[metatileBehavior] & 1)
        return true;
    else
        return false;
}


export function MetatileBehavior_IsFastWater(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_FAST_WATER)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsEastArrowWarp(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_EAST_ARROW_WARP)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsWestArrowWarp(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_WEST_ARROW_WARP)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsNorthArrowWarp(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_NORTH_ARROW_WARP)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsSouthArrowWarp(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_SOUTH_ARROW_WARP)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsArrowWarp(metatileBehavior: number): boolean
{
    let result = false;

    if (MetatileBehavior_IsEastArrowWarp(metatileBehavior)
     || MetatileBehavior_IsWestArrowWarp(metatileBehavior)
     || MetatileBehavior_IsNorthArrowWarp(metatileBehavior)
     || MetatileBehavior_IsSouthArrowWarp(metatileBehavior))
        result = true;

    return result;
}

export function MetatileBehavior_IsForcedMovementTile(metatileBehavior: number): boolean
{
    if ((metatileBehavior >= MB_WALK_EAST && metatileBehavior <= MB_TRICK_HOUSE_PUZZLE_8_FLOOR)
      || (metatileBehavior >= MB_EASTWARD_CURRENT && metatileBehavior <= MB_SOUTHWARD_CURRENT)
      ||  metatileBehavior == MB_WATERFALL
      ||  metatileBehavior == MB_ICE
      || (metatileBehavior >= MB_SPIN_RIGHT && metatileBehavior <= MB_SPIN_DOWN))
            return true;
    else
        return false;
}

export function MetatileBehavior_IsIce_2(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_ICE)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsTrickHouseSlipperyFloor(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_TRICK_HOUSE_PUZZLE_8_FLOOR)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsWalkNorth(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_WALK_NORTH)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsWalkSouth(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_WALK_SOUTH)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsWalkWest(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_WALK_WEST)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsWalkEast(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_WALK_EAST)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsNorthwardCurrent(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_NORTHWARD_CURRENT)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsSouthwardCurrent(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_SOUTHWARD_CURRENT)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsWestwardCurrent(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_WESTWARD_CURRENT)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsEastwardCurrent(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_EASTWARD_CURRENT)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsSlideNorth(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_SLIDE_NORTH)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsSlideSouth(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_SLIDE_SOUTH)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsSlideWest(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_SLIDE_WEST)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsSlideEast(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_SLIDE_EAST)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsCounter(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_COUNTER)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsPlayerFacingTVScreen(metatileBehavior: number, playerDirection: number): boolean
{
    if (playerDirection != DIR_NORTH)
        return false;
    else if (metatileBehavior == MB_TELEVISION)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsPC(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_PC)
        return true;
    else
        return false;
}

export function MetatileBehavior_HasRipples(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_POND_WATER || metatileBehavior == MB_PUDDLE)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsPuddle(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_PUDDLE)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsTallGrass(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_TALL_GRASS || metatileBehavior == MB_CYCLING_ROAD_PULL_DOWN_GRASS)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsLongGrass(metatileBehavior: number): boolean
{ return false; }
export function MetatileBehavior_IsAshGrass(metatileBehavior: number): boolean
{ return false; }
export function MetatileBehavior_IsFootprints(metatileBehavior: number): boolean
{ return false; }
export function MetatileBehavior_IsBridge(metatileBehavior: number): boolean
{ return false; }
export function MetatileBehavior_GetBridgeType(metatileBehavior: number): boolean
{ return false; }

export function MetatileBehavior_IsUnused01(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_UNUSED_01)
        return true;
    else
        return false;
}

export function MetatileBehavior_UnusedIsTallGrass(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_TALL_GRASS)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsIndoorEncounter(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_INDOOR_ENCOUNTER)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsMountain(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_MOUNTAIN_TOP)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsDiveable(metatileBehavior: number): boolean
{
    if (metatileBehavior >= MB_FAST_WATER && metatileBehavior <= MB_DEEP_WATER)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsUnableToEmerge(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_UNDERWATER_BLOCKED_ABOVE)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsShallowFlowingWater(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_SHALLOW_WATER)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsThinIce(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_THIN_ICE)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsCrackedIce(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_CRACKED_ICE)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsDeepWaterTerrain(metatileBehavior: number): boolean
{
    if ((metatileBehavior >= MB_FAST_WATER && metatileBehavior <= MB_DEEP_WATER)
      || metatileBehavior == MB_OCEAN_WATER)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsUnusedWater(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_UNUSED_WATER)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsSurfableAndNotWaterfall(metatileBehavior: number): boolean
{
    if (MetatileBehavior_IsSurfable(metatileBehavior)
        && !MetatileBehavior_IsWaterfall(metatileBehavior))
            return true;
    else
        return false;
}

export function MetatileBehavior_IsEastBlocked(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_IMPASSABLE_EAST
     || metatileBehavior == MB_IMPASSABLE_NORTHEAST
     || metatileBehavior == MB_IMPASSABLE_SOUTHEAST)
            return true;
    else
        return false;
}

export function MetatileBehavior_IsWestBlocked(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_IMPASSABLE_WEST
     || metatileBehavior == MB_IMPASSABLE_NORTHWEST
     || metatileBehavior == MB_IMPASSABLE_SOUTHWEST)
            return true;
    else
        return false;
}

export function MetatileBehavior_IsNorthBlocked(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_IMPASSABLE_NORTH
     || metatileBehavior == MB_IMPASSABLE_NORTHEAST
     || metatileBehavior == MB_IMPASSABLE_NORTHWEST)
            return true;
    else
        return false;
}

export function MetatileBehavior_IsSouthBlocked(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_IMPASSABLE_SOUTH
     || metatileBehavior == MB_IMPASSABLE_SOUTHEAST
     || metatileBehavior == MB_IMPASSABLE_SOUTHWEST)
            return true;
    else
        return false;
}

export function MetatileBehavior_IsShortGrass(metatileBehavior: number): boolean
{ return false; }

export function MetatileBehavior_IsHotSprings(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_HOT_SPRINGS)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsWaterfall(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_WATERFALL)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsFortreeBridge(metatileBehavior: number): boolean
{ return false; }
export function MetatileBehavior_IsPacifidlogVerticalLogTop(metatileBehavior: number): boolean
{ return false; }
export function MetatileBehavior_IsPacifidlogVerticalLogBottom(metatileBehavior: number): boolean
{ return false; }
export function MetatileBehavior_IsPacifidlogHorizontalLogLeft(metatileBehavior: number): boolean
{ return false; }
export function MetatileBehavior_IsPacifidlogHorizontalLogRight(metatileBehavior: number): boolean
{ return false; }
export function MetatileBehavior_IsPacifidlogLog(metatileBehavior: number): boolean
{ return false; }
export function MetatileBehavior_IsTrickHousePuzzleDoor(metatileBehavior: number): boolean
{ return false; }

export function MetatileBehavior_IsRegionMap(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_REGION_MAP)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsRoulette(metatileBehavior: number): boolean
{ return false; }
export function MetatileBehavior_IsPokeblockFeeder(metatileBehavior: number): boolean
{ return false; }
export function MetatileBehavior_IsSecretBaseJumpMat(metatileBehavior: number): boolean
{ return false; }
export function MetatileBehavior_IsSecretBaseSpinMat(metatileBehavior: number): boolean
{ return false; }
export function MetatileBehavior_IsLavaridgeB1FWarp(metatileBehavior: number): boolean
{ return false; }

export function MetatileBehavior_IsLavaridge1FWarp(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_LAVARIDGE_1F_WARP)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsWarpPad(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_REGULAR_WARP)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsUnionRoomWarp(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_UNION_ROOM_WARP)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsWater(metatileBehavior: number): boolean
{
    if ((metatileBehavior >= MB_POND_WATER && metatileBehavior <= MB_DEEP_WATER)
     ||  metatileBehavior == MB_OCEAN_WATER
     || (metatileBehavior >= MB_EASTWARD_CURRENT && metatileBehavior <= MB_SOUTHWARD_CURRENT))
            return true;
    else
        return false;
}

export function MetatileBehavior_IsFallWarp(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_FALL_WARP)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsCrackedFloor(metatileBehavior: number): boolean
{ return false; }

export function MetatileBehavior_IsCyclingRoadPullDownTile(metatileBehavior: number): boolean
{
    if (metatileBehavior >= MB_CYCLING_ROAD_PULL_DOWN && metatileBehavior <= MB_CYCLING_ROAD_PULL_DOWN_GRASS)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsCyclingRoadPullDownTileGrass(metatileBehavior: number): boolean
{
    return metatileBehavior == MB_CYCLING_ROAD_PULL_DOWN_GRASS;
}

export function MetatileBehavior_IsBumpySlope(metatileBehavior: number): boolean
{ return false; }
export function MetatileBehavior_IsIsolatedVerticalRail(metatileBehavior: number): boolean
{ return false; }
export function MetatileBehavior_IsIsolatedHorizontalRail(metatileBehavior: number): boolean
{ return false; }
export function MetatileBehavior_IsVerticalRail(metatileBehavior: number): boolean
{ return false; }
export function MetatileBehavior_IsHorizontalRail(metatileBehavior: number): boolean
{ return false; }

export function MetatileBehavior_IsSeaweed(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_SEAWEED)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsRunningDisallowed(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_RUNNING_DISALLOWED)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsPictureBookShelf(metatileBehavior: number): boolean
{ return false; }

export function MetatileBehavior_IsBookshelf(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_BOOKSHELF)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsPokeMartShelf(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_POKEMART_SHELF)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsPlayerFacingPokemonCenterSign(metatileBehavior: number, playerDirection: number): boolean
{
    if (playerDirection != DIR_NORTH)
        return false;
    else if (metatileBehavior == MB_POKEMON_CENTER_SIGN)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsPlayerFacingPokeMartSign(metatileBehavior: number, playerDirection: number): boolean
{
    if (playerDirection != DIR_NORTH)
        return false;
    else if (metatileBehavior == MB_POKEMART_SIGN)
        return true;
    else
        return false;
}

export function MetatileBehavior_UnknownDummy1(metatileBehavior: number): boolean
{ return false; }
export function MetatileBehavior_UnknownDummy2(metatileBehavior: number): boolean
{ return false; }
export function MetatileBehavior_UnknownDummy3(metatileBehavior: number): boolean
{ return false; }
export function MetatileBehavior_UnknownDummy4(metatileBehavior: number): boolean
{ return false; }

export function TestMetatileAttributeBit(arg1: number, arg2: number): boolean
{
    if (sTileBitAttributes[arg1] & arg2)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsSpinRight(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_SPIN_RIGHT)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsSpinLeft(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_SPIN_LEFT)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsSpinUp(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_SPIN_UP)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsSpinDown(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_SPIN_DOWN)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsStopSpinning(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_STOP_SPINNING)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsSpinTile(metatileBehavior: number): boolean
{
    let result = false;

    if (metatileBehavior >= MB_SPIN_RIGHT && metatileBehavior <= MB_SPIN_DOWN)
        result = true;
    else
        result = false;

    return result;
}

export function MetatileBehavior_IsSignpost(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_SIGNPOST)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsCabinet(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_CABINET)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsKitchen(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_KITCHEN)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsDresser(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_DRESSER)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsSnacks(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_SNACKS)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsStrengthButton(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_STRENGTH_BUTTON)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsPlayerFacingCableClubWirelessMonitor(metatileBehavior: number, playerDirection: number): boolean
{
    if (playerDirection != DIR_NORTH)
        return false;
    else if (metatileBehavior == MB_CABLE_CLUB_WIRELESS_MONITOR)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsPlayerFacingBattleRecords(metatileBehavior: number, playerDirection: number): boolean
{
    if (playerDirection != DIR_NORTH)
        return false;
    else if (metatileBehavior == MB_BATTLE_RECORDS)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsQuestionnaire(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_QUESTIONNAIRE)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsIndigoPlateauSign1(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_INDIGO_PLATEAU_SIGN_1)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsIndigoPlateauSign2(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_INDIGO_PLATEAU_SIGN_2)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsFood(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_FOOD)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsRockStairs(metatileBehavior: number): boolean
{
    let result = false;

    if (metatileBehavior == MB_ROCK_STAIRS)
        result = true;
    else
        result = false;

    return result;
}

export function MetatileBehavior_IsBlueprints(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_BLUEPRINTS)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsPainting(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_PAINTING)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsPowerPlantMachine(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_POWER_PLANT_MACHINE)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsTelephone(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_TELEPHONE)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsComputer(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_COMPUTER)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsAdvertisingPoster(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_ADVERTISING_POSTER)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsTastyFood(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_FOOD_SMELLS_TASTY)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsTrashBin(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_TRASH_BIN)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsCup(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_CUP)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsPolishedWindow(metatileBehavior: number): boolean
{ return false; }
export function MetatileBehavior_IsBeautifulSkyWindow(metatileBehavior: number): boolean
{ return false; }

export function MetatileBehavior_IsBlinkingLights(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_BLINKING_LIGHTS)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsNeatlyLinedUpTools(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_NEATLY_LINED_UP_TOOLS)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsImpressiveMachine(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_IMPRESSIVE_MACHINE)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsVideoGame(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_VIDEO_GAME)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsBurglary(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_BURGLARY)
        return true;
    else
        return false;
}

export function MetatileBehavior_IsTrainerTowerMonitor(metatileBehavior: number): boolean
{
    if (metatileBehavior == MB_TRAINER_TOWER_MONITOR)
        return true;
    else
        return false;
}
