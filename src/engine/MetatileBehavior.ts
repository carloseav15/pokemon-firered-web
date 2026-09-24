/** Browser-side names for the behavior IDs defined in constants/metatile_behaviors.h. */
export const MetatileBehavior = {
  NORMAL: 0x00,
  TALL_GRASS: 0x02,
  CAVE: 0x08,
  RUNNING_DISALLOWED: 0x0a,
  INDOOR_ENCOUNTER: 0x0b,
  POND_WATER: 0x10,
  FAST_WATER: 0x11,
  DEEP_WATER: 0x12,
  WATERFALL: 0x13,
  OCEAN_WATER: 0x15,
  PUDDLE: 0x16,
  SHALLOW_WATER: 0x17,
  UNDERWATER_BLOCKED_ABOVE: 0x19,
  UNUSED_WATER: 0x1a,
  CYCLING_ROAD_WATER: 0x1b,
  STRENGTH_BUTTON: 0x20,
  SAND: 0x21,
  SEAWEED: 0x22,
  ICE: 0x23,
  ROCK_STAIRS: 0x2a,
  IMPASSABLE_EAST: 0x30,
  IMPASSABLE_WEST: 0x31,
  IMPASSABLE_NORTH: 0x32,
  IMPASSABLE_SOUTH: 0x33,
  IMPASSABLE_NORTHEAST: 0x34,
  IMPASSABLE_NORTHWEST: 0x35,
  IMPASSABLE_SOUTHEAST: 0x36,
  IMPASSABLE_SOUTHWEST: 0x37,
  JUMP_EAST: 0x38,
  JUMP_WEST: 0x39,
  JUMP_NORTH: 0x3a,
  JUMP_SOUTH: 0x3b,
  WALK_EAST: 0x40,
  WALK_WEST: 0x41,
  WALK_NORTH: 0x42,
  WALK_SOUTH: 0x43,
  SLIDE_EAST: 0x44,
  SLIDE_WEST: 0x45,
  SLIDE_NORTH: 0x46,
  SLIDE_SOUTH: 0x47,
  EASTWARD_CURRENT: 0x50,
  WESTWARD_CURRENT: 0x51,
  NORTHWARD_CURRENT: 0x52,
  SOUTHWARD_CURRENT: 0x53,
  SPIN_RIGHT: 0x54,
  SPIN_LEFT: 0x55,
  SPIN_UP: 0x56,
  SPIN_DOWN: 0x57,
  STOP_SPINNING: 0x58,
  CAVE_DOOR: 0x60,
  LADDER: 0x61,
  EAST_ARROW_WARP: 0x62,
  WEST_ARROW_WARP: 0x63,
  NORTH_ARROW_WARP: 0x64,
  SOUTH_ARROW_WARP: 0x65,
  FALL_WARP: 0x66,
  REGULAR_WARP: 0x67,
  WARP_DOOR: 0x69,
  COUNTER: 0x80,
  BOOKSHELF: 0x81,
  PC: 0x83,
  SIGNPOST: 0x84,
  REGION_MAP: 0x85,
  TELEVISION: 0x86,
  COMPUTER: 0x97,
  TRASH_BIN: 0x9a,
  CYCLING_ROAD_PULL_DOWN: 0xd0,
  CYCLING_ROAD_PULL_DOWN_GRASS: 0xd1,
} as const;

const WATER: Set<number> = new Set([
  MetatileBehavior.POND_WATER,
  MetatileBehavior.FAST_WATER,
  MetatileBehavior.DEEP_WATER,
  MetatileBehavior.WATERFALL,
  MetatileBehavior.OCEAN_WATER,
  MetatileBehavior.UNUSED_WATER,
  MetatileBehavior.CYCLING_ROAD_WATER,
]);

const WARP: Set<number> = new Set([
  MetatileBehavior.CAVE_DOOR,
  MetatileBehavior.EAST_ARROW_WARP,
  MetatileBehavior.WEST_ARROW_WARP,
  MetatileBehavior.NORTH_ARROW_WARP,
  MetatileBehavior.SOUTH_ARROW_WARP,
  MetatileBehavior.FALL_WARP,
  MetatileBehavior.REGULAR_WARP,
  MetatileBehavior.WARP_DOOR,
]);

export function isWaterBehavior(behavior: number): boolean { return WATER.has(behavior); }
export function isWarpBehavior(behavior: number): boolean { return WARP.has(behavior); }
export function isTallGrassBehavior(behavior: number): boolean { return behavior === MetatileBehavior.TALL_GRASS || behavior === MetatileBehavior.CYCLING_ROAD_PULL_DOWN_GRASS; }
export function isInteractionBehavior(behavior: number): boolean { return behavior >= MetatileBehavior.COUNTER && behavior <= MetatileBehavior.TRASH_BIN; }
export function isSurfableBehavior(behavior: number): boolean { return WATER.has(behavior) || behavior === MetatileBehavior.EASTWARD_CURRENT || behavior === MetatileBehavior.WESTWARD_CURRENT || behavior === MetatileBehavior.NORTHWARD_CURRENT || behavior === MetatileBehavior.SOUTHWARD_CURRENT; }
export function isJumpBehavior(behavior: number, direction: string): boolean {
  return (direction === "east" && behavior === MetatileBehavior.JUMP_EAST) || (direction === "west" && behavior === MetatileBehavior.JUMP_WEST) || (direction === "north" && behavior === MetatileBehavior.JUMP_NORTH) || (direction === "south" && behavior === MetatileBehavior.JUMP_SOUTH);
}
export function isDirectionalBlocked(behavior: number, direction: string): boolean {
  if (direction === "east") return behavior === MetatileBehavior.IMPASSABLE_EAST || behavior === MetatileBehavior.IMPASSABLE_NORTHEAST || behavior === MetatileBehavior.IMPASSABLE_SOUTHEAST;
  if (direction === "west") return behavior === MetatileBehavior.IMPASSABLE_WEST || behavior === MetatileBehavior.IMPASSABLE_NORTHWEST || behavior === MetatileBehavior.IMPASSABLE_SOUTHWEST;
  if (direction === "north") return behavior === MetatileBehavior.IMPASSABLE_NORTH || behavior === MetatileBehavior.IMPASSABLE_NORTHEAST || behavior === MetatileBehavior.IMPASSABLE_NORTHWEST;
  return behavior === MetatileBehavior.IMPASSABLE_SOUTH || behavior === MetatileBehavior.IMPASSABLE_SOUTHEAST || behavior === MetatileBehavior.IMPASSABLE_SOUTHWEST;
}
export function forcedDirection(behavior: number): "north" | "south" | "west" | "east" | undefined {
  if (behavior === MetatileBehavior.WALK_EAST || behavior === MetatileBehavior.SLIDE_EAST || behavior === MetatileBehavior.EASTWARD_CURRENT) return "east";
  if (behavior === MetatileBehavior.WALK_WEST || behavior === MetatileBehavior.SLIDE_WEST || behavior === MetatileBehavior.WESTWARD_CURRENT) return "west";
  if (behavior === MetatileBehavior.WALK_NORTH || behavior === MetatileBehavior.SLIDE_NORTH || behavior === MetatileBehavior.NORTHWARD_CURRENT) return "north";
  if (behavior === MetatileBehavior.WALK_SOUTH || behavior === MetatileBehavior.SLIDE_SOUTH || behavior === MetatileBehavior.SOUTHWARD_CURRENT) return "south";
  return undefined;
}
